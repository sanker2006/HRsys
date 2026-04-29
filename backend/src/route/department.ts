import Router from '@koa/router';
import { DepartmentModel } from '../model/department.js';
import { UserModel } from '../model/user.js';
import { success, fail } from '../utils/response.js';
import { auth } from '../middleware/auth.js';
import { admin } from '../middleware/admin.js';
import type { Context } from 'koa';

const router = new Router({ prefix: '/api/v1/department' });

router.use(auth);

// GET /api/v1/department/  - 列表
router.get('/', async (ctx: Context) => {
  const list = DepartmentModel.findAll();
  success(ctx, { list });
});

// POST /api/v1/department/  - 新增
router.post('/', admin, async (ctx: Context) => {
  const { name, sort_order } = ctx.request.body as any;
  if (!name || !name.trim()) return fail(ctx, '部门名称不能为空');

  const existing = DepartmentModel.findByName(name.trim());
  if (existing) return fail(ctx, '部门名称已存在');

  const dept = DepartmentModel.create(name.trim(), sort_order ?? 0);
  success(ctx, dept, '创建成功');
});

// PUT /api/v1/department/:id  - 修改
router.put('/:id', admin, async (ctx: Context) => {
  const id = parseInt(ctx.params.id);
  const { name, sort_order } = ctx.request.body as any;
  if (!name || !name.trim()) return fail(ctx, '部门名称不能为空');

  const existing = DepartmentModel.findById(id);
  if (!existing) return fail(ctx, '部门不存在', -1, 404);

  const duplicate = DepartmentModel.findByName(name.trim());
  if (duplicate && duplicate.id !== id) return fail(ctx, '部门名称已存在');

  DepartmentModel.update(id, name.trim(), sort_order);
  success(ctx, null, '修改成功');
});

// DELETE /api/v1/department/:id  - 删除
router.delete('/:id', admin, async (ctx: Context) => {
  const id = parseInt(ctx.params.id);
  const dept = DepartmentModel.findById(id);
  if (!dept) return fail(ctx, '部门不存在', -1, 404);

  // 检查是否有关联用户
  const users = UserModel.findAll({ department: dept.name });
  if (users.length > 0) return fail(ctx, `该部门下有 ${users.length} 名用户，无法删除`);

  DepartmentModel.delete(id);
  success(ctx, null, '删除成功');
});

export default router;
