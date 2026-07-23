import Router from '@koa/router';
import { UserModel } from '../model/user.js';
import { DepartmentModel } from '../model/department.js';
import { hash } from '../utils/password.js';
import { success, fail } from '../utils/response.js';
import { auth } from '../middleware/auth.js';
import { admin } from '../middleware/admin.js';
import { importRowNumber } from '../utils/import.js';
import type { Context } from 'koa';

const router = new Router({ prefix: '/api/v1/user' });

router.use(auth, admin);

function parseManagedDepartments(value: any): string[] {
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean);
  return String(value || '').split(/[|,，、]/).map(s => s.trim()).filter(Boolean);
}

function normalizeImportedRole(value: any): string {
  const text = String(value || '').trim();
  const map: Record<string, string> = {
    主要领导: 'main_leader',
    分管领导: 'division_leader',
    部门负责人: 'manager',
    员工: 'staff',
    领导层: 'division_leader',
    领导: 'division_leader',
  };
  return map[text] || text || 'staff';
}

function normalizeImportedStatus(value: any): 'active' | 'inactive' {
  return UserModel.normalizeStatus(value);
}

async function validateDepartmentExists(name: string): Promise<string | null> {
  if (!name || !(await DepartmentModel.findByName(name))) return `部门「${name || '空'}」不存在，请先在部门管理中创建`;
  return null;
}

async function validateManagedDepartments(departments: string[]): Promise<string | null> {
  for (const department of departments) {
    const error = await validateDepartmentExists(department);
    if (error) return `负责部门配置错误：${error}`;
  }
  return null;
}

function validPhone(phone: string): boolean {
  return /^1\d{10}$/.test(phone);
}

router.get('/', async (ctx: Context) => {
  const { department, level, keyword, status, page = '1', pageSize = '20' } = ctx.query as any;
  const p = Math.max(1, parseInt(page));
  const ps = Math.min(100, Math.max(1, parseInt(pageSize)));
  const filters: any = {};
  if (department) filters.department = department;
  if (level) filters.level = level;
  if (keyword) filters.keyword = keyword;
  if (status) filters.status = status;
  const { list, total } = await UserModel.findPage(filters, p, ps);
  success(ctx, { list: list.map(UserModel.toPublic), total, page: p, pageSize: ps });
});

router.post('/', async (ctx: Context) => {
  try {
    const { name, employee_no, department, position, level, phone, id_card_tail, status, is_admin, managed_departments } = ctx.request.body as any;
    if (!name || !employee_no || !department || !level || !id_card_tail || !phone) return fail(ctx, '缺少必填字段');
    if (!is_admin && !validPhone(String(phone))) return fail(ctx, '非管理员手机号必须为有效的11位手机号');
    const deptError = await validateDepartmentExists(department);
    if (deptError) return fail(ctx, deptError);
    const managed = parseManagedDepartments(managed_departments);
    const managedError = await validateManagedDepartments(managed);
    if (managedError) return fail(ctx, managedError);
    if (await UserModel.findByEmployeeNo(employee_no)) return fail(ctx, `工号 ${employee_no} 已存在`);
    const user = await UserModel.create({
      name,
      employee_no,
      department,
      position: position || '',
      level,
      phone: phone || '',
      id_card_tail,
      password: hash(is_admin ? id_card_tail : String(phone).slice(-4)),
      must_change_password: is_admin ? 0 : 1,
      status: status || 'active',
      is_admin: is_admin || 0,
      managed_departments: managed,
    });
    success(ctx, UserModel.toPublic(user), '创建成功');
  } catch (err: any) {
    fail(ctx, err.message || '创建失败');
  }
});

router.put('/:id', async (ctx: Context) => {
  try {
    const id = parseInt(ctx.params.id);
    const user = await UserModel.findById(id);
    if (!user) return fail(ctx, '用户不存在', -1, 404);
    const body = ctx.request.body as any;
    const data: any = {};
    for (const key of ['name', 'department', 'position', 'level', 'phone', 'id_card_tail', 'status', 'is_admin', 'managed_departments']) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (data.phone !== undefined && !user.is_admin && !validPhone(String(data.phone))) {
      return fail(ctx, '非管理员手机号必须为有效的11位手机号');
    }
    if (data.phone !== undefined && String(data.phone) !== user.phone) {
      data.password_version = user.password_version + 1;
      if (!user.is_admin && user.must_change_password === 1) {
        data.password = hash(String(data.phone).slice(-4));
        data.must_change_password = 1;
      }
    }
    if (data.managed_departments !== undefined) data.managed_departments = parseManagedDepartments(data.managed_departments);
    if (data.department !== undefined) {
      const deptError = await validateDepartmentExists(data.department);
      if (deptError) return fail(ctx, deptError);
    }
    if (data.managed_departments !== undefined) {
      const managedError = await validateManagedDepartments(data.managed_departments);
      if (managedError) return fail(ctx, managedError);
    }
    await UserModel.update(id, data);
    const updated = await UserModel.findById(id);
    success(ctx, UserModel.toPublic(updated!), '更新成功');
  } catch (err: any) {
    fail(ctx, err.message || '更新失败');
  }
});

router.post('/:id/reset-password', async (ctx: Context) => {
  try {
    const id = Number(ctx.params.id);
    const user = await UserModel.findById(id);
    if (!user) return fail(ctx, '用户不存在', -1, 404);
    if (user.is_admin === 1) return fail(ctx, '不能重置管理员密码', -1, 400);
    if (!validPhone(user.phone)) return fail(ctx, '该用户手机号无效，不能重置密码', -1, 400);
    const updated = await UserModel.resetPassword(
      id,
      hash(user.phone.slice(-4)),
      Number(ctx.state.userId),
      ctx.ip || null,
    );
    success(ctx, UserModel.toPublic(updated), '密码已重置为手机号后四位');
  } catch (err: any) {
    fail(ctx, err.message || '重置密码失败');
  }
});

router.delete('/:id', async (ctx: Context) => {
  const id = parseInt(ctx.params.id);
  const user = await UserModel.findById(id);
  if (!user) return fail(ctx, '用户不存在', -1, 404);
  if (user.is_admin) return fail(ctx, '不能删除管理员');
  await UserModel.delete(id);
  success(ctx, null, '删除成功');
});

router.get('/departments', async (ctx: Context) => {
  success(ctx, await UserModel.findDepartments());
});

router.post('/import', async (ctx: Context) => {
  const { users } = ctx.request.body as any;
  if (!Array.isArray(users)) return fail(ctx, '请传入用户数组');
  const errors: Array<{ row: number; message: string }> = [];
  const processed = [];
  for (let idx = 0; idx < users.length; idx++) {
    const u = users[idx];
    const sourceRow = importRowNumber(u, idx);
    const idTail = String(u['证件后四位'] || u['身份证后四位'] || u.id_card_tail || '');
    const item = {
      name: u['姓名'] || u.name || '',
      employee_no: String(u['工号'] || u.employee_no || ''),
      department: u['部门'] || u.department || '',
      position: u['岗位'] || u.position || '',
      level: normalizeImportedRole(u['角色'] || u['角色层级'] || u.level || 'staff'),
      phone: String(u['手机号'] || u.phone || ''),
      id_card_tail: idTail,
      password: '',
      must_change_password: 1,
      status: normalizeImportedStatus(u['状态'] || u.status),
      managed_departments: parseManagedDepartments(u['负责部门'] || u.managed_departments),
      source_row: sourceRow,
    };
    item.password = hash(item.phone.slice(-4));
    if (!validPhone(item.phone)) errors.push({ row: sourceRow, message: '手机号必须为有效的11位手机号' });
    const deptError = await validateDepartmentExists(item.department);
    if (deptError) errors.push({ row: sourceRow, message: deptError });
    const managedError = await validateManagedDepartments(item.managed_departments);
    if (managedError) errors.push({ row: sourceRow, message: managedError });
    processed.push(item);
  }
  const invalidRows = new Set(errors.map(e => e.row));
  const result = await UserModel.batchCreate(processed.filter(item => !invalidRows.has(item.source_row)));
  success(ctx, { ...result, errors: [...errors, ...result.errors] }, `成功导入 ${result.success} 人`);
});

router.get('/export', async (ctx: Context) => {
  const { department, level, status } = ctx.query as any;
  const filters: any = {};
  if (department) filters.department = department;
  if (level) filters.level = level;
  if (status) filters.status = status;
  const users = (await UserModel.findAll(filters)).map(UserModel.toPublic);
  success(ctx, users);
});

export default router;
