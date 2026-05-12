import type { Middleware } from 'koa';
import { verify } from '../utils/jwt.js';
import { fail } from '../utils/response.js';
import { UserModel } from '../model/user.js';

export const auth: Middleware = async (ctx, next) => {
  const authHeader = ctx.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return fail(ctx, '未登录或 token 已过期', -1, 401);
  }

  const token = authHeader.slice(7);
  const payload = verify(token);
  if (!payload) {
    return fail(ctx, 'token 无效或已过期', -1, 401);
  }

  ctx.state.userId = (payload as any).userId;
  ctx.state.isAdmin = (payload as any).isAdmin === 1;
  if (!ctx.state.isAdmin) {
    const user = await UserModel.findById(ctx.state.userId);
    if (!user || user.status !== 'active') return fail(ctx, '账号已停用，请联系管理员', -1, 403);
  }
  await next();
};
