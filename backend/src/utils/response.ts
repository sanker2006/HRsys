import type { Context } from 'koa';

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T | null;
}

export function success<T = unknown>(ctx: Context, data?: T, message = 'ok'): void {
  ctx.body = { code: 0, message, data: data ?? null } as ApiResponse<T>;
}

export function fail(ctx: Context, message = '操作失败', code = -1, status = 200, data: unknown = null): void {
  ctx.status = status;
  ctx.body = { code, message, data } as ApiResponse;
}
