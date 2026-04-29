import Router from '@koa/router';
import { UserModel } from '../model/user.js';
import { hash } from '../utils/password.js';
import { success, fail } from '../utils/response.js';
import { auth } from '../middleware/auth.js';
import { admin } from '../middleware/admin.js';
import type { Context } from 'koa';

const router = new Router({ prefix: '/api/v1/user' });

// 所有用户路由需要鉴权 + 管理员权限
router.use(auth, admin);

router.get('/', async (ctx: Context) => {
  const { department, level, keyword, page = '1', pageSize = '20' } = ctx.query as any;
  const p = Math.max(1, parseInt(page));
  const ps = Math.min(100, Math.max(1, parseInt(pageSize)));
  const filters: any = {};
  if (department) filters.department = department;
  if (level) filters.level = level;
  if (keyword) filters.keyword = keyword;

  const { list, total } = UserModel.findPage(filters, p, ps);

  success(ctx, {
    list: list.map(UserModel.toPublic),
    total,
    page: p,
    pageSize: ps,
  });
});

router.post('/', async (ctx: Context) => {
  const { name, employee_no, department, position, level, phone, id_card_tail, is_admin } = ctx.request.body as any;
  if (!name || !employee_no || !department || !level || !id_card_tail) {
    return fail(ctx, '缺少必填字段');
  }
  const existing = UserModel.findByEmployeeNo(employee_no);
  if (existing) return fail(ctx, `工号 ${employee_no} 已存在`);

  // 校验 phone + id_card_tail 唯一性
  const phoneDup = UserModel.findByPhoneAndIdCard(phone || '', id_card_tail);
  if (phoneDup) return fail(ctx, `手机号 ${phone} + 身份证后四位 ${id_card_tail} 已被用户「${phoneDup.name}」使用`);

  const user = UserModel.create({
    name, employee_no, department, position: position || '', level,
    phone: phone || '', id_card_tail, password: hash(id_card_tail), is_admin: is_admin || 0,
  });
  success(ctx, UserModel.toPublic(user), '创建成功');
});

router.put('/:id', async (ctx: Context) => {
  const id = parseInt(ctx.params.id);
  const user = UserModel.findById(id);
  if (!user) return fail(ctx, '用户不存在', -1, 404);

  const data: any = { ...ctx.request.body };
  if (data.id_card_tail) data.password = hash(data.id_card_tail);

  // 修改 phone 或 id_card_tail 时校验唯一性
  if (data.phone !== undefined || data.id_card_tail !== undefined) {
    const phone = data.phone ?? user.phone;
    const idCardTail = data.id_card_tail ?? user.id_card_tail;
    const conflict = UserModel.findByPhoneAndIdCardExclude(phone, idCardTail, id);
    if (conflict) return fail(ctx, `手机号 ${phone} + 身份证后四位 ${idCardTail} 已被用户「${conflict.name}」使用`);
  }

  UserModel.update(id, data);
  const updated = UserModel.findById(id);
  success(ctx, UserModel.toPublic(updated!), '更新成功');
});

router.delete('/:id', async (ctx: Context) => {
  const id = parseInt(ctx.params.id);
  const user = UserModel.findById(id);
  if (!user) return fail(ctx, '用户不存在', -1, 404);
  if (user.is_admin) return fail(ctx, '不能删除管理员');
  UserModel.delete(id);
  success(ctx, null, '删除成功');
});

router.get('/departments', async (ctx: Context) => {
  success(ctx, UserModel.findDepartments());
});

router.post('/import', async (ctx: Context) => {
  const { users } = ctx.request.body as any;
  if (!Array.isArray(users)) return fail(ctx, '请传入用户数组');

  const processed = users.map((u: any) => ({
    name: u['姓名'] || u.name || '',
    employee_no: String(u['工号'] || u.employee_no || ''),
    department: u['部门'] || u.department || '',
    position: u['岗位'] || u.position || '',
    level: u['角色层级'] || u.level || 'staff',
    phone: String(u['手机号'] || u.phone || ''),
    id_card_tail: String(u['身份证号码后四位'] || u['身份证后四位'] || u.id_card_tail || ''),
    password: hash(String(u['身份证号码后四位'] || u['身份证后四位'] || u.id_card_tail || '0000')),
  }));

  const result = UserModel.batchCreate(processed);
  success(ctx, result, `成功导入 ${result.success} 人`);
});

// 导出用户列表
router.get('/export', async (ctx: Context) => {
  const { department, level } = ctx.query as any;
  const filters: any = {};
  if (department) filters.department = department;
  if (level) filters.level = level;
  const users = UserModel.findAll(filters).map(UserModel.toPublic);
  success(ctx, users);
});

export default router;
