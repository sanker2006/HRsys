import Router from '@koa/router';
import { SelfQuestionModel } from '../model/self_question.js';
import { BatchModel } from '../model/batch.js';
import { UserModel } from '../model/user.js';
import { success, fail } from '../utils/response.js';
import { auth } from '../middleware/auth.js';
import { admin } from '../middleware/admin.js';
import type { Context } from 'koa';

const router = new Router({ prefix: '/api/v1/self-question' });

router.use(auth);

router.get('/:batchId', async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const rows = SelfQuestionModel.findByBatchId(batchId);
  const exports = SelfQuestionModel.toExportFormat(rows);
  success(ctx, exports);
});

router.get('/:batchId/me', async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const userId = (ctx.state as any).userId;
  const row = SelfQuestionModel.findByBatchAndUser(batchId, userId);
  if (!row) return fail(ctx, '该批次没有您的自评题目', -1, 404);
  success(ctx, SelfQuestionModel.toExportFormat([row])[0]);
});

router.post('/import', admin, async (ctx: Context) => {
  const { batch_id, items } = ctx.request.body as any;
  if (!batch_id) return fail(ctx, '缺少 batch_id');
  const batch = BatchModel.findById(batch_id);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  if (!Array.isArray(items)) return fail(ctx, 'items 必须是数组');

  const importErrors: Array<{ row: number; message: string }> = [];
  const valid: Array<{ user_id: number; data: any }> = [];

  items.forEach((item: any, idx: number) => {
    const employeeNo = String(item['工号'] || item.employee_no || '');
    const user = UserModel.findByEmployeeNo(employeeNo);
    if (!user) {
      importErrors.push({ row: idx + 2, message: `工号 ${employeeNo} 不存在` });
      return;
    }
    const data: any = {};
    for (let i = 1; i <= 10; i++) {
      const content = item[`题目${i}`] || item[`content_${i}`];
      const score = item[`分值${i}`] ?? item[`score_${i}`] ?? item[`权重${i}`] ?? item[`weight_${i}`];
      if (content) {
        data[`content_${i}`] = String(content);
        data[`weight_${i}`] = score !== undefined && score !== null && score !== '' ? parseFloat(String(score)) : null;
      }
    }
    valid.push({ user_id: user.id, data });
  });

  const result = SelfQuestionModel.batchUpsert(batch_id, valid);
  success(ctx, {
    success: result.success,
    errors: [...importErrors, ...result.errors],
  }, `导入完成，成功 ${result.success} 条`);
});

router.delete('/:batchId', admin, async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  SelfQuestionModel.deleteByBatchId(batchId);
  success(ctx, null, '已清除所有自评题目');
});

export default router;
