import Router from '@koa/router';
import ExcelJS from 'exceljs';
import { AnswerModel, LEADER_COMPREHENSIVE_SEQ, LEADER_PERFORMANCE_SEQ, type AnswerRow } from '../model/answer.js';
import { RelationModel, type RelationRow } from '../model/relation.js';
import { SelfQuestionModel, type QuestionItem } from '../model/self_question.js';
import { BatchModel } from '../model/batch.js';
import { PersonalSummaryModel } from '../model/personal_summary.js';
import { buildStatistics, type StatisticsRow } from '../service/statistics.js';
import { success, fail } from '../utils/response.js';
import { auth } from '../middleware/auth.js';
import { execute, queryAll, transaction, type DbExecutor } from '../db/query.js';
import {
  getGradePolicyForRelation,
  previewDetailedGradeSubmission,
  submitDetailedItems,
} from '../service/gradedAnswerSubmission.js';
import {
  buildQuestionContextFromReadContext,
  canEvaluateFromContext,
  loadEvaluationReadContext,
  type EvaluationReadContext,
} from '../service/answerReadContext.js';
import type { Context } from 'koa';
import {
  findRevokeConsumers,
  lockAndValidateEvaluationDependencies,
} from '../service/evaluationDependencies.js';
import {
  classifyEvaluationRelation,
  withEvaluationCapabilities,
} from '../service/evaluationScene.js';

const router = new Router({ prefix: '/api/v1/answer' });

router.use(auth);

function getUserId(ctx: Context): number {
  return (ctx.state as any).userId;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isOneDecimal(value: number): boolean {
  return Number.isFinite(value) && Math.abs(Math.round(value * 10) - value * 10) < 0.0001;
}

function totalOfAnswers(answers: AnswerRow[]): number | null {
  const total = answers.find(a => a.is_total === 1);
  return total?.score ?? null;
}

function isLeaderTotalRelation(relation: RelationRow): boolean {
  return relation.eval_type === 'downward'
    && (relation.evaluator_level === 'division_leader' || relation.evaluator_level === 'main_leader')
    && (relation.target_level === 'staff' || relation.target_level === 'manager');
}

async function canEvaluate(relation: RelationRow): Promise<{ ok: boolean; reason?: string }> {
  return canEvaluateFromContext(relation, await loadEvaluationReadContext([relation]));
}

async function buildQuestionContext(relation: RelationRow) {
  const readContext = await loadEvaluationReadContext([relation]);
  return buildQuestionContextFromReadContext(relation, readContext);
}

async function questionSetForRelation(relation: RelationRow): Promise<QuestionItem[]> {
  const sq = await SelfQuestionModel.findByBatchAndUser(relation.batch_id, relation.target_id);
  if (!sq) return [];
  const exportRow = SelfQuestionModel.toExportFormat([sq])[0];
  if (classifyEvaluationRelation(relation).answer_mode === 'comprehensive_detailed') {
    return exportRow.comprehensive_questions;
  }
  if (isLeaderTotalRelation(relation)) return [];
  return exportRow.questions;
}

async function validateDetailedAnswers(relation: RelationRow, answers: any[], draft: boolean): Promise<string | null> {
  const questions = await questionSetForRelation(relation);
  if (questions.length === 0) return '该评价关系不支持逐题评分';
  const bySeq = new Map<number, number>();
  for (const a of answers) {
    const seq = Number(a.seq ?? a.question_seq ?? a.answer_seq);
    const score = Number(a.score);
    if (!Number.isFinite(seq) || !Number.isFinite(score)) return '评分数据格式不正确';
    if (score < 0) return '评分不能为负数';
    if (!isOneDecimal(score)) return '评分最多支持 1 位小数';
    bySeq.set(seq, round1(score));
  }
  if (!draft && questions.some(q => !bySeq.has(q.answer_seq))) return '正式提交前必须完成所有题目评分';
  for (const q of questions) {
    const score = bySeq.get(q.answer_seq);
    if (score === undefined) continue;
    if (score > q.weight) return `${q.section === 'performance' ? '业绩' : '综合'}第 ${q.seq} 题不能超过 ${q.weight} 分`;
  }
  return null;
}

function normalizeDetailedAnswers(answers: any[]): Array<{ seq: number; score: number }> {
  return answers
    .map(a => ({ seq: Number(a.seq ?? a.question_seq ?? a.answer_seq), score: round1(Number(a.score)) }))
    .filter(a => Number.isFinite(a.seq) && Number.isFinite(a.score));
}

async function submitDetailed(relation: RelationRow, answers: any[], draft: boolean): Promise<void> {
  const normalized = answers
    .map(a => ({ seq: Number(a.seq ?? a.question_seq ?? a.answer_seq), score: round1(Number(a.score)) }))
    .filter(a => Number.isFinite(a.seq) && Number.isFinite(a.score));
  await submitDetailedItems([{ relation, answers: normalized, draft }]);
}

function validateTotalAnswer(relation: RelationRow, score: unknown): { ok: boolean; score?: number; message?: string } {
  const numericScore = Number(score);
  if (!isLeaderTotalRelation(relation)) return { ok: false, message: '该评价关系不支持总分评价，请按题目逐项评分' };
  if (!Number.isFinite(numericScore)) return { ok: false, message: '分数格式不正确' };
  if (!isOneDecimal(numericScore)) return { ok: false, message: '评分最多支持 1 位小数' };
  if (numericScore < 0 || numericScore > 30) return { ok: false, message: '分数必须在 0~30 之间' };
  return { ok: true, score: round1(numericScore) };
}

function validateLeaderTotals(relation: RelationRow, performance: unknown, comprehensive: unknown) {
  if (!isLeaderTotalRelation(relation)) return { ok: false, message: '该评价关系不支持领导总分评价' };
  const performanceScore = Number(performance);
  const comprehensiveScore = Number(comprehensive);
  if (!isOneDecimal(performanceScore) || !isOneDecimal(comprehensiveScore)) {
    return { ok: false, message: '业绩和综合评分最多支持 1 位小数' };
  }
  if (performanceScore < 0 || performanceScore > 70) return { ok: false, message: '业绩评分必须在 0~70 之间' };
  if (comprehensiveScore < 0 || comprehensiveScore > 30) return { ok: false, message: '综合评分必须在 0~30 之间' };
  return { ok: true, performance: round1(performanceScore), comprehensive: round1(comprehensiveScore) };
}

async function submitTotal(relation: RelationRow, score: number, draft: boolean): Promise<void> {
  await transaction(async tx => {
    if (!draft) await lockAndValidateEvaluationDependencies(tx, [relation]);
    else await tx.queryOne('SELECT id FROM relation WHERE id = ? FOR UPDATE', [relation.id]);
    await tx.execute('DELETE FROM answer WHERE relation_id = ? AND is_total = 1', [relation.id]);
    await tx.execute(
      `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
       VALUES (?, NULL, ?, 1, ?)`,
      [relation.id, score, draft ? 1 : 0]
    );
    await tx.execute("UPDATE relation SET status = ?, updated_at = datetime('now') WHERE id = ?", [
      draft ? 'draft' : 'completed',
      relation.id,
    ]);
  });
}

async function submitLeaderTotals(
  relation: RelationRow,
  performance: number,
  comprehensive: number,
  draft: boolean
): Promise<void> {
  await transaction(async tx => {
    if (!draft) await lockAndValidateEvaluationDependencies(tx, [relation]);
    else await tx.queryOne('SELECT id FROM relation WHERE id = ? FOR UPDATE', [relation.id]);
    await AnswerModel.replaceLeaderTotals(
      tx,
      relation.id,
      performance,
      comprehensive,
      draft ? 'draft' : 'completed'
    );
  });
}

async function canSubmitForBatch(batchId: number): Promise<{ ok: boolean; message?: string }> {
  const result = await BatchModel.assertAcceptingSubmissions(batchId);
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

function buildRelationSummary(relation: RelationRow, readContext: EvaluationReadContext) {
  const context = buildQuestionContextFromReadContext(relation, readContext);
  const gate = canEvaluateFromContext(relation, readContext);
  return {
    ...classifyEvaluationRelation(relation),
    id: relation.id,
    batch_id: relation.batch_id,
    evaluator_id: relation.evaluator_id,
    target_id: relation.target_id,
    eval_type: relation.eval_type,
    status: relation.status,
    evaluator_level: relation.evaluator_level,
    target_level: relation.target_level,
    target_name: relation.target_name,
    target_department: relation.target_department,
    target_position: relation.target_position,
    self_total: context?.self_total ?? null,
    manager_total: context?.manager_total ?? null,
    references: context?.references ?? [],
    can_submit: gate.ok,
    blocked_reason: gate.reason ?? null,
  };
}

router.get('/downward/:batchId', async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const userId = getUserId(ctx);
  const batch = await BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  const relations = await RelationModel.findByBatchId(batchId, { evaluator_id: userId, eval_type: 'downward' });
  const readContext = await loadEvaluationReadContext(relations);
  const staffRelations = relations.filter(r => r.evaluator_level === 'manager' && r.target_level === 'staff');
  const quotaByDepartment: Record<string, unknown> = {};
  for (const relation of staffRelations) {
    const department = relation.target_department || '未分部门';
    if (!quotaByDepartment[department]) quotaByDepartment[department] = await getGradePolicyForRelation(relation);
  }
  success(ctx, {
    batch,
    quota: Object.keys(quotaByDepartment).length === 1 ? Object.values(quotaByDepartment)[0] : null,
    quota_by_department: quotaByDepartment,
    list: relations.map(relation => buildRelationSummary(relation, readContext)),
  });
});

router.get('/relation/:relationId', async (ctx: Context) => {
  const relationId = parseInt(ctx.params.relationId);
  const userId = getUserId(ctx);
  const relation = await RelationModel.findById(relationId);
  if (!relation) return fail(ctx, '评价关系不存在', -1, 404);
  if (relation.evaluator_id !== userId) return fail(ctx, '无权查看此评价', -1, 403);
  const [answers, readContext, gradePolicy, personalSummary] = await Promise.all([
    AnswerModel.findByRelationId(relationId),
    loadEvaluationReadContext([relation]),
    getGradePolicyForRelation(relation),
    relation.eval_type === 'self'
      ? Promise.resolve(undefined)
      : PersonalSummaryModel.findMetadata(relation.batch_id, relation.target_id),
  ]);
  const context = buildQuestionContextFromReadContext(relation, readContext);
  const gate = canEvaluateFromContext(relation, readContext);
  const capabilities = classifyEvaluationRelation(relation);
  const mode = capabilities.answer_mode === 'leader_totals' ? 'leader_totals' : 'detail';
  const performanceTotal = answers.find(a => a.question_seq === LEADER_PERFORMANCE_SEQ)?.score ?? null;
  const comprehensiveTotal = answers.find(a => a.question_seq === LEADER_COMPREHENSIVE_SEQ)?.score
    ?? (isLeaderTotalRelation(relation) && performanceTotal === null ? totalOfAnswers(answers) : null);
  success(ctx, {
    relation: withEvaluationCapabilities(relation),
    answers,
    questions: context?.questions ?? [],
    performance_questions: context?.performance_questions ?? [],
    comprehensive_questions: context?.comprehensive_questions ?? [],
    self_total: context?.self_total ?? null,
    manager_total: context?.manager_total ?? null,
    references: context?.references ?? [],
    can_submit: gate.ok,
    blocked_reason: gate.reason ?? null,
    mode,
    leader_performance_score: performanceTotal,
    leader_comprehensive_score: comprehensiveTotal,
    grade_policy: gradePolicy,
    personal_summary: personalSummary ? {
      original_name: personalSummary.original_name,
      file_size: personalSummary.file_size,
      uploaded_at: personalSummary.updated_at,
    } : null,
  });
});

router.post('/relation/:relationId/submit-preview', async (ctx: Context) => {
  const relationId = Number(ctx.params.relationId);
  const userId = getUserId(ctx);
  const relation = await RelationModel.findById(relationId);
  if (!relation) return fail(ctx, '评价关系不存在', -1, 404);
  if (relation.evaluator_id !== userId) return fail(ctx, '无权操作此评价', -1, 403);
  if (relation.status === 'completed') return fail(ctx, '该评价已正式提交', -1, 409);
  if (!classifyEvaluationRelation(relation).requires_grade_preview) {
    return fail(ctx, '该评价关系不适用ABCDE提交预演', -1, 400);
  }
  const answers = (ctx.request.body as any)?.answers;
  if (!Array.isArray(answers)) return fail(ctx, 'answers 必须是数组', -1, 400);
  const batchGate = await canSubmitForBatch(relation.batch_id);
  if (!batchGate.ok) return fail(ctx, batchGate.message, -1, 409);
  const validationError = await validateDetailedAnswers(relation, answers, false);
  if (validationError) return fail(ctx, validationError, -1, 400);
  const normalized = normalizeDetailedAnswers(answers);
  const [preview, gate] = await Promise.all([
    previewDetailedGradeSubmission(relation, normalized),
    canEvaluate(relation),
  ]);
  if (!preview) return fail(ctx, '该评价关系不适用ABCDE提交预演', -1, 400);
  const canSubmit = gate.ok && preview.policy.valid;
  success(ctx, {
    total: preview.total,
    grade: preview.grade,
    scale: preview.policy.scale,
    group_size: preview.policy.group_size,
    projected_counts: preview.policy.counts,
    ranges: preview.policy.ranges,
    constraints: preview.policy.constraints,
    remaining_capacity: preview.policy.remaining_capacity,
    can_submit: canSubmit,
    reason: gate.ok ? preview.policy.message : gate.reason,
  });
});

router.post('/self', async (ctx: Context) => {
  const userId = getUserId(ctx);
  const { relation_id, answers, draft = false } = ctx.request.body as any;
  if (!relation_id) return fail(ctx, '缺少 relation_id');
  const relation = await RelationModel.findById(relation_id);
  if (!relation) return fail(ctx, '评价关系不存在', -1, 404);
  if (relation.evaluator_id !== userId) return fail(ctx, '无权操作', -1, 403);
  if (relation.eval_type !== 'self') return fail(ctx, '该接口仅用于自评', -1, 400);
  if (relation.status === 'completed') return fail(ctx, '该评价已正式提交，请先撤销评分后再修改', -1, 409);
  if (!Array.isArray(answers)) return fail(ctx, 'answers 必须是数组');
  const batchGate = await canSubmitForBatch(relation.batch_id);
  if (!batchGate.ok) return fail(ctx, batchGate.message);
  const err = await validateDetailedAnswers(relation, answers, !!draft);
  if (err) return fail(ctx, err);
  await submitDetailed(relation, answers, !!draft);
  success(ctx, null, draft ? '草稿已保存' : '提交成功');
});

router.post('/detail', async (ctx: Context) => {
  const userId = getUserId(ctx);
  const { relation_id, answers, draft = false } = ctx.request.body as any;
  if (!relation_id) return fail(ctx, '缺少 relation_id');
  if (!Array.isArray(answers)) return fail(ctx, 'answers 必须是数组');
  const relation = await RelationModel.findById(relation_id);
  if (!relation) return fail(ctx, '评价关系不存在', -1, 404);
  if (relation.evaluator_id !== userId) return fail(ctx, '无权操作', -1, 403);
  if (relation.eval_type === 'self') return fail(ctx, '自评请使用 /answer/self', -1, 400);
  if (relation.status === 'completed') return fail(ctx, '该评价已正式提交，请先撤销评分后再修改', -1, 409);
  if (isLeaderTotalRelation(relation)) return fail(ctx, '领导评价请使用业绩和综合总分接口', -1, 400);
  const batchGate = await canSubmitForBatch(relation.batch_id);
  if (!batchGate.ok) return fail(ctx, batchGate.message);
  const gate = await canEvaluate(relation);
  if (!gate.ok) return fail(ctx, gate.reason);
  const err = await validateDetailedAnswers(relation, answers, !!draft);
  if (err) return fail(ctx, err);
  await submitDetailed(relation, answers, !!draft);
  success(ctx, null, draft ? '草稿已保存' : '提交成功');
});

router.post('/total', async (ctx: Context) => {
  const userId = getUserId(ctx);
  const { relation_id, score, draft = false } = ctx.request.body as any;
  if (!relation_id) return fail(ctx, '缺少 relation_id');
  if (score === undefined || score === null) return fail(ctx, '缺少 score');
  const relation = await RelationModel.findById(relation_id);
  if (!relation) return fail(ctx, '评价关系不存在', -1, 404);
  if (relation.evaluator_id !== userId) return fail(ctx, '无权操作', -1, 403);
  if (relation.status === 'completed') return fail(ctx, '该评价已正式提交，不能直接覆盖', -1, 409);
  const batchGate = await canSubmitForBatch(relation.batch_id);
  if (!batchGate.ok) return fail(ctx, batchGate.message);
  const gate = await canEvaluate(relation);
  if (!gate.ok) return fail(ctx, gate.reason);
  const total = validateTotalAnswer(relation, score);
  if (!total.ok) return fail(ctx, total.message);
  await submitTotal(relation, total.score!, !!draft);
  success(ctx, null, draft ? '草稿已保存' : '提交成功');
});

router.post('/leader-total', async (ctx: Context) => {
  const userId = getUserId(ctx);
  const { relation_id, performance_score, comprehensive_score, draft = false } = ctx.request.body as any;
  const relation = await RelationModel.findById(Number(relation_id));
  if (!relation) return fail(ctx, '评价关系不存在', -1, 404);
  if (relation.evaluator_id !== userId) return fail(ctx, '无权操作', -1, 403);
  if (relation.status === 'completed') return fail(ctx, '该评价已正式提交，请通过管理端Excel覆盖修正', -1, 409);
  const batchGate = await canSubmitForBatch(relation.batch_id);
  if (!batchGate.ok) return fail(ctx, batchGate.message);
  const gate = await canEvaluate(relation);
  if (!gate.ok) return fail(ctx, gate.reason);
  const validation = validateLeaderTotals(relation, performance_score, comprehensive_score);
  if (!validation.ok) return fail(ctx, validation.message);
  await submitLeaderTotals(relation, validation.performance!, validation.comprehensive!, !!draft);
  success(ctx, null, draft ? '草稿已保存' : '提交成功');
});

async function handleAnswerItems(userId: number, items: any[], defaultDraft: boolean) {
  const detailed: Array<{ relation: RelationRow; answers: any[]; draft: boolean }> = [];
  const totals: Array<{ relation: RelationRow; score: number; draft: boolean }> = [];
  const leaderTotals: Array<{ relation: RelationRow; performance: number; comprehensive: number; draft: boolean }> = [];

  for (const item of items) {
    const relation = await RelationModel.findById(Number(item.relation_id));
    if (!relation) return { error: `评价关系 ${item.relation_id} 不存在` };
    if (relation.evaluator_id !== userId) return { error: '无权操作', code: 403 };
    if (relation.status === 'completed') return { error: `${relation.target_name || relation.target_id}：已正式提交，请先撤销评分`, code: 409 };
    const batchGate = await canSubmitForBatch(relation.batch_id);
    if (!batchGate.ok) return { error: batchGate.message };
    const gate = await canEvaluate(relation);
    if (!gate.ok) return { error: `${relation.target_name || relation.target_id}：${gate.reason}` };
    const draft = item.draft === undefined ? defaultDraft : !!item.draft;

    if (item.performance_score !== undefined || item.comprehensive_score !== undefined) {
      const validation = validateLeaderTotals(relation, item.performance_score, item.comprehensive_score);
      if (!validation.ok) return { error: `${relation.target_name || relation.target_id}：${validation.message}` };
      leaderTotals.push({
        relation,
        performance: validation.performance!,
        comprehensive: validation.comprehensive!,
        draft,
      });
    } else if (Array.isArray(item.answers)) {
      const err = await validateDetailedAnswers(relation, item.answers, draft);
      if (err) return { error: `${relation.target_name || relation.target_id}：${err}` };
      detailed.push({ relation, answers: item.answers, draft });
    } else if (item.score !== undefined) {
      const total = validateTotalAnswer(relation, item.score);
      if (!total.ok) return { error: `${relation.target_name || relation.target_id}：${total.message}` };
      totals.push({ relation, score: total.score!, draft });
    } else {
      return { error: `${relation.target_name || relation.target_id}：缺少评分数据` };
    }
  }

  if (detailed.length > 0) {
    await submitDetailedItems(detailed.map(item => ({
      relation: item.relation,
      answers: normalizeDetailedAnswers(item.answers),
      draft: item.draft,
    })));
  }
  for (const item of totals) await submitTotal(item.relation, item.score, item.draft);
  for (const item of leaderTotals) {
    await submitLeaderTotals(item.relation, item.performance, item.comprehensive, item.draft);
  }
  return { saved: detailed.length + totals.length + leaderTotals.length };
}

router.post('/batch', async (ctx: Context) => {
  const userId = getUserId(ctx);
  const { items, draft = false } = ctx.request.body as any;
  if (!Array.isArray(items) || items.length === 0) return fail(ctx, 'items 必须是非空数组');
  const result = await handleAnswerItems(userId, items, !!draft);
  if ('error' in result) return fail(ctx, result.error, -1, result.code || 200);
  success(ctx, { saved: result.saved }, draft ? '草稿已保存' : '提交成功');
});

router.post('/relation/:relationId/revoke', async (ctx: Context) => {
  const relationId = Number(ctx.params.relationId);
  const userId = getUserId(ctx);
  const relation = await RelationModel.findById(relationId);
  if (!relation) return fail(ctx, '评价关系不存在', -1, 404);
  if (relation.evaluator_id !== userId) return fail(ctx, '只能撤销本人提交的评价', -1, 403);
  if (isLeaderTotalRelation(relation)) return fail(ctx, '领导评分请通过管理端Excel覆盖修正', -1, 409);
  if (relation.status !== 'completed') return fail(ctx, '只有已完成的评价可以撤销', -1, 409);
  const batchGate = await canSubmitForBatch(relation.batch_id);
  if (!batchGate.ok) return fail(ctx, batchGate.message, -1, 409);

  const previousAnswers = await AnswerModel.findByRelationId(relationId);
  await transaction(async tx => {
    const candidates = await findRevokeConsumers(tx, relation);
    const lockIds = [...new Set([relationId, ...candidates.map(item => item.id)])].sort((a, b) => a - b);
    const marks = lockIds.map(() => '?').join(',');
    const lockedRows = await tx.queryAll<{ id: number; status: string }>(
      `SELECT id, status FROM relation WHERE id IN (${marks}) ORDER BY id FOR UPDATE`,
      lockIds
    );
    const lockedStatus = new Map(lockedRows.map(item => [item.id, item.status]));
    if (lockedStatus.get(relationId) !== 'completed') {
      throw Object.assign(new Error('评价状态已变化，请刷新后重试'), { status: 409 });
    }
    const dependencies = candidates.filter(item => lockedStatus.get(item.id) === 'completed');
    if (dependencies.length > 0) {
      const names = dependencies.slice(0, 3).map(item => `${item.evaluator_name}对${item.target_name}的评分`).join('、');
      throw Object.assign(new Error(`该评分已被后续正式评分使用，不能撤销：${names}`), { status: 409 });
    }
    await tx.execute('UPDATE answer SET is_draft = 1, updated_at = datetime(\'now\') WHERE relation_id = ?', [relationId]);
    await tx.execute("UPDATE relation SET status = 'draft', updated_at = datetime('now') WHERE id = ?", [relationId]);
    await tx.execute(
      'INSERT INTO log (user_id, action, ip, detail) VALUES (?, ?, ?, ?)',
      [userId, 'answer.revoke', ctx.ip || null, JSON.stringify({
        batch_id: relation.batch_id,
        relation_id: relation.id,
        eval_type: relation.eval_type,
        evaluator_id: relation.evaluator_id,
        target_id: relation.target_id,
        original_total: totalOfAnswers(previousAnswers),
        original_answers: previousAnswers.map(answer => ({
          question_seq: answer.question_seq,
          score: answer.score,
          is_total: answer.is_total,
        })),
      })]
    );
  });
  success(ctx, null, '评分已撤销并退回草稿');
});

router.get('/progress/:batchId', async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const userId = getUserId(ctx);
  const batch = await BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  const relations = await RelationModel.findByEvaluator(batchId, userId);
  const grouped: Record<string, { total: number; completed: number; draft: number }> = {};
  for (const r of relations) {
    const scene = classifyEvaluationRelation(r).evaluation_scene;
    if (!grouped[scene]) grouped[scene] = { total: 0, completed: 0, draft: 0 };
    grouped[scene].total++;
    if (r.status === 'completed') grouped[scene].completed++;
    else if (r.status === 'draft') grouped[scene].draft++;
  }
  const total = relations.length;
  const completed = relations.filter(r => r.status === 'completed').length;
  success(ctx, { batch, total, completed, pending: total - completed, grouped });
});

router.get('/admin/progress/:batchId', auth, async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  if (!(ctx.state as any).isAdmin) return fail(ctx, '无权访问', -1, 403);
  const batch = await BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  const [selfRels, peerRels, upwardRels, downwardRels] = await Promise.all([
    RelationModel.findByBatchId(batchId, { eval_type: 'self' }),
    RelationModel.findByBatchId(batchId, { eval_type: 'peer' }),
    RelationModel.findByBatchId(batchId, { eval_type: 'upward' }),
    RelationModel.findByBatchId(batchId, { eval_type: 'downward' }),
  ]);
  const allIds = [...selfRels, ...peerRels, ...upwardRels, ...downwardRels].map(r => r.id);
  const totalsByRelation = await AnswerModel.findTotalsByRelationIds(allIds);
  const buildList = (rows: RelationRow[]) => rows.map(r => ({
    id: r.id,
    evaluator_id: r.evaluator_id,
    evaluator_name: r.evaluator_name,
    evaluator_department: r.evaluator_department,
    evaluator_level: r.evaluator_level,
    target_id: r.target_id,
    target_name: r.target_name,
    target_department: r.target_department,
    target_level: r.target_level,
    status: r.status,
    totalScore: totalsByRelation.get(r.id) ?? null,
  }));
  const stat = (rows: RelationRow[]) => ({
    total: rows.length,
    completed: rows.filter(r => r.status === 'completed').length,
    draft: rows.filter(r => r.status === 'draft').length,
    pending: rows.filter(r => r.status === 'pending').length,
  });
  success(ctx, {
    batch,
    self: { stats: stat(selfRels), list: buildList(selfRels) },
    peer: { stats: stat(peerRels), list: buildList(peerRels) },
    upward: { stats: stat(upwardRels), list: buildList(upwardRels) },
    downward: { stats: stat(downwardRels), list: buildList(downwardRels) },
  });
});

function formatStatScore(score: number | null): string | number {
  return score === null || score === undefined ? '-' : Number(score).toFixed(1);
}

function statisticsExportRows(rows: StatisticsRow[]) {
  return rows.map(row => ({
    序号: row.index,
    部门: row.department,
    员工工号: row.employee_no,
    员工姓名: row.name,
    角色: row.role_label,
    '业绩-员工自评': formatStatScore(row.performance_self_score),
    '业绩-部门负责人': formatStatScore(row.performance_manager_score),
    '业绩-分管领导': formatStatScore(row.performance_division_leader_score),
    '业绩-主要领导': formatStatScore(row.performance_main_leader_score),
    '业绩-现行领导评价': formatStatScore(row.performance_leader_score),
    '业绩-自评价': formatStatScore(row.performance_self_score),
    '业绩-计算分': formatStatScore(row.performance_score),
    '综合-主要领导': formatStatScore(row.comprehensive_main_leader_score),
    '综合-分管领导': formatStatScore(row.comprehensive_division_leader_score),
    '综合-部门负责人评价': formatStatScore(row.comprehensive_manager_score),
    中层互评: formatStatScore(row.comprehensive_manager_peer_score),
    员工评议: formatStatScore(row.comprehensive_employee_review_score),
    员工互评: formatStatScore(row.comprehensive_staff_peer_score),
    '综合-自评价': formatStatScore(row.comprehensive_self_score),
    '综合-计算分': formatStatScore(row.comprehensive_score),
    最终总分: formatStatScore(row.final_score),
    数据状态: row.data_status === 'complete' ? '完整' : '数据缺失',
    缺失项: row.missing_items.join('；'),
  }));
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

router.get('/admin/statistics/:batchId', auth, async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  if (!(ctx.state as any).isAdmin) return fail(ctx, '无权访问', -1, 403);
  const result = await buildStatistics(batchId);
  if (!result) return fail(ctx, '批次不存在', -1, 404);
  success(ctx, result);
});

router.get('/admin/statistics/:batchId/export', auth, async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  if (!(ctx.state as any).isAdmin) return fail(ctx, '无权访问', -1, 403);
  const result = await buildStatistics(batchId);
  if (!result || !result.batch) return fail(ctx, '批次不存在', -1, 404);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('数据统计');
  const rows = statisticsExportRows(result.rows);
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [
    '序号', '部门', '员工工号', '员工姓名', '角色',
    '业绩-员工自评', '业绩-部门负责人', '业绩-分管领导', '业绩-主要领导',
    '业绩-现行领导评价', '业绩-自评价', '业绩-计算分',
    '综合-主要领导', '综合-分管领导', '综合-部门负责人评价',
    '中层互评', '员工评议', '员工互评', '综合-自评价', '综合-计算分',
    '最终总分', '数据状态', '缺失项',
  ];
  worksheet.columns = headers.map((header, index) => ({
    header,
    key: header,
    width: [8, 18, 14, 14, 12, 14, 16, 14, 14, 18, 12, 12, 14, 14, 18, 12, 12, 12, 12, 12, 12, 12, 36][index] || 12,
  }));
  worksheet.addRows(rows);
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.eachRow(row => {
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9E2EC' } },
        left: { style: 'thin', color: { argb: 'FFD9E2EC' } },
        bottom: { style: 'thin', color: { argb: 'FFD9E2EC' } },
        right: { style: 'thin', color: { argb: 'FFD9E2EC' } },
      };
    });
  });
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const filename = `数据统计-${safeFileName(result.batch.name)}.xlsx`;
  ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  ctx.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  ctx.body = buffer;
});

router.post('/import', auth, async (ctx: Context) => {
  const { answers } = ctx.request.body as any;
  if (!Array.isArray(answers)) return fail(ctx, 'answers 必须是数组');
  const result = await handleAnswerItems(getUserId(ctx), answers, false);
  if ('error' in result) return fail(ctx, result.error, -1, result.code || 200);
  success(ctx, { imported: result.saved }, `导入 ${result.saved} 条`);
});

export default router;
