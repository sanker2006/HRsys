import Router from '@koa/router';
import { z } from 'zod';
import { UserModel } from '../model/user.js';
import { compare } from '../utils/password.js';
import { hash } from '../utils/password.js';
import { sign } from '../utils/jwt.js';
import { success, fail } from '../utils/response.js';
import { parseBody } from '../utils/validation.js';
import { auth, passwordChangeAuth } from '../middleware/auth.js';
import type { Context } from 'koa';
import { config } from '../config/index.js';
import { clearH5LoginFailures, getH5LoginLock, recordH5LoginFailure } from '../service/h5LoginGuard.js';

const router = new Router({ prefix: '/api/v1/auth' });

const loginSchema = z.object({
  account: z.string().trim().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
});

const h5LoginSchema = z.object({
  phone: z.string().trim().max(32),
  password: z.string().max(128),
});

const changePasswordSchema = z.object({
  new_password: z.string().min(8, '密码长度必须为8～32位').max(32, '密码长度必须为8～32位'),
  confirm_password: z.string(),
}).superRefine((value, ctx) => {
  if (value.new_password !== value.confirm_password) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirm_password'], message: '两次输入的密码不一致' });
  }
  if (!/[A-Za-z]/.test(value.new_password) || !/\d/.test(value.new_password)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['new_password'], message: '密码必须同时包含字母和数字' });
  }
});

const DUMMY_PASSWORD_HASH = '$2a$12$wGwVmBIKO4BGeyZzr8u4D.qQbMYB7c5vR5v1HplcfjQVOvELaN3Me';

function requireSecurePasswordTransport(ctx: Context): boolean {
  if (!config.requireHttpsForH5Password || ctx.secure) return true;
  fail(ctx, '当前连接未启用HTTPS，禁止传输密码', -1, 426);
  return false;
}

router.post('/login', async (ctx: Context) => {
  const body = parseBody(ctx, loginSchema);
  if (!body) return;

  const user = await UserModel.findByAccount(body.account);
  if (!user || !compare(body.password, user.password)) {
    return fail(ctx, '账号或密码错误');
  }

  const token = sign({
    userId: user.id,
    isAdmin: user.is_admin,
    scope: 'admin',
    passwordVersion: user.password_version,
  });
  success(ctx, { token, user: UserModel.toPublic(user) }, '登录成功');
});

router.post('/h5-login', async (ctx: Context) => {
  if (!requireSecurePasswordTransport(ctx)) return;
  const body = parseBody(ctx, h5LoginSchema);
  if (!body) return;

  const ip = ctx.ip || 'unknown';
  const lock = await getH5LoginLock(body.phone, ip);
  if (lock.locked) {
    ctx.set('Retry-After', String(Math.max(1, lock.retryAfter)));
    return fail(ctx, '登录尝试过于频繁，请15分钟后再试', -1, 429);
  }

  const user = /^1\d{10}$/.test(body.phone) ? await UserModel.findAuthByPhone(body.phone) : undefined;
  const passwordMatches = compare(body.password, user?.password ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches || user.is_admin === 1) {
    const nextLock = await recordH5LoginFailure(body.phone, ip);
    if (nextLock.locked) ctx.set('Retry-After', String(Math.max(1, nextLock.retryAfter)));
    return fail(ctx, '手机号或密码错误', -1, nextLock.locked ? 429 : 401);
  }
  if (user.status !== 'active') return fail(ctx, '账号已停用，请联系管理员', -1, 403);

  await clearH5LoginFailures(body.phone, ip);
  const mustChange = user.must_change_password === 1;
  const token = sign({
    userId: user.id,
    isAdmin: 0,
    scope: mustChange ? 'password_change' : 'h5',
    passwordVersion: user.password_version,
  }, mustChange ? '15m' : undefined);
  success(ctx, {
    token,
    must_change_password: mustChange,
    user: UserModel.toH5Public(user),
  }, '登录成功');
});

router.post('/change-password', passwordChangeAuth, async (ctx: Context) => {
  if (!requireSecurePasswordTransport(ctx)) return;
  const body = parseBody(ctx, changePasswordSchema);
  if (!body) return;
  const user = (ctx.state as any).authUser ?? await UserModel.findAuthById(ctx.state.userId);
  if (!user) return fail(ctx, '用户不存在', -1, 404);
  const suffix = user.phone.slice(-4);
  if (body.new_password === suffix) return fail(ctx, '新密码不能等于手机号后四位', -1, 400);
  if (compare(body.new_password, user.password)) return fail(ctx, '新密码不能与原密码相同', -1, 400);

  const updated = await UserModel.changePassword(user.id, hash(body.new_password), ctx.ip || null);
  const token = sign({
    userId: updated.id,
    isAdmin: 0,
    scope: 'h5',
    passwordVersion: updated.password_version,
  });
  success(ctx, {
    token,
    must_change_password: false,
    user: UserModel.toH5Public(updated),
  }, '密码修改成功');
});

router.get('/me', auth, async (ctx: Context) => {
  const user = (ctx.state as any).authUser;
  if (!user) return fail(ctx, '用户不存在', -1, 404);
  success(ctx, ctx.state.authScope === 'admin' ? UserModel.toPublic(user) : UserModel.toH5Public(user));
});

export default router;
