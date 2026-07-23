import type { Middleware } from 'koa';
import { verify, type TokenScope } from '../utils/jwt.js';
import { fail } from '../utils/response.js';
import { UserModel } from '../model/user.js';

function bearerPayload(ctx: Parameters<Middleware>[0]) {
  const authHeader = ctx.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    fail(ctx, '未登录或 token 已过期', -1, 401);
    return null;
  }

  const token = authHeader.slice(7);
  const payload = verify(token);
  if (!payload) {
    fail(ctx, 'token 无效或已过期', -1, 401);
    return null;
  }
  return payload;
}

async function authenticate(ctx: Parameters<Middleware>[0], allowedScopes: TokenScope[]): Promise<boolean> {
  const payload = bearerPayload(ctx);
  if (!payload) return false;
  if (!allowedScopes.includes(payload.scope) || !Number.isInteger(payload.passwordVersion)) {
    fail(ctx, 'token 权限无效或已过期', -1, 401);
    return false;
  }

  const user = await UserModel.findAuthById(payload.userId);
  if (!user || user.status !== 'active') {
    fail(ctx, '账号已停用，请联系管理员', -1, 403);
    return false;
  }

  if (user.password_version !== payload.passwordVersion) {
    fail(ctx, '登录状态已失效，请重新登录', -1, 401);
    return false;
  }
  if (payload.scope === 'admin' && user.is_admin !== 1) {
    fail(ctx, 'token 权限无效', -1, 403);
    return false;
  }
  if (payload.scope !== 'admin' && user.is_admin === 1) {
    fail(ctx, 'token 权限无效', -1, 403);
    return false;
  }
  if (payload.scope === 'h5' && user.must_change_password === 1) {
    fail(ctx, '请先修改初始密码', -1, 403);
    return false;
  }
  if (payload.scope === 'password_change' && user.must_change_password !== 1) {
    fail(ctx, '改密凭证已失效，请重新登录', -1, 401);
    return false;
  }

  ctx.state.userId = user.id;
  ctx.state.isAdmin = user.is_admin === 1;
  ctx.state.authScope = payload.scope;
  ctx.state.authUser = user;
  return true;
}

export const auth: Middleware = async (ctx, next) => {
  if (!await authenticate(ctx, ['admin', 'h5'])) return;
  await next();
};

export const passwordChangeAuth: Middleware = async (ctx, next) => {
  if (!await authenticate(ctx, ['password_change'])) return;
  await next();
};
