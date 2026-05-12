import Router from '@koa/router';
import ExcelJS from 'exceljs';
import { AnswerModel, type AnswerRow } from '../model/answer.js';
import { RelationModel, type RelationRow } from '../model/relation.js';
import { SelfQuestionModel, type QuestionItem } from '../model/self_question.js';
import { BatchModel } from '../model/batch.js';
import { buildStatistics, type StatisticsRow } from '../service/statistics.js';
import { success, fail } from '../utils/response.js';
import { auth } from '../middleware/auth.js';
import type { Context } from 'koa';

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

function scoreBand(score: number): 'high' | 'mid' | 'low' {
  if (score >= 81 && score <= 100) return 'high';
  if (score >= 71 && score < 81) return 'mid';
  return 'low';
}

function isLeaderStaffTotalRelation(relation: RelationRow): boolean {
  return relation.eval_type === 'downward'
    && (relation.evaluator_level === 'division_leader' || relation.evaluator_level === 'main_leader')
    && relation.target_level === 'staff';
}

async function getSelfRelation(batchId: number, userId: number): Promise<RelationRow | undefined> {
  return (await RelationModel.findByBatchId(batchId, {
    evaluator_id: userId,
    target_id: userId,
    eval_type: 'self',
  }))[0];
}

async function getManagerDownwardRelation(batchId: number, targetId: number): Promise<RelationRow | undefined> {
  return (await RelationModel.findByBatchId(batchId, { target_id: targetId, eval_type: 'downward' }))
    .find(r => r.evaluator_level === 'manager');
}

async function managerHasCompletedDepartment(batchId: number, managerId: number): Promise<boolean> {
  const rows = (await RelationModel.findByBatchId(batchId, { evaluator_id: managerId, eval_type: 'downward' }))
    .filter(r => r.target_level === 'staff');
  return rows.length > 0 && rows.every(r => r.status === 'completed');
}

async function canEvaluate(relation: RelationRow): Promise<{ ok: boolean; reason?: string }> {
  if (relation.eval_type === 'self' || relation.eval_type === 'peer') return { ok: true };

  if (relation.evaluator_level === 'manager' && relation.target_level === 'staff') {
    const selfRel = await getSelfRelation(relation.batch_id, relation.target_id);
    if (!selfRel || selfRel.status !== 'completed') {
      return { ok: false, reason: '员工正式提交自评后，部门负责人才能评价' };
    }
    return { ok: true };
  }

  if (relation.evaluator_level === 'division_leader' || relation.evaluator_level === 'main_leader') {
    if (relation.target_level === 'manager') {
      const selfRel = await getSelfRelation(relation.batch_id, relation.target_id);
      if (!selfRel || selfRel.status !== 'completed') {
        return { ok: false, reason: '部门负责人正式提交自评后，领导才能评价' };
      }
      if (!(await managerHasCompletedDepartment(relation.batch_id, relation.target_id))) {
        return { ok: false, reason: '部门负责人完成本部门所有员工评分后，领导才能评价' };
      }
      return { ok: true };
    }

    if (relation.target_level === 'staff') {
      const managerRel = await getManagerDownwardRelation(relation.batch_id, relation.target_id);
      if (!managerRel || managerRel.status !== 'completed') {
        return { ok: false, reason: '部门负责人完成该员工评分后，领导才能评价' };
      }
      if (!(await managerHasCompletedDepartment(relation.batch_id, managerRel.evaluator_id))) {
        return { ok: false, reason: '部门负责人完成本部门所有员工评分后，领导才能评价该部门人员' };
      }
      return { ok: true };
    }
  }

  return { ok: true };
}

async function buildQuestionContext(relation: RelationRow) {
  const sq = await SelfQuestionModel.findByBatchAndUser(relation.batch_id, relation.target_id);
  if (!sq) return null;
  const exportRow = SelfQuestionModel.toExportFormat([sq])[0];
  const answersBySeq = new Map<number, AnswerRow>();

  const selfRel = await getSelfRelation(relation.batch_id, relation.target_id);
  const selfScores = selfRel ? await AnswerModel.findByRelationId(selfRel.id) : [];
  for (const a of selfScores) {
    if (a.question_seq !== null && a.is_total === 0) answersBySeq.set(a.question_seq, a);
  }

  const managerRel = relation.target_level === 'staff'
    ? await getManagerDownwardRelation(relation.batch_id, relation.target_id)
    : undefined;
  const managerScores = managerRel ? await AnswerModel.findByRelationId(managerRel.id) : [];
  const managerScoreBySeq = new Map<number, AnswerRow>();
  for (const a of managerScores) {
    if (a.question_seq !== null && a.is_total === 0) managerScoreBySeq.set(a.question_seq, a);
  }

  function enrich(q: QuestionItem) {
    return {
      ...q,
      self_score: answersBySeq.get(q.answer_seq)?.score ?? null,
      manager_score: managerScoreBySeq.get(q.answer_seq)?.score ?? null,
    };
  }

  const performanceQuestions = relation.eval_type === 'peer'
    ? []
    : exportRow.performance_questions.map(enrich);
  const comprehensiveQuestions = exportRow.comprehensive_questions.map(enrich);

  return {
    ...exportRow,
    performance_questions: performanceQuestions,
    comprehensive_questions: comprehensiveQuestions,
    questions: relation.eval_type === 'peer'
      ? comprehensiveQuestions
      : [...performanceQuestions, ...comprehensiveQuestions],
    self_total: totalOfAnswers(selfScores),
    manager_total: totalOfAnswers(managerScores),
  };
}

async function questionSetForRelation(relation: RelationRow): Promise<QuestionItem[]> {
  const sq = await SelfQuestionModel.findByBatchAndUser(relation.batch_id, relation.target_id);
  if (!sq) return [];
  const exportRow = SelfQuestionModel.toExportFormat([sq])[0];
  if (relation.eval_type === 'peer') return exportRow.comprehensive_questions;
  if (isLeaderStaffTotalRelation(relation)) return [];
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

async function submitDetailed(relation: RelationRow, answers: any[], draft: boolean): Promise<void> {
  const normalized = answers
    .map(a => ({ seq: Number(a.seq ?? a.question_seq ?? a.answer_seq), score: round1(Number(a.score)) }))
    .filter(a => Number.isFinite(a.seq) && Number.isFinite(a.score));
  await AnswerModel.submitDetailedWithStatus(relation.id, normalized, draft ? 'draft' : 'completed', draft);
}

function validateTotalAnswer(relation: RelationRow, score: unknown): { ok: boolean; score?: number; message?: string } {
  const numericScore = Number(score);
  if (!isLeaderStaffTotalRelation(relation)) return { ok: false, message: '该评价关系不支持总分评价，请按题目逐项评分' };
  if (!Number.isFinite(numericScore)) return { ok: false, message: '分数格式不正确' };
  if (!isOneDecimal(numericScore)) return { ok: false, message: '评分最多支持 1 位小数' };
  if (numericScore < 0 || numericScore > 30) return { ok: false, message: '分数必须在 0~30 之间' };
  return { ok: true, score: round1(numericScore) };
}

async function submitTotal(relation: RelationRow, score: number, draft: boolean): Promise<void> {
  await AnswerModel.submitTotalWithStatus(relation.id, score, draft ? 'draft' : 'completed', draft);
}

async function buildManagerQuota(batchId: number, managerId: number, incoming: Map<number, number> = new Map()) {
  const rows = (await RelationModel.findByBatchId(batchId, { evaluator_id: managerId, eval_type: 'downward' }))
    .filter(r => r.target_level === 'staff');
  const total = rows.length;
  const highMax = Math.round(total * 0.4);
  const midMax = Math.round(total * 0.3);
  const lowMin = total - highMax - midMax;
  const bandCounts = { high: 0, mid: 0, low: 0 };
  for (const row of rows) {
    let score: number | null = null;
    if (incoming.has(row.id)) {
      score = incoming.get(row.id)!;
    } else if (row.status === 'completed') {
      score = totalOfAnswers(await AnswerModel.findByRelationId(row.id));
    }
    if (score === null || score === undefined) continue;
    bandCounts[scoreBand(score)]++;
  }
  return {
    total,
    high: bandCounts.high,
    mid: bandCounts.mid,
    low: bandCounts.low,
    highMax,
    midMax,
    lowMin,
    highRemain: Math.max(0, highMax - bandCounts.high),
    midRemain: Math.max(0, midMax - bandCounts.mid),
    lowNeed: Math.max(0, lowMin - bandCounts.low),
  };
}

async function validateManagerQuota(batchId: number, managerId: number, incoming: Map<number, number>) {
  const detail = await buildManagerQuota(batchId, managerId, incoming);
  const { high, mid, highMax, midMax } = detail;
  if (high > highMax || mid > midMax) {
    return {
      ok: false,
      message: `分档名额已超出：81-100 分最多 ${highMax} 人，71-80 分最多 ${midMax} 人；当前提交后高分 ${high} 人、中分 ${mid} 人`,
      detail,
    };
  }
  return { ok: true, detail };
}

async function canSubmitForBatch(batchId: number): Promise<{ ok: boolean; message?: string }> {
  const result = await BatchModel.assertAcceptingSubmissions(batchId);
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

async function buildRelationSummary(relation: RelationRow) {
  const context = await buildQuestionContext(relation);
  const gate = await canEvaluate(relation);
  return {
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
  const staffRelations = relations.filter(r => r.evaluator_level === 'manager' && r.target_level === 'staff');
  const quota = staffRelations.length > 0 ? await buildManagerQuota(batchId, userId) : null;
  success(ctx, { batch, quota, list: await Promise.all(relations.map(buildRelationSummary)) });
});

router.get('/relation/:relationId', async (ctx: Context) => {
  const relationId = parseInt(ctx.params.relationId);
  const userId = getUserId(ctx);
  const relation = await RelationModel.findById(relationId);
  if (!relation) return fail(ctx, '评价关系不存在', -1, 404);
  if (relation.evaluator_id !== userId) return fail(ctx, '无权查看此评价', -1, 403);
  const answers = await AnswerModel.findByRelationId(relationId);
  const context = await buildQuestionContext(relation);
  const gate = await canEvaluate(relation);
  const mode = isLeaderStaffTotalRelation(relation) ? 'leader_staff_total' : 'detail';
  success(ctx, {
    relation,
    answers,
    questions: context?.questions ?? [],
    performance_questions: context?.performance_questions ?? [],
    comprehensive_questions: context?.comprehensive_questions ?? [],
    self_total: context?.self_total ?? null,
    manager_total: context?.manager_total ?? null,
    can_submit: gate.ok,
    blocked_reason: gate.reason ?? null,
    mode,
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
  const batchGate = await canSubmitForBatch(relation.batch_id);
  if (!batchGate.ok) return fail(ctx, batchGate.message);
  const gate = await canEvaluate(relation);
  if (!gate.ok) return fail(ctx, gate.reason);
  const err = await validateDetailedAnswers(relation, answers, !!draft);
  if (err) return fail(ctx, err);
  if (!draft && relation.evaluator_level === 'manager' && relation.target_level === 'staff') {
    const total = answers.reduce((sum: number, a: any) => sum + Number(a.score || 0), 0);
    const quota = await validateManagerQuota(relation.batch_id, relation.evaluator_id, new Map([[relation.id, round1(total)]]));
    if (!quota.ok) return fail(ctx, quota.message);
  }
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
  const batchGate = await canSubmitForBatch(relation.batch_id);
  if (!batchGate.ok) return fail(ctx, batchGate.message);
  const gate = await canEvaluate(relation);
  if (!gate.ok) return fail(ctx, gate.reason);
  const total = validateTotalAnswer(relation, score);
  if (!total.ok) return fail(ctx, total.message);
  await submitTotal(relation, total.score!, !!draft);
  success(ctx, null, draft ? '草稿已保存' : '提交成功');
});

async function handleAnswerItems(userId: number, items: any[], defaultDraft: boolean) {
  const detailed: Array<{ relation: RelationRow; answers: any[]; draft: boolean }> = [];
  const totals: Array<{ relation: RelationRow; score: number; draft: boolean }> = [];
  const quotaGroups = new Map<string, { batchId: number; managerId: number; incoming: Map<number, number> }>();

  for (const item of items) {
    const relation = await RelationModel.findById(Number(item.relation_id));
    if (!relation) return { error: `评价关系 ${item.relation_id} 不存在` };
    if (relation.evaluator_id !== userId) return { error: '无权操作', code: 403 };
    const batchGate = await canSubmitForBatch(relation.batch_id);
    if (!batchGate.ok) return { error: batchGate.message };
    const gate = await canEvaluate(relation);
    if (!gate.ok) return { error: `${relation.target_name || relation.target_id}：${gate.reason}` };
    const draft = item.draft === undefined ? defaultDraft : !!item.draft;

    if (Array.isArray(item.answers)) {
      const err = await validateDetailedAnswers(relation, item.answers, draft);
      if (err) return { error: `${relation.target_name || relation.target_id}：${err}` };
      detailed.push({ relation, answers: item.answers, draft });
      if (!draft && relation.evaluator_level === 'manager' && relation.target_level === 'staff') {
        const total = round1(item.answers.reduce((sum: number, a: any) => sum + Number(a.score || 0), 0));
        const key = `${relation.batch_id}:${relation.evaluator_id}`;
        if (!quotaGroups.has(key)) quotaGroups.set(key, { batchId: relation.batch_id, managerId: relation.evaluator_id, incoming: new Map() });
        quotaGroups.get(key)!.incoming.set(relation.id, total);
      }
    } else if (item.score !== undefined) {
      const total = validateTotalAnswer(relation, item.score);
      if (!total.ok) return { error: `${relation.target_name || relation.target_id}：${total.message}` };
      totals.push({ relation, score: total.score!, draft });
    } else {
      return { error: `${relation.target_name || relation.target_id}：缺少评分数据` };
    }
  }

  for (const group of quotaGroups.values()) {
    const quota = await validateManagerQuota(group.batchId, group.managerId, group.incoming);
    if (!quota.ok) return { error: quota.message };
  }
  for (const item of detailed) await submitDetailed(item.relation, item.answers, item.draft);
  for (const item of totals) await submitTotal(item.relation, item.score, item.draft);
  return { saved: detailed.length + totals.length };
}

router.post('/batch', async (ctx: Context) => {
  const userId = getUserId(ctx);
  const { items, draft = false } = ctx.request.body as any;
  if (!Array.isArray(items) || items.length === 0) return fail(ctx, 'items 必须是非空数组');
  const result = await handleAnswerItems(userId, items, !!draft);
  if ('error' in result) return fail(ctx, result.error, -1, result.code || 200);
  success(ctx, { saved: result.saved }, draft ? '草稿已保存' : '提交成功');
});

router.get('/progress/:batchId', async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const userId = getUserId(ctx);
  const batch = await BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  const relations = await RelationModel.findByEvaluator(batchId, userId);
  const grouped: Record<string, { total: number; completed: number; draft: number }> = {};
  for (const r of relations) {
    if (!grouped[r.eval_type]) grouped[r.eval_type] = { total: 0, completed: 0, draft: 0 };
    grouped[r.eval_type].total++;
    if (r.status === 'completed') grouped[r.eval_type].completed++;
    else if (r.status === 'draft') grouped[r.eval_type].draft++;
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
  const [selfRels, peerRels, downwardRels] = await Promise.all([
    RelationModel.findByBatchId(batchId, { eval_type: 'self' }),
    RelationModel.findByBatchId(batchId, { eval_type: 'peer' }),
    RelationModel.findByBatchId(batchId, { eval_type: 'downward' }),
  ]);
  const allIds = [...selfRels, ...peerRels, ...downwardRels].map(r => r.id);
  const allAnswers = await AnswerModel.findByRelationIds(allIds);
  const answersMap: Record<number, AnswerRow[]> = {};
  for (const a of allAnswers) {
    if (!answersMap[a.relation_id]) answersMap[a.relation_id] = [];
    answersMap[a.relation_id].push(a);
  }
  const buildList = (rows: RelationRow[]) => rows.map(r => ({
    id: r.id,
    evaluator_name: r.evaluator_name,
    evaluator_department: r.evaluator_department,
    evaluator_level: r.evaluator_level,
    target_name: r.target_name,
    target_department: r.target_department,
    target_level: r.target_level,
    status: r.status,
    totalScore: totalOfAnswers(answersMap[r.id] || []),
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
    '业绩-领导评价': formatStatScore(row.performance_leader_score),
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
    '业绩-领导评价', '业绩-自评价', '业绩-计算分',
    '综合-主要领导', '综合-分管领导', '综合-部门负责人评价',
    '中层互评', '员工评议', '员工互评', '综合-自评价', '综合-计算分',
    '最终总分', '数据状态', '缺失项',
  ];
  worksheet.columns = headers.map((header, index) => ({
    header,
    key: header,
    width: [8, 18, 14, 14, 12, 14, 12, 12, 14, 14, 18, 12, 12, 12, 12, 12, 12, 12, 36][index] || 12,
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
