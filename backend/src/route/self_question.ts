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

function pickString(item: any, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function pickValue(item: any, keys: string[]): any {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return undefined;
}

function isBlankImportRow(item: any): boolean {
  if (!item || typeof item !== 'object') return true;
  return Object.entries(item).every(([key, value]) => {
    if (key === '__row' || key === 'row' || key === '题目状态' || key === 'question_status') return true;
    return value === undefined || value === null || String(value).trim() === '';
  });
}

router.get('/:batchId', async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const [rows, lockedIds] = await Promise.all([
    SelfQuestionModel.findByBatchId(batchId),
    SelfQuestionModel.findLockedTargetIds(batchId),
  ]);
  success(ctx, SelfQuestionModel.toExportFormat(rows).map(row => ({
    ...row,
    locked: lockedIds.has(row.user_id),
  })));
});

router.get('/:batchId/me', async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const userId = (ctx.state as any).userId;
  const row = await SelfQuestionModel.findByBatchAndUser(batchId, userId);
  if (!row) return fail(ctx, '该批次没有配置您的自评题目', -1, 404);
  success(ctx, SelfQuestionModel.toExportFormat([row])[0]);
});

router.post('/import', admin, async (ctx: Context) => {
  const { batch_id, items } = ctx.request.body as any;
  if (!batch_id) return fail(ctx, '缺少 batch_id');
  const batch = await BatchModel.findById(batch_id);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  if (!['draft', 'active'].includes(batch.status) || BatchModel.isPastEndTime(batch)) {
    return fail(ctx, '已结束或已过期批次不能导入题目', -1, 409);
  }
  if (!Array.isArray(items)) return fail(ctx, 'items 必须是数组');

  const importErrors: Array<{ row: number; employee_no?: string; user_name?: string; message: string }> = [];
  const valid: Array<{ row: number; user_id: number; employee_no: string; user_name: string; data: any }> = [];
  let skippedBlank = 0;
  let skippedNoQuestions = 0;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const row = Number(item.__row ?? item.row ?? idx + 2);
    if (isBlankImportRow(item)) {
      skippedBlank++;
      continue;
    }
    const employeeNo = pickString(item, ['工号', '员工号', 'employee_no', 'employeeNo']);
    const userName = pickString(item, ['姓名', 'name', 'user_name', 'userName']);

    if (!employeeNo) {
      importErrors.push({ row, message: '工号不能为空' });
      continue;
    }
    if (!userName) {
      importErrors.push({ row, employee_no: employeeNo, message: '姓名不能为空' });
      continue;
    }

    const user = await UserModel.findByEmployeeNo(employeeNo);
    if (!user) {
      importErrors.push({ row, employee_no: employeeNo, user_name: userName, message: `工号 ${employeeNo} 不存在` });
      continue;
    }
    if (String(user.name).trim() !== userName) {
      importErrors.push({
        row,
        employee_no: employeeNo,
        user_name: userName,
        message: `工号 ${employeeNo} 与姓名 ${userName} 不匹配，系统记录为 ${user.name}`,
      });
      continue;
    }

    const data: any = {};
    let hasQuestionInput = false;
    for (let i = 1; i <= 10; i++) {
      const content = pickString(item, [
        `业绩题${i}`, `业绩评价题${i}`, `业绩题目${i}`,
        `performance_content_${i}`, `performance_question_${i}`,
        `题目${i}`, `content_${i}`,
      ]);
      const score = pickValue(item, [
        `业绩分值${i}`, `业绩权重${i}`, `performance_score_${i}`,
        `performance_weight_${i}`, `分值${i}`, `权重${i}`,
        `score_${i}`, `weight_${i}`,
      ]);
      if (content || score !== undefined) hasQuestionInput = true;
      if (content) {
        data[`content_${i}`] = content;
        data[`weight_${i}`] = score !== undefined ? Number(score) : null;
      } else if (score !== undefined) {
        data[`weight_${i}`] = Number(score);
      }
    }

    for (let i = 1; i <= 5; i++) {
      const content = pickString(item, [
        `综合题${i}`, `综合评价题${i}`, `综合题目${i}`,
        `comprehensive_content_${i}`, `comprehensive_question_${i}`,
      ]);
      const score = pickValue(item, [
        `综合分值${i}`, `综合权重${i}`, `comprehensive_score_${i}`,
        `comprehensive_weight_${i}`,
      ]);
      if (content || score !== undefined) hasQuestionInput = true;
      if (content) {
        data[`comp_content_${i}`] = content;
        data[`comp_weight_${i}`] = score !== undefined ? Number(score) : null;
      } else if (score !== undefined) {
        data[`comp_weight_${i}`] = Number(score);
      }
    }

    if (!hasQuestionInput) {
      skippedNoQuestions++;
      continue;
    }

    valid.push({ row, user_id: user.id, employee_no: employeeNo, user_name: user.name, data });
  }

  const result = await SelfQuestionModel.batchUpsert(batch_id, valid);
  const errors = [...importErrors, ...result.errors].sort((a, b) => a.row - b.row);

  success(ctx, {
    total: items.length,
    processed: items.length - skippedBlank - skippedNoQuestions,
    skipped_blank: skippedBlank,
    skipped_no_questions: skippedNoQuestions,
    success: result.success,
    unchanged: result.unchanged,
    locked: result.errors.filter(error => error.code === 'locked').length,
    failed: errors.length,
    errors,
  }, `导入完成，成功 ${result.success} 条，失败 ${errors.length} 条`);
});

router.delete('/:batchId', admin, async (ctx: Context) => {
  const batchId = parseInt(ctx.params.batchId);
  const batch = await BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  if (batch.status !== 'draft') return fail(ctx, '只有草稿批次可以清空题目', -1, 409);
  if (await SelfQuestionModel.batchHasAnswers(batchId)) {
    return fail(ctx, '当前批次已经产生评价答案，不能清空题目', -1, 409);
  }
  await SelfQuestionModel.deleteByBatchId(batchId);
  success(ctx, null, '已清除所有自评题目');
});

export default router;
