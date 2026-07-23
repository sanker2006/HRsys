import type { Middleware } from 'koa';
import { fail } from '../utils/response.js';

export const admin: Middleware = async (ctx, next) => {
  if (!ctx.state.isAdmin || ctx.state.authScope !== 'admin') {
    return fail(ctx, '需要管理员权限', -1, 403);
  }
  await next();
};
