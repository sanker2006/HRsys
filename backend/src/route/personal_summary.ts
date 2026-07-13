import { readFile, unlink } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import Router from '@koa/router';
import type { Context } from 'koa';
import { BatchModel } from '../model/batch.js';
import { PersonalSummaryModel } from '../model/personal_summary.js';
import { RelationModel } from '../model/relation.js';
import { UserModel } from '../model/user.js';
import { auth } from '../middleware/auth.js';
import { admin } from '../middleware/admin.js';
import { execute } from '../db/query.js';
import { fail, success } from '../utils/response.js';

const router = new Router({ prefix: '/api/v1/personal-summary' });
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
const DOC_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

router.use(auth);

function positiveInt(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw Object.assign(new Error(`${label}无效`), { status: 400 });
  return parsed;
}

function normalizeUpload(files: any): any | undefined {
  const value = files?.file;
  return Array.isArray(value) ? value[0] : value;
}

export function validateWordFile(originalName: string, data: Buffer): { mimeType: string; extension: '.doc' | '.docx' } {
  if (!data.length) throw Object.assign(new Error('文件不能为空'), { status: 400 });
  if (data.length > MAX_FILE_SIZE) throw Object.assign(new Error('文件不能超过 10 MB'), { status: 413 });
  const extension = extname(originalName).toLowerCase();
  if (extension === '.doc') {
    if (!data.subarray(0, DOC_SIGNATURE.length).equals(DOC_SIGNATURE)) {
      throw Object.assign(new Error('文件内容不是有效的 Word .doc 文档'), { status: 400 });
    }
    return { extension, mimeType: 'application/msword' };
  }
  if (extension === '.docx') {
    const isZip = data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
    const hasWordDocument = data.includes(Buffer.from('word/document.xml'));
    const hasContentTypes = data.includes(Buffer.from('[Content_Types].xml'));
    if (!isZip || !hasWordDocument || !hasContentTypes) {
      throw Object.assign(new Error('文件内容不是有效的 Word .docx 文档'), { status: 400 });
    }
    return { extension, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }
  throw Object.assign(new Error('仅支持 .doc 或 .docx 文件'), { status: 400 });
}

function safeOriginalName(value: string): string {
  const name = basename(value.replace(/\\/g, '/')).replace(/[\r\n]/g, '').trim();
  if (!name || name.length > 255) throw Object.assign(new Error('文件名无效或过长'), { status: 400 });
  return name;
}

function setDownload(ctx: Context, file: { original_name: string; mime_type: string; file_data: Buffer }): void {
  ctx.set('Content-Type', file.mime_type);
  ctx.set('Content-Length', String(file.file_data.length));
  ctx.set('Cache-Control', 'private, no-store');
  ctx.set('X-Content-Type-Options', 'nosniff');
  ctx.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
  ctx.body = Buffer.from(file.file_data);
}

async function audit(ctx: Context, action: string, detail: Record<string, unknown>): Promise<void> {
  await execute(
    'INSERT INTO log (user_id, action, ip, detail) VALUES (?, ?, ?, ?)',
    [Number(ctx.state.userId), action, ctx.ip || null, JSON.stringify(detail)]
  );
}

async function editableBatch(ctx: Context, batchId: number) {
  const batch = await BatchModel.findById(batchId);
  if (!batch) {
    fail(ctx, '批次不存在', -1, 404);
    return null;
  }
  if (batch.status === 'closed') {
    fail(ctx, '已结束批次只能下载个人总结', -1, 409);
    return null;
  }
  return batch;
}

router.get('/admin/:batchId', admin, async (ctx: Context) => {
  const batchId = positiveInt(ctx.params.batchId, '批次 ID');
  const batch = await BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  const page = Math.max(1, Number.parseInt(String(ctx.query.page || '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(ctx.query.pageSize || '20'), 10) || 20));
  const uploadStatus = String(ctx.query.upload_status || '');
  const data = await PersonalSummaryModel.listAdmin(batchId, {
    keyword: String(ctx.query.keyword || '').trim() || undefined,
    department: String(ctx.query.department || '').trim() || undefined,
    upload_status: uploadStatus === 'uploaded' || uploadStatus === 'missing' ? uploadStatus : undefined,
  }, page, pageSize);
  success(ctx, { batch, ...data, page, pageSize });
});

router.put('/admin/:batchId/:userId', admin, async (ctx: Context) => {
  const batchId = positiveInt(ctx.params.batchId, '批次 ID');
  const userId = positiveInt(ctx.params.userId, '人员 ID');
  if (!await editableBatch(ctx, batchId)) return;
  const user = await UserModel.findById(userId);
  if (!user || user.is_admin || !['manager', 'staff'].includes(user.level)) {
    return fail(ctx, '被评价人不存在', -1, 404);
  }
  if (!await PersonalSummaryModel.isParticipant(batchId, userId)) {
    return fail(ctx, '该人员不属于当前批次评价对象', -1, 400);
  }
  const upload = normalizeUpload((ctx.request as any).files);
  if (!upload?.filepath) return fail(ctx, '请选择要上传的 Word 文件', -1, 400);
  let originalName = '';
  let data: Buffer;
  try {
    originalName = safeOriginalName(String(upload.originalFilename || ''));
    data = await readFile(upload.filepath);
  } finally {
    await unlink(upload.filepath).catch(() => undefined);
  }
  const validation = validateWordFile(originalName, data);
  const existing = await PersonalSummaryModel.findMetadata(batchId, userId);
  await PersonalSummaryModel.upsert({
    batchId,
    userId,
    originalName,
    mimeType: validation.mimeType,
    fileData: data,
    uploadedBy: Number(ctx.state.userId),
  });
  await audit(ctx, existing ? 'personal_summary.replace' : 'personal_summary.upload', {
    batch_id: batchId, user_id: userId, file_name: originalName, file_size: data.length,
  });
  success(ctx, await PersonalSummaryModel.findMetadata(batchId, userId), existing ? '替换成功' : '上传成功');
});

router.delete('/admin/:batchId/:userId', admin, async (ctx: Context) => {
  const batchId = positiveInt(ctx.params.batchId, '批次 ID');
  const userId = positiveInt(ctx.params.userId, '人员 ID');
  if (!await editableBatch(ctx, batchId)) return;
  const existing = await PersonalSummaryModel.findMetadata(batchId, userId);
  if (!existing) return fail(ctx, '该人员尚未上传个人总结', -1, 404);
  await PersonalSummaryModel.delete(batchId, userId);
  await audit(ctx, 'personal_summary.delete', {
    batch_id: batchId, user_id: userId, file_name: existing.original_name,
  });
  success(ctx, null, '删除成功');
});

router.get('/admin/:batchId/:userId/download', admin, async (ctx: Context) => {
  const batchId = positiveInt(ctx.params.batchId, '批次 ID');
  const userId = positiveInt(ctx.params.userId, '人员 ID');
  const batch = await BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  const file = await PersonalSummaryModel.findFile(batchId, userId);
  if (!file) return fail(ctx, '该人员尚未上传个人总结', -1, 404);
  await audit(ctx, 'personal_summary.admin_download', {
    batch_id: batchId, user_id: userId, file_name: file.original_name,
  });
  setDownload(ctx, file);
});

router.get('/relation/:relationId/download', async (ctx: Context) => {
  const relationId = positiveInt(ctx.params.relationId, '评价关系 ID');
  const relation = await RelationModel.findById(relationId);
  if (!relation) return fail(ctx, '评价关系不存在', -1, 404);
  if (relation.evaluator_id !== Number(ctx.state.userId) || relation.eval_type === 'self') {
    return fail(ctx, '无权查看此个人总结', -1, 403);
  }
  const file = await PersonalSummaryModel.findFile(relation.batch_id, relation.target_id);
  if (!file) return fail(ctx, '评价对象未上传个人总结', -1, 404);
  await audit(ctx, 'personal_summary.evaluator_download', {
    batch_id: relation.batch_id, user_id: relation.target_id,
    relation_id: relation.id, file_name: file.original_name,
  });
  setDownload(ctx, file);
});

export default router;
