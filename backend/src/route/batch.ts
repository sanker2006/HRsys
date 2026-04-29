import Router from '@koa/router';
import { BatchModel } from '../model/batch.js';
import { RelationModel } from '../model/relation.js';
import { success, fail } from '../utils/response.js';
import { auth } from '../middleware/auth.js';
import { admin } from '../middleware/admin.js';
import type { Context } from 'koa';

const router = new Router({ prefix: '/api/v1/batch' });

router.use(auth);

router.get('/', async (ctx: Context) => {
  const { status, keyword } = ctx.query as any;
  const batches = BatchModel.findAll({ status, keyword });
  const list = batches.map(b => {
    const stats = RelationModel.getStats(b.id);
    return { ...b, ...stats };
  });
  success(ctx, list);
});

router.get('/:id', async (ctx: Context) => {
  const id = parseInt(ctx.params.id);
  const batch = BatchModel.findById(id);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  const stats = RelationModel.getStats(id);
  success(ctx, { ...batch, ...stats });
});

router.post('/', admin, async (ctx: Context) => {
  const { name, period, start_time, end_time, peer_cross_dept } = ctx.request.body as any;
  if (!name || !start_time || !end_time) return fail(ctx, '缺少必填字段');
  const batch = BatchModel.create({ name, period, start_time, end_time, peer_cross_dept });
  success(ctx, batch, '创建成功');
});

router.put('/:id', admin, async (ctx: Context) => {
  const id = parseInt(ctx.params.id);
  const existing = BatchModel.findById(id);
  if (!existing) return fail(ctx, '批次不存在', -1, 404);
  const data = ctx.request.body as any;
  BatchModel.update(id, data);
  const updated = BatchModel.findById(id)!;
  success(ctx, updated, '更新成功');
});

router.post('/:id/start', admin, async (ctx: Context) => {
  const id = parseInt(ctx.params.id);
  const batch = BatchModel.findById(id);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  if (batch.status !== 'draft') return fail(ctx, '只有草稿状态的批次可以启动');
  BatchModel.update(id, { status: 'active' });
  success(ctx, BatchModel.findById(id), '已启动');
});

router.post('/:id/close', admin, async (ctx: Context) => {
  const id = parseInt(ctx.params.id);
  const batch = BatchModel.findById(id);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  if (batch.status === 'closed') return fail(ctx, '批次已结束');
  BatchModel.update(id, { status: 'closed' });
  success(ctx, BatchModel.findById(id), '已结束');
});

router.delete('/:id', admin, async (ctx: Context) => {
  const id = parseInt(ctx.params.id);
  const batch = BatchModel.findById(id);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  if (batch.status === 'active') return fail(ctx, '进行中的批次不能删除');
  BatchModel.delete(id);
  success(ctx, null, '删除成功');
});

export default router;
