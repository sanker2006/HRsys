import Router from '@koa/router';
import { RelationModel } from '../model/relation.js';
import { BatchModel } from '../model/batch.js';
import { UserModel } from '../model/user.js';
import { findMissingQuestionUsers, generateRelations } from '../service/generateRelations.js';
import { success, fail } from '../utils/response.js';
import { auth } from '../middleware/auth.js';
import { admin } from '../middleware/admin.js';
import type { Context } from 'koa';

const router = new Router({ prefix: '/api/v1/relation' });

router.use(auth);

router.get('/', async (ctx: Context) => {
  const { batch_id, evaluator_id, target_id, eval_type, status, page = '1', pageSize = '100' } = ctx.query as any;
  if (!batch_id) return fail(ctx, '缺少 batch_id');
  const p = Math.max(1, parseInt(page));
  const ps = Math.min(500, Math.max(1, parseInt(pageSize)));
  const filters: any = {};
  if (evaluator_id) filters.evaluator_id = parseInt(evaluator_id);
  if (target_id) filters.target_id = parseInt(target_id);
  if (eval_type) filters.eval_type = eval_type;
  if (status) filters.status = status;

  const { list, total } = RelationModel.findByBatchPage(parseInt(batch_id), filters, p, ps);
  success(ctx, { list, total, page: p, pageSize: ps });
});

router.get('/my', async (ctx: Context) => {
  const { batch_id } = ctx.query as any;
  const userId = (ctx.state as any).userId;
  if (!batch_id) return fail(ctx, '缺少 batch_id');
  const list = RelationModel.findByEvaluator(parseInt(batch_id), userId);
  const grouped: Record<string, typeof list> = {};
  for (const r of list) {
    const key = r.eval_type;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }
  success(ctx, { list, grouped });
});

router.post('/generate/:batchId', admin, async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const batch = BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  const missingQuestions = findMissingQuestionUsers(batchId);
  if (missingQuestions.length > 0) {
    return fail(ctx, '存在未录入题目的人员，无法生成评价关系', -1, 200, { missing_questions: missingQuestions });
  }
  const result = generateRelations(batchId);
  success(ctx, result, `生成完成，共 ${result.total} 条关系`);
});

router.post('/', admin, async (ctx: Context) => {
  const { batch_id, evaluator_id, target_id, role_type, eval_type } = ctx.request.body as any;
  if (!batch_id || !evaluator_id || !target_id || !role_type || !eval_type) {
    return fail(ctx, '缺少必填字段');
  }
  const evaluator = UserModel.findById(evaluator_id);
  if (!evaluator) return fail(ctx, '评价人不存在', -1, 404);
  const target = UserModel.findById(target_id);
  if (!target) return fail(ctx, '被评人不存在', -1, 404);
  const result = RelationModel.batchCreate([{ batch_id, evaluator_id, target_id, role_type, eval_type }]);
  if (result.errors.length > 0) return fail(ctx, result.errors[0].message);
  success(ctx, null, '添加成功');
});

router.delete('/:id', admin, async (ctx: Context) => {
  const id = parseInt(ctx.params.id);
  const r = RelationModel.findById(id);
  if (!r) return fail(ctx, '关系不存在', -1, 404);
  RelationModel.delete(id);
  success(ctx, null, '删除成功');
});

router.post('/import', admin, async (ctx: Context) => {
  const { batch_id, relations } = ctx.request.body as any;
  if (!batch_id || !Array.isArray(relations)) return fail(ctx, '缺少 batch_id 或 relations');

  const processed = relations.map((r: any) => {
    const evaluator = UserModel.findByEmployeeNo(String(r['评价人工号'] || r.evaluator_no || ''));
    const target = UserModel.findByEmployeeNo(String(r['被评人工号'] || r.target_no || ''));
    return {
      evaluator_id: evaluator?.id ?? 0,
      target_id: target?.id ?? 0,
      role_type: evaluator?.level ?? 'staff',
      eval_type: r['关系类型'] || r.eval_type || 'peer',
      _error: !evaluator ? '评价人工号不存在' : !target ? '被评人工号不存在' : null,
    };
  });

  const errors: Array<{ row: number; message: string }> = [];
  const valid = processed.filter((r, idx) => {
    if (r._error) {
      errors.push({ row: idx + 2, message: r._error });
      return false;
    }
    if (!r.evaluator_id || !r.target_id) return false;
    return true;
  });

  const toCreate = valid.map(r => ({
    batch_id,
    evaluator_id: r.evaluator_id,
    target_id: r.target_id,
    role_type: r.role_type,
    eval_type: r.eval_type,
  }));

  const result = RelationModel.batchCreate(toCreate);
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
  const list = RelationModel.findByBatchId(batchId, filters);
  const rows = list.map(r => ({
    '评价人工号': r.evaluator_id,
    '评价人姓名': r.evaluator_name,
    '评价人部门': r.evaluator_department,
    '被评人工号': r.target_id,
    '被评人姓名': r.target_name,
    '被评人部门': r.target_department,
    '关系类型': r.eval_type,
    '状态': r.status,
  }));
  success(ctx, rows);
});

export default router;
