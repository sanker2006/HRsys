import Router from '@koa/router';
import { z } from 'zod';
import { UserModel } from '../model/user.js';
import { compare } from '../utils/password.js';
import { sign } from '../utils/jwt.js';
import { success, fail } from '../utils/response.js';
import { parseBody } from '../utils/validation.js';
import { auth } from '../middleware/auth.js';
import type { Context } from 'koa';

const router = new Router({ prefix: '/api/v1/auth' });

const loginSchema = z.object({
  account: z.string().trim().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
});

const h5LoginSchema = z.object({
  phone: z.string().regex(/^1\d{10}$/, '手机号格式不正确'),
  idCardTail: z.string().regex(/^\d{4}$/, '身份证后四位格式不正确'),
});

router.post('/login', async (ctx: Context) => {
  const body = parseBody(ctx, loginSchema);
  if (!body) return;

  const user = await UserModel.findByAccount(body.account);
  if (!user || !compare(body.password, user.password)) {
    return fail(ctx, '账号或密码错误');
  }

  const token = sign({ userId: user.id, isAdmin: user.is_admin });
  success(ctx, { token, user: UserModel.toPublic(user) }, '登录成功');
});

router.post('/h5-login', async (ctx: Context) => {
  const body = parseBody(ctx, h5LoginSchema);
  if (!body) return;

  const user = await UserModel.findByPhoneAndIdCard(body.phone, body.idCardTail);
  if (!user) return fail(ctx, '手机号或身份证后四位错误');
  if (user.status !== 'active') return fail(ctx, '账号已停用，请联系管理员', -1, 403);

  const token = sign({ userId: user.id, isAdmin: user.is_admin });
  success(ctx, { token, user: UserModel.toPublic(user) }, '登录成功');
});

router.get('/me', auth, async (ctx: Context) => {
  const user = await UserModel.findById(ctx.state.userId);
  if (!user) return fail(ctx, '用户不存在', -1, 404);
  success(ctx, UserModel.toPublic(user));
});

export default router;
