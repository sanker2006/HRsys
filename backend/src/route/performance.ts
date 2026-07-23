import Router from '@koa/router';
import { z } from 'zod';
import type { Context } from 'koa';
import { auth } from '../middleware/auth.js';
import { success, fail } from '../utils/response.js';
import { parseBody } from '../utils/validation.js';

const router = new Router({ prefix: '/api/v1/performance' });
const counters = new Map<number, { minute: number; count: number }>();

const clientMetricSchema = z.object({
  kind: z.enum(['api', 'route', 'view']),
  name: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_:/.-]+$/),
  duration_ms: z.number().finite().min(0).max(120_000),
  status: z.number().int().min(0).max(599).optional(),
  server_ms: z.number().finite().min(0).max(120_000).optional(),
  network: z.string().trim().max(20).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

function withinRateLimit(userId: number): boolean {
  const minute = Math.floor(Date.now() / 60_000);
  const current = counters.get(userId);
  if (!current || current.minute !== minute) {
    counters.set(userId, { minute, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 30;
}

router.post('/client', auth, async (ctx: Context) => {
  const userId = Number((ctx.state as any).userId);
  if (!withinRateLimit(userId)) return fail(ctx, '性能数据提交过于频繁', -1, 429);
  const metric = parseBody(ctx, clientMetricSchema);
  if (!metric) return;
  console.info('[ClientPerformance]', JSON.stringify({
    request_id: (ctx.state as any).requestId,
    user_id: userId,
    ...metric,
  }));
  success(ctx, null);
});

export default router;
