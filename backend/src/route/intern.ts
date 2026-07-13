import Router from '@koa/router';
import { z } from 'zod';
import type { Context } from 'koa';
import { sign } from '../utils/jwt.js';
import { parseBody } from '../utils/validation.js';
import { success, fail } from '../utils/response.js';
import { auth } from '../middleware/auth.js';
import { admin } from '../middleware/admin.js';
import { internAuth } from '../middleware/intern_auth.js';
import { InternModel } from '../model/intern.js';

const authRouter = new Router({ prefix: '/api/v1/intern-auth' });
const internRouter = new Router({ prefix: '/api/v1/intern' });
const adminRouter = new Router({ prefix: '/api/v1/admin' });

const loginSchema = z.object({
  phone: z.string().regex(/^1\d{10}$/, '手机号格式不正确'),
  idCardTail: z.string().regex(/^\d{4}$/, '身份证后四位格式不正确'),
});

function attendanceFilters(query: Record<string, unknown>) {
  return {
    month: query.month ? String(query.month) : undefined,
    startDate: query.start_date ? String(query.start_date) : undefined,
    endDate: query.end_date ? String(query.end_date) : undefined,
    internId: query.intern_id ? Number(query.intern_id) : undefined,
    department: query.department ? String(query.department) : undefined,
    keyword: query.keyword ? String(query.keyword).trim() : undefined,
    status: query.status ? String(query.status) : undefined,
  };
}

authRouter.post('/login', async (ctx: Context) => {
  const body = parseBody(ctx, loginSchema);
  if (!body) return;
  const intern = await InternModel.findByPhoneAndIdCard(body.phone, body.idCardTail);
  if (!intern) return fail(ctx, '手机号或身份证后四位错误');
  if (intern.status !== 'active') return fail(ctx, '账号已停用，请联系管理员', -1, 403);
  const token = sign({ internId: intern.id, scope: 'intern' });
  success(ctx, { intern_token: token, intern: InternModel.publicIntern(intern) }, '登录成功');
});

internRouter.use(internAuth);

internRouter.get('/me', async (ctx: Context) => {
  success(ctx, InternModel.publicIntern(ctx.state.intern));
});

internRouter.post('/attendance/punch', async (ctx: Context) => {
  try {
    const body = ctx.request.body as any;
    const record = await InternModel.punch(ctx.state.internId, {
      latitude: body.latitude,
      longitude: body.longitude,
      accuracy: body.accuracy,
      photoBase64: body.photoBase64 || body.photo_base64,
    });
    success(ctx, record ? InternModel.recordPublic(record) : record, '打卡成功');
  } catch (err: any) {
    fail(ctx, err.message || '打卡失败');
  }
});

internRouter.get('/attendance/month', async (ctx: Context) => {
  try {
    const month = String((ctx.query as any).month || InternModel.localDate().slice(0, 7));
    success(ctx, await InternModel.monthStats(month, ctx.state.internId));
  } catch (err: any) {
    fail(ctx, err.message || '查询失败');
  }
});

internRouter.get('/attendance/year', async (ctx: Context) => {
  try {
    const year = String((ctx.query as any).year || InternModel.localDate().slice(0, 4));
    success(ctx, await InternModel.yearStats(year, ctx.state.internId));
  } catch (err: any) {
    fail(ctx, err.message || '查询失败');
  }
});

adminRouter.use(auth, admin);

adminRouter.get('/interns', async (ctx: Context) => {
  const { keyword, department, status, page = '1', pageSize = '20' } = ctx.query as any;
  const data = await InternModel.findPage(
    { keyword, department, status },
    Math.max(1, parseInt(page)),
    Math.min(100, Math.max(1, parseInt(pageSize)))
  );
  success(ctx, data);
});

adminRouter.post('/interns', async (ctx: Context) => {
  try {
    const body = ctx.request.body as any;
    if (!body.intern_no || !body.name || !body.phone || !body.id_card_tail || !body.start_date || !body.end_date) {
      return fail(ctx, '缺少必填字段');
    }
    const intern = await InternModel.create({
      intern_no: body.intern_no,
      name: body.name,
      phone: body.phone,
      id_card_tail: body.id_card_tail,
      department: body.department || '',
      position: body.position || '',
      mentor: body.mentor || '',
      start_date: body.start_date,
      end_date: body.end_date,
      status: body.status || 'active',
    });
    success(ctx, intern, '创建成功');
  } catch (err: any) {
    fail(ctx, err.message || '创建失败');
  }
});

adminRouter.put('/interns/:id', async (ctx: Context) => {
  try {
    const id = parseInt(ctx.params.id);
    await InternModel.update(id, ctx.request.body as any);
    const updated = await InternModel.findById(id);
    success(ctx, updated, '更新成功');
  } catch (err: any) {
    fail(ctx, err.message || '更新失败');
  }
});

adminRouter.post('/interns/import', async (ctx: Context) => {
  const { interns } = ctx.request.body as any;
  if (!Array.isArray(interns)) return fail(ctx, '请传入实习生数组');
  const result = await InternModel.batchCreate(interns);
  success(ctx, result, `成功导入 ${result.success} 人`);
});

adminRouter.get('/intern-attendance/records', async (ctx: Context) => {
  try {
    const query = ctx.query as any;
    const page = Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(query.pageSize || query.page_size || '20'), 10) || 20));
    success(ctx, await InternModel.records(attendanceFilters(query), page, pageSize));
  } catch (err: any) {
    fail(ctx, err.message || '查询失败');
  }
});

adminRouter.get('/intern-attendance/records/:id/photo', async (ctx: Context) => {
  try {
    const recordId = Number(ctx.params.id);
    if (!Number.isInteger(recordId) || recordId <= 0) {
      return fail(ctx, '打卡记录 ID 无效', -1, 400);
    }

    const record = await InternModel.recordPhoto(recordId);
    const photoData = record?.photo_data ? Buffer.from(record.photo_data as any) : null;
    if (!record || !photoData?.length) {
      ctx.status = 404;
      return fail(ctx, '该打卡记录没有照片', -1, 404);
    }

    ctx.set('Content-Type', record.photo_mime || 'image/jpeg');
    ctx.set('Cache-Control', 'no-store');
    ctx.set('Content-Disposition', 'inline');
    ctx.body = photoData;
  } catch (err: any) {
    fail(ctx, err.message || '照片读取失败');
  }
});

adminRouter.get('/intern-attendance/statistics', async (ctx: Context) => {
  try {
    success(ctx, await InternModel.rangeStats(attendanceFilters(ctx.query as any)));
  } catch (err: any) {
    fail(ctx, err.message || '查询失败');
  }
});

adminRouter.post('/intern-attendance/adjustments', async (ctx: Context) => {
  try {
    const body = ctx.request.body as any;
    if (!body.intern_id || !body.target_date || !body.action || !body.reason) return fail(ctx, '缺少必填字段');
    await InternModel.adjust({
      intern_id: Number(body.intern_id),
      record_id: body.record_id ? Number(body.record_id) : null,
      target_date: body.target_date,
      action: body.action,
      reason: body.reason,
      admin_id: ctx.state.userId,
    });
    success(ctx, null, '调整已记录');
  } catch (err: any) {
    fail(ctx, err.message || '调整失败');
  }
});

adminRouter.get('/intern-attendance/export', async (ctx: Context) => {
  try {
    const filters = attendanceFilters(ctx.query as any);
    const range = InternModel.attendanceRange(filters);
    const workbook = await InternModel.exportAttendance(filters);
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`实习生考勤统计-${range.label}.xlsx`)}`);
    ctx.body = await workbook.xlsx.writeBuffer();
  } catch (err: any) {
    fail(ctx, err.message || '导出失败');
  }
});

export default [authRouter, internRouter, adminRouter];
