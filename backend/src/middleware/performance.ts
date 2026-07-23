import { randomUUID } from 'node:crypto';
import type { Middleware } from 'koa';
import { config } from '../config/index.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,80}$/;

function requestIdFromHeader(value: string): string {
  return REQUEST_ID_PATTERN.test(value) ? value : randomUUID();
}

export const performance: Middleware = async (ctx, next) => {
  const startedAt = performanceNow();
  const requestId = requestIdFromHeader(ctx.get('X-Request-ID'));
  ctx.state.requestId = requestId;
  ctx.set('X-Request-ID', requestId);

  try {
    await next();
  } finally {
    const durationMs = Math.round((performanceNow() - startedAt) * 10) / 10;
    ctx.set('Server-Timing', `app;dur=${durationMs.toFixed(1)}`);
    if (durationMs >= config.slowRequestMs) {
      console.warn('[SlowRequest]', JSON.stringify({
        request_id: requestId,
        method: ctx.method,
        path: ctx.path,
        status: ctx.status,
        duration_ms: durationMs,
      }));
    }
  }
};

function performanceNow(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}
