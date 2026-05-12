import { spawn, type ChildProcess } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const backendDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('PostgreSQL 压测需要配置 DATABASE_URL');
}

const port = Number(process.env.PRESSURE_PORT || 4027);
const base = process.env.PRESSURE_BASE_URL || `http://127.0.0.1:${port}/api/v1`;
const shouldStartServer = !process.env.PRESSURE_BASE_URL;
const adminAccount = process.env.ADMIN_ACCOUNT || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

type Metric = {
  total: number;
  concurrency: number;
  ok: number;
  errors: number;
  elapsedMs: number;
  rps: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
};

let server: ChildProcess | undefined;
let serverOutput = '';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.floor(values.length * pct));
  return Math.round(values[index]);
}

async function request(path: string, options: { method?: string; token?: string; body?: unknown } = {}): Promise<any> {
  const res = await fetch(`${base}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${options.method || 'GET'} ${path} returned ${res.status}: ${text}`);
  }
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 80; i++) {
    try {
      await request('/auth/login', { method: 'POST', body: { account: adminAccount, password: 'wrong' } });
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`后端未启动：\n${serverOutput}`);
}

async function ok(path: string, options: { method?: string; token?: string; body?: unknown } = {}): Promise<any> {
  const res = await request(path, options);
  if (res.code !== 0) throw new Error(`${options.method || 'GET'} ${path}: ${res.message}`);
  return res.data;
}

async function measure(
  name: string,
  total: number,
  concurrency: number,
  fn: (index: number) => Promise<boolean>
): Promise<Metric & { name: string }> {
  const latencies: number[] = [];
  let cursor = 0;
  let okCount = 0;
  let errors = 0;
  const started = performance.now();

  async function worker(): Promise<void> {
    while (cursor < total) {
      const index = cursor++;
      const t0 = performance.now();
      try {
        if (await fn(index)) okCount++;
        else errors++;
      } catch {
        errors++;
      } finally {
        latencies.push(performance.now() - t0);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsedMs = performance.now() - started;
  latencies.sort((a, b) => a - b);
  return {
    name,
    total,
    concurrency,
    ok: okCount,
    errors,
    elapsedMs: Math.round(elapsedMs),
    rps: Math.round((total / elapsedMs) * 1000),
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
  };
}

async function getPoolStats(): Promise<Record<string, number>> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query<{ state: string | null; count: string }>(
      `SELECT COALESCE(state, 'unknown') AS state, COUNT(*)::int AS count
       FROM pg_stat_activity
       WHERE datname = current_database()
       GROUP BY COALESCE(state, 'unknown')`
    );
    return Object.fromEntries(result.rows.map(row => [row.state || 'unknown', Number(row.count)]));
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  if (shouldStartServer) {
    server = spawn(process.execPath, ['dist/main.js'], {
      cwd: backendDir,
      env: {
        ...process.env,
        PORT: String(port),
        DB_DRIVER: 'postgres',
        DATABASE_URL: databaseUrl,
        CORS_ORIGINS: '*',
        NODE_ENV: 'pressure',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout?.on('data', chunk => { serverOutput += chunk.toString(); });
    server.stderr?.on('data', chunk => { serverOutput += chunk.toString(); });
  }

  await waitForServer();
  const adminLogin = await ok('/auth/login', { method: 'POST', body: { account: adminAccount, password: adminPassword } });
  const adminToken = adminLogin.token;

  const batches = await ok('/batch/', { token: adminToken });
  const batch = [...batches].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))[0];
  if (!batch) throw new Error('没有可压测的批次');

  const usersPage = await ok('/user/?status=active&pageSize=100', { token: adminToken });
  const h5Tokens: string[] = [];
  for (const user of usersPage.list.filter((u: any) => !u.is_admin && u.level !== 'admin')) {
    try {
      const login = await ok('/auth/h5-login', {
        method: 'POST',
        body: { phone: user.phone, idCardTail: user.id_card_tail },
      });
      h5Tokens.push(login.token);
    } catch {}
    if (h5Tokens.length >= 20) break;
  }
  if (h5Tokens.length === 0) throw new Error('没有可登录的 H5 用户，无法压测评价任务接口');

  let draftRelationId: number | undefined;
  let draftAnswers: Array<{ seq: number; score: number }> = [];
  for (const token of h5Tokens) {
    const relations = await ok(`/relation/my?batch_id=${batch.id}`, { token });
    const candidate = relations.list.find((r: any) => r.eval_type === 'peer' || r.eval_type === 'downward' || r.eval_type === 'self');
    if (!candidate) continue;
    const detail = await ok(`/answer/relation/${candidate.id}`, { token });
    const questions = (detail.questions || []).filter((q: any) => q.seq !== null && q.seq !== undefined);
    if (questions.length === 0) continue;
    draftRelationId = candidate.id;
    draftAnswers = questions.map((q: any) => ({ seq: Number(q.seq), score: Math.round(Number(q.max_score || q.weight || 1) * 0.8 * 10) / 10 }));
    break;
  }

  const formalRelationId = process.env.FORMAL_RELATION_ID ? Number(process.env.FORMAL_RELATION_ID) : undefined;
  const metrics = [];
  metrics.push(await measure('30 并发读取评价任务', 300, 30, async index => {
    const res = await request(`/relation/my?batch_id=${batch.id}`, { token: h5Tokens[index % h5Tokens.length] });
    return res.code === 0;
  }));

  if (draftRelationId && draftAnswers.length) {
    metrics.push(await measure('30 并发保存草稿', 150, 30, async () => {
      const res = await request('/answer/detail', {
        method: 'POST',
        token: h5Tokens[0],
        body: { relation_id: draftRelationId, answers: draftAnswers, draft: true },
      });
      return res.code === 0;
    }));
  }

  if (formalRelationId && draftAnswers.length) {
    metrics.push(await measure('10 并发正式提交评分', 50, 10, async () => {
      const res = await request('/answer/detail', {
        method: 'POST',
        token: h5Tokens[0],
        body: { relation_id: formalRelationId, answers: draftAnswers, draft: false },
      });
      return res.code === 0;
    }));
  }

  metrics.push(await measure('10 并发刷新进度统计', 100, 10, async index => {
    const path = index % 2 === 0 ? `/answer/admin/progress/${batch.id}` : `/answer/admin/statistics/${batch.id}`;
    const res = await request(path, { token: adminToken });
    return res.code === 0;
  }));

  console.log(JSON.stringify({
    ok: true,
    base,
    batch: { id: batch.id, name: batch.name, status: batch.status },
    h5TokenCount: h5Tokens.length,
    formalSubmit: formalRelationId ? 'enabled' : 'skipped: set FORMAL_RELATION_ID to run destructive formal submit pressure',
    pgPoolStats: await getPoolStats(),
    metrics,
  }, null, 2));
}

main().finally(async () => {
  if (server) {
    server.kill();
    await sleep(200);
  }
}).catch(err => {
  if (server) server.kill();
  console.error(err);
  process.exit(1);
});
