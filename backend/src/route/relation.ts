import Router from '@koa/router';
import { RelationModel } from '../model/relation.js';
import { UserModel } from '../model/user.js';
import {
  buildRelationPreview,
  generateRelations,
  RelationGenerationError,
} from '../service/generateRelations.js';
import { success, fail } from '../utils/response.js';
import { auth } from '../middleware/auth.js';
import { admin } from '../middleware/admin.js';
import type { Context } from 'koa';
import { withEvaluationCapabilities } from '../service/evaluationScene.js';

const router = new Router({ prefix: '/api/v1/relation' });

router.use(auth);

router.get('/', async (ctx: Context) => {
  const { batch_id, evaluator_id, target_id, eval_type, status, page = '1', pageSize = '100' } = ctx.query as any;
  if (!batch_id) return fail(ctx, '缺少 batch_id');
  const p = Math.max(1, parseInt(page));
  const ps = Math.min(5000, Math.max(1, parseInt(pageSize)));
  const filters: any = {};
  if (evaluator_id) filters.evaluator_id = parseInt(evaluator_id);
  if (target_id) filters.target_id = parseInt(target_id);
  if (eval_type) filters.eval_type = eval_type;
  if (status) filters.status = status;
  const { list, total } = await RelationModel.findByBatchPage(parseInt(batch_id), filters, p, ps);
  success(ctx, { list: list.map(withEvaluationCapabilities), total, page: p, pageSize: ps });
});

router.get('/my', async (ctx: Context) => {
  const { batch_id } = ctx.query as any;
  const userId = (ctx.state as any).userId;
  if (!batch_id) return fail(ctx, '缺少 batch_id');
  const list = (await RelationModel.findByEvaluator(parseInt(batch_id), userId))
    .map(withEvaluationCapabilities);
  const grouped: Record<string, typeof list> = {};
  for (const r of list) {
    const key = r.evaluation_scene;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }
  success(ctx, { list, grouped });
});

function handleGenerationError(ctx: Context, error: unknown): void {
  if (error instanceof RelationGenerationError) {
    fail(ctx, error.message, -1, error.status, error.data);
    return;
  }
  throw error;
}

router.post('/generate/:batchId/preview', admin, async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  try {
    const preview = await buildRelationPreview(batchId);
    if (preview.missing_questions.length > 0) {
      return fail(ctx, '存在未录入题目的人员，无法生成评价关系', -1, 409, {
        missing_questions: preview.missing_questions,
      });
    }
    success(ctx, preview);
  } catch (error) {
    handleGenerationError(ctx, error);
  }
});

router.post('/generate/:batchId', admin, async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const { preview_hash } = ctx.request.body as any;
  if (!preview_hash) return fail(ctx, '请先预览本次增量生成范围', -1, 400);
  try {
    const result = await generateRelations(batchId, String(preview_hash), {
      adminId: Number(ctx.state.userId),
      ip: ctx.ip,
    });
    success(ctx, result, `增量生成完成，新增 ${result.total} 条关系`);
  } catch (error) {
    handleGenerationError(ctx, error);
  }
});

router.post('/', admin, async (ctx: Context) => {
  const { batch_id, evaluator_id, target_id, role_type, eval_type } = ctx.request.body as any;
  if (!batch_id || !evaluator_id || !target_id || !role_type || !eval_type) {
    return fail(ctx, '缺少必填字段');
  }
  const evaluator = await UserModel.findById(evaluator_id);
  if (!evaluator) return fail(ctx, '评价人不存在', -1, 404);
  const target = await UserModel.findById(target_id);
  if (!target) return fail(ctx, '被评人不存在', -1, 404);
  const result = await RelationModel.batchCreate([{ batch_id, evaluator_id, target_id, role_type, eval_type }]);
  if (result.errors.length > 0) return fail(ctx, result.errors[0].message);
  success(ctx, null, '添加成功');
});

router.delete('/:id', admin, async (ctx: Context) => {
  const id = parseInt(ctx.params.id);
  const r = await RelationModel.findById(id);
  if (!r) return fail(ctx, '关系不存在', -1, 404);
  if (r.status !== 'pending') {
    return fail(ctx, '草稿或已完成的评价关系不能删除', -1, 409);
  }
  if (await RelationModel.hasAnswers(id)) {
    return fail(ctx, '该评价关系已经存在答案，不能删除', -1, 409);
  }
  await RelationModel.delete(id);
  success(ctx, null, '删除成功');
});

router.post('/import', admin, async (ctx: Context) => {
  const { batch_id, relations } = ctx.request.body as any;
  if (!batch_id || !Array.isArray(relations)) return fail(ctx, '缺少 batch_id 或 relations');

  const processed = await Promise.all(relations.map(async (r: any) => {
    const evaluator = await UserModel.findByEmployeeNo(String(r['评价人工号'] || r.evaluator_no || ''));
    const target = await UserModel.findByEmployeeNo(String(r['被评人工号'] || r.target_no || ''));
    return {
      evaluator_id: evaluator?.id ?? 0,
      target_id: target?.id ?? 0,
      role_type: evaluator?.level ?? 'staff',
      eval_type: r['关系类型'] || r.eval_type || 'peer',
      _error: !evaluator ? '评价人工号不存在' : !target ? '被评人工号不存在' : null,
    };
  }));

  const errors: Array<{ row: number; message: string }> = [];
  const valid = processed.filter((r, idx) => {
    if (r._error) {
      errors.push({ row: idx + 2, message: r._error });
      return false;
    }
    return !!r.evaluator_id && !!r.target_id;
  });

  const result = await RelationModel.batchCreate(valid.map(r => ({
    batch_id,
    evaluator_id: r.evaluator_id,
    target_id: r.target_id,
    role_type: r.role_type,
    eval_type: r.eval_type,
  })));
  success(ctx, {
    success: result.success,
    errors: [...errors, ...result.errors.map(e => ({ row: -1, message: e.message }))],
  }, `导入完成，成功 ${result.success} 条`);
});

router.get('/export/:batchId', async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const { eval_type, status } = ctx.query as any;
  const filters: any = {};
  if (eval_type) filters.eval_type = eval_type;
  if (status) filters.status = status;
  const list = await RelationModel.findByBatchId(batchId, filters);
  const rows = list.map(withEvaluationCapabilities).map(r => ({
    评价人工号: r.evaluator_id,
    评价人姓名: r.evaluator_name,
    评价人部门: r.evaluator_department,
    被评人工号: r.target_id,
    被评人姓名: r.target_name,
    被评人部门: r.target_department,
    关系类型: r.display_label,
    状态: r.status,
  }));
  success(ctx, rows);
});

export default router;
