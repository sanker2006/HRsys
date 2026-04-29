import type { Middleware } from 'koa';
import { fail } from '../utils/response.js';

export const error: Middleware = async (ctx, next) => {
  try {
    await next();
  } catch (err: any) {
    console.error('[Error]', err.message);
    console.error('[Stack]', err.stack);
    const status = err.status || err.statusCode || 500;
    fail(ctx, status === 500 ? '服务器内部错误' : err.message, -1, status);
  }
};
