import Router from '@koa/router';
import { EvalMatrixModel } from '../model/eval_matrix.js';
import { BatchModel } from '../model/batch.js';
import { success, fail } from '../utils/response.js';
import { auth } from '../middleware/auth.js';
import { admin } from '../middleware/admin.js';
import type { Context } from 'koa';

const router = new Router({ prefix: '/api/v1/eval-matrix' });

router.use(auth);

router.get('/:batchId', async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const batch = BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);

  let matrix = EvalMatrixModel.findByBatchId(batchId);
  if (matrix.length === 0) {
    EvalMatrixModel.initDefaultMatrix(batchId);
    matrix = EvalMatrixModel.findByBatchId(batchId);
  }
  success(ctx, { matrix, peer_cross_dept: batch.peer_cross_dept });
});

router.put('/:batchId', admin, async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const batch = BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  const { rows, peer_cross_dept } = ctx.request.body as any;
  if (!Array.isArray(rows)) return fail(ctx, '缺少 rows 字段');
  EvalMatrixModel.saveMatrix(batchId, rows);
  if (peer_cross_dept !== undefined) {
    BatchModel.update(batchId, { peer_cross_dept: peer_cross_dept ? 1 : 0 });
  }
  const matrix = EvalMatrixModel.findByBatchId(batchId);
  const updatedBatch = BatchModel.findById(batchId)!;
  success(ctx, { matrix, peer_cross_dept: updatedBatch.peer_cross_dept }, '保存成功');
});

router.post('/:batchId/reset', admin, async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const batch = BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  // 重置矩阵行 + peer_cross_dept
  EvalMatrixModel.deleteByBatchId(batchId);
  EvalMatrixModel.initDefaultMatrix(batchId);
  BatchModel.update(batchId, { peer_cross_dept: 0 });
  const matrix = EvalMatrixModel.findByBatchId(batchId);
  success(ctx, { matrix, peer_cross_dept: 0 }, '已重置为默认矩阵');
});

export default router;
