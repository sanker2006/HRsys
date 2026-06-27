import type { Middleware } from 'koa';
import { verify } from '../utils/jwt.js';
import { fail } from '../utils/response.js';
import { InternModel } from '../model/intern.js';

export const internAuth: Middleware = async (ctx, next) => {
  const authHeader = ctx.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return fail(ctx, '未登录或 token 已过期', -1, 401);
  }
  const payload = verify(authHeader.slice(7));
  if (!payload || (payload as any).scope !== 'intern' || !(payload as any).internId) {
    return fail(ctx, '实习生 token 无效或已过期', -1, 401);
  }
  const intern = await InternModel.findById(Number((payload as any).internId));
  if (!intern || intern.status !== 'active') return fail(ctx, '账号已停用，请联系管理员', -1, 403);
  ctx.state.internId = intern.id;
  ctx.state.intern = intern;
  await next();
};
