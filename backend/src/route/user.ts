import Router from '@koa/router';
import { UserModel } from '../model/user.js';
import { DepartmentModel } from '../model/department.js';
import { hash } from '../utils/password.js';
import { success, fail } from '../utils/response.js';
import { auth } from '../middleware/auth.js';
import { admin } from '../middleware/admin.js';
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
    if (!name || !employee_no || !department || !level || !id_card_tail) return fail(ctx, '缺少必填字段');
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
      password: hash(id_card_tail),
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
    const data: any = { ...ctx.request.body };
    if (data.id_card_tail) data.password = hash(data.id_card_tail);
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
    const idTail = String(u['证件后四位'] || u['身份证后四位'] || u.id_card_tail || '');
    const item = {
      name: u['姓名'] || u.name || '',
      employee_no: String(u['工号'] || u.employee_no || ''),
      department: u['部门'] || u.department || '',
      position: u['岗位'] || u.position || '',
      level: normalizeImportedRole(u['角色'] || u['角色层级'] || u.level || 'staff'),
      phone: String(u['手机号'] || u.phone || ''),
      id_card_tail: idTail,
      password: hash(idTail || '0000'),
      status: normalizeImportedStatus(u['状态'] || u.status),
      managed_departments: parseManagedDepartments(u['负责部门'] || u.managed_departments),
    };
    const deptError = await validateDepartmentExists(item.department);
    if (deptError) errors.push({ row: idx + 2, message: deptError });
    const managedError = await validateManagedDepartments(item.managed_departments);
    if (managedError) errors.push({ row: idx + 2, message: managedError });
    processed.push(item);
  }
  const invalidRows = new Set(errors.map(e => e.row));
  const result = await UserModel.batchCreate(processed.filter((_, idx) => !invalidRows.has(idx + 2)));
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
