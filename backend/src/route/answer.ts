import Router from '@koa/router';
import { AnswerModel } from '../model/answer.js';
import type { AnswerRow } from '../model/answer.js';
import { RelationModel } from '../model/relation.js';
import { SelfQuestionModel } from '../model/self_question.js';
import { BatchModel } from '../model/batch.js';
import { success, fail } from '../utils/response.js';
import { auth } from '../middleware/auth.js';
import type { Context } from 'koa';

const router = new Router({ prefix: '/api/v1/answer' });

router.use(auth);

function getUserId(ctx: Context): number {
  return (ctx.state as any).userId;
}

// 查询某关系的所有答案
router.get('/relation/:relationId', async (ctx: Context) => {
  const relationId = parseInt(ctx.params.relationId);
  const userId = getUserId(ctx);
  const relation = RelationModel.findById(relationId);
  if (!relation) return fail(ctx, '评价关系不存在', -1, 404);
  if (relation.evaluator_id !== userId) return fail(ctx, '无权查看此评价', -1, 403);

  const answers = AnswerModel.findByRelationId(relationId);

  // 如果是自评，附加题目信息
  let questions = null;
  if (relation.eval_type === 'self') {
    const sq = SelfQuestionModel.findByBatchAndUser(relation.batch_id, relation.target_id);
    if (sq) {
      questions = SelfQuestionModel.toExportFormat([sq])[0].questions;
    }
  }

  success(ctx, { relation, answers, questions });
});

// 提交/暂存自评（逐题）
router.post('/self', async (ctx: Context) => {
  const userId = getUserId(ctx);
  const { relation_id, answers, draft = false } = ctx.request.body as any;

  if (!relation_id) return fail(ctx, '缺少 relation_id');
  const relation = RelationModel.findById(relation_id);
  if (!relation) return fail(ctx, '评价关系不存在', -1, 404);
  if (relation.evaluator_id !== userId) return fail(ctx, '无权操作', -1, 403);
  if (relation.eval_type !== 'self') return fail(ctx, '此接口仅用于自评', -1, 400);
  if (!Array.isArray(answers)) return fail(ctx, 'answers 必须是数组');

  // 校验分数范围
  const sq = SelfQuestionModel.findByBatchAndUser(relation.batch_id, relation.target_id);
  if (!sq) return fail(ctx, '自评题目未配置', -1, 400);

  for (const a of answers) {
    const seq = a.seq; // 1~10
    const score = a.score;
    const wkey = `weight_${seq}` as keyof typeof sq;
    const weight = sq[wkey] as number | null;
    if (weight !== null && score > weight * 100) {
      return fail(ctx, `第 ${seq} 题分数不能超过 ${(weight * 100).toFixed(0)}`);
    }
    if (score < 0) return fail(ctx, `第 ${seq} 题分数不能为负`);
  }

  AnswerModel.submitSelfEval(
    relation_id,
    answers.map((a: any) => ({ seq: a.seq, score: a.score })),
    !!draft
  );

  if (!draft) {
    RelationModel.updateStatus(relation_id, 'completed');
  } else {
    RelationModel.updateStatus(relation_id, 'draft');
  }

  success(ctx, null, draft ? '草稿已保存' : '提交成功');
});

// 提交/暂存互评/向下评估（总分）
router.post('/total', async (ctx: Context) => {
  const userId = getUserId(ctx);
  const { relation_id, score, draft = false } = ctx.request.body as any;

  if (!relation_id) return fail(ctx, '缺少 relation_id');
  if (score === undefined || score === null) return fail(ctx, '缺少 score');

  const relation = RelationModel.findById(relation_id);
  if (!relation) return fail(ctx, '评价关系不存在', -1, 404);
  if (relation.evaluator_id !== userId) return fail(ctx, '无权操作', -1, 403);
  if (relation.eval_type === 'self') return fail(ctx, '自评请用 /answer/self', -1, 400);
  if (score < 0 || score > 100) return fail(ctx, '分数必须在 0~100 之间');

  AnswerModel.submitTotalEval(relation_id, score, !!draft);

  if (!draft) {
    RelationModel.updateStatus(relation_id, 'completed');
  } else {
    RelationModel.updateStatus(relation_id, 'draft');
  }

  success(ctx, null, draft ? '草稿已保存' : '提交成功');
});

// 获取H5端某批次的我的评价进度
router.get('/progress/:batchId', async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const userId = getUserId(ctx);

  const batch = BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);

  const relations = RelationModel.findByEvaluator(batchId, userId);
  const grouped: Record<string, { total: number; completed: number; draft: number }> = {};

  for (const r of relations) {
    if (!grouped[r.eval_type]) {
      grouped[r.eval_type] = { total: 0, completed: 0, draft: 0 };
    }
    grouped[r.eval_type].total++;
    if (r.status === 'completed') grouped[r.eval_type].completed++;
    else if (r.status === 'draft') grouped[r.eval_type].draft++;
  }

  const total = relations.length;
  const completed = relations.filter(r => r.status === 'completed').length;

  success(ctx, {
    batch,
    total,
    completed,
    pending: total - completed,
    grouped,
  });
});

// 获取管理端某批次的各类评价进度（含每条关系打分）
router.get('/admin/progress/:batchId', auth, async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const isAdmin = (ctx.state as any).isAdmin;
  if (!isAdmin) return fail(ctx, '无权访问', -1, 403);

  const batch = BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);

  // 按类型查所有关系
  const selfRels    = RelationModel.findByBatchId(batchId, { eval_type: 'self' });
  const peerRels    = RelationModel.findByBatchId(batchId, { eval_type: 'peer' });
  const downwardRels = RelationModel.findByBatchId(batchId, { eval_type: 'downward' });

  // 收集所有关系ID，批量查答案
  const allIds = [
    ...selfRels.map(r => r.id),
    ...peerRels.map(r => r.id),
    ...downwardRels.map(r => r.id),
  ];
  const allAnswers = AnswerModel.findByRelationIds(allIds);
  const answersMap: Record<number, AnswerRow[]> = {};
  for (const a of allAnswers) {
    if (!answersMap[a.relation_id]) answersMap[a.relation_id] = [];
    answersMap[a.relation_id].push(a);
  }

    // 组装自评进度（题目1~10固定列，后端只返回分数）
    const selfProgress = selfRels.map(r => {
      const answers = answersMap[r.id] || [];
      const questions = answers.filter(a => a.is_total === 0);
      const totalAns  = answers.find(a => a.is_total === 1);
      const questionScores: Array<{ seq: number; score: number | null }> = [];
      for (let i = 1; i <= 10; i++) {
        const qAns = questions.find(q => q.question_seq === i);
        questionScores.push({ seq: i, score: qAns ? qAns.score : null });
      }
      return {
        id: r.id,
        target_name: r.target_name,
        target_department: r.target_department,
        status: r.status,
        questionScores,
        totalScore: totalAns ? totalAns.score : null,
      };
    });

  // 组装互评/向下评估进度（总分 0~100）
  function buildList(rows: typeof selfRels) {
    return rows.map(r => {
      const totalAns = (answersMap[r.id] || []).find(a => a.is_total === 1);
      return {
        id: r.id,
        evaluator_name: r.evaluator_name,
        evaluator_department: r.evaluator_department,
        target_name: r.target_name,
        target_department: r.target_department,
        status: r.status,
        totalScore: totalAns ? totalAns.score : null,
      };
    });
  }

  const peerProgress    = buildList(peerRels);
  const downwardProgress = buildList(downwardRels);

  // 各类型统计
  function stat(rows: typeof selfRels) {
    return {
      total: rows.length,
      completed: rows.filter(r => r.status === 'completed').length,
      draft:    rows.filter(r => r.status === 'draft').length,
      pending:  rows.filter(r => r.status === 'pending').length,
    };
  }

  success(ctx, {
    batch,
    self:    { stats: stat(selfRels),     list: selfProgress },
    peer:    { stats: stat(peerRels),     list: buildList(peerRels) },
    downward:{ stats: stat(downwardRels),  list: buildList(downwardRels) },
  });
});

// 批量导入答案
router.post('/import', auth, async (ctx: Context) => {
  const { answers } = ctx.request.body as any;
  if (!Array.isArray(answers)) return fail(ctx, 'answers 必须是数组');
  const userId = getUserId(ctx);
  let imported = 0;
  for (const a of answers) {
    const relation = RelationModel.findById(a.relation_id);
    if (!relation || relation.evaluator_id !== userId) continue;
    if (relation.eval_type === 'self' && Array.isArray(a.answers)) {
      AnswerModel.submitSelfEval(a.relation_id,
        a.answers.map((x: any) => ({ seq: x.seq, score: x.score })), !!a.draft);
    } else if (relation.eval_type !== 'self' && a.score !== undefined) {
      AnswerModel.submitTotalEval(a.relation_id, a.score, !!a.draft);
    }
    if (a.draft) {
      RelationModel.updateStatus(a.relation_id, 'draft');
    }
    imported++;
  }
  success(ctx, { imported }, `导入 ${imported} 条`);
});

export default router;
