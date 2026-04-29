import type { Context } from 'koa';
import { z } from 'zod';
import { fail } from './response.js';

export function parseBody<T>(ctx: Context, schema: z.ZodType<T>): T | undefined {
  const result = schema.safeParse(ctx.request.body);
  if (result.success) return result.data;

  const message = result.error.issues[0]?.message || '请求参数不正确';
  fail(ctx, message, -1, 400);
  return undefined;
}
