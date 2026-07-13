import type { Middleware } from 'koa';
import { fail } from '../utils/response.js';

export const error: Middleware = async (ctx, next) => {
  try {
    await next();
  } catch (err: any) {
    console.error('[Error]', err.message);
    console.error('[Stack]', err.stack);
    const fileTooLarge = err.code === 1009 || err.httpCode === 413;
    const status = err.status || err.statusCode || err.httpCode || (fileTooLarge ? 413 : 500);
    const message = fileTooLarge ? '文件不能超过 10 MB' : status === 500 ? '服务器内部错误' : err.message;
    fail(ctx, message, -1, status);
  }
};
