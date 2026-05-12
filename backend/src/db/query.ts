import { getDriver, getSqlJsDb, getPgPool, type DbDriver } from './index.js';
import type { PoolClient } from 'pg';

export type SqlParam = string | number | boolean | null | Uint8Array;
export type DbExecutor = {
  queryAll<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  queryOne<T>(sql: string, params?: SqlParam[]): Promise<T | undefined>;
  execute(sql: string, params?: SqlParam[]): Promise<void>;
};

function normalizeParams(params: SqlParam[]): any[] {
  return params.map(value => typeof value === 'boolean' ? (value ? 1 : 0) : value);
}

function toPostgresSql(sql: string): string {
  let index = 0;
  return sql
    .replace(/\?/g, () => `$${++index}`)
    .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/INSERT OR IGNORE/gi, 'INSERT')
    .replace(/ORDER BY id DESC LIMIT 1/gi, 'ORDER BY id DESC LIMIT 1');
}

function sqlJsQueryAll<T>(sql: string, params: SqlParam[] = []): T[] {
  const stmt = getSqlJsDb().prepare(sql);
  const results: T[] = [];
  try {
    stmt.bind(normalizeParams(params));
    while (stmt.step()) results.push(stmt.getAsObject() as T);
    return results;
  } finally {
    stmt.free();
  }
}

function sqlJsExecute(sql: string, params: SqlParam[] = []): void {
  getSqlJsDb().run(sql, normalizeParams(params));
}

async function pgQueryAll<T>(sql: string, params: SqlParam[] = [], client?: PoolClient): Promise<T[]> {
  const runner = client ?? getPgPool();
  const result = await runner.query(toPostgresSql(sql), normalizeParams(params));
  return result.rows as T[];
}

async function pgExecute(sql: string, params: SqlParam[] = [], client?: PoolClient): Promise<void> {
  const runner = client ?? getPgPool();
  await runner.query(toPostgresSql(sql), normalizeParams(params));
}

export async function queryAll<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
  if (getDriver() === 'postgres') return pgQueryAll<T>(sql, params);
  return sqlJsQueryAll<T>(sql, params);
}

export async function queryOne<T>(sql: string, params: SqlParam[] = []): Promise<T | undefined> {
  const rows = await queryAll<T>(sql, params);
  return rows[0];
}

export async function execute(sql: string, params: SqlParam[] = []): Promise<void> {
  if (getDriver() === 'postgres') return pgExecute(sql, params);
  return sqlJsExecute(sql, params);
}

export async function transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  if (getDriver() === 'postgres') {
    const client = await getPgPool().connect();
    try {
      await client.query('BEGIN');
      const tx: DbExecutor = {
        queryAll: <R>(sql: string, params: SqlParam[] = []) => pgQueryAll<R>(sql, params, client),
        queryOne: async <R>(sql: string, params: SqlParam[] = []) => (await pgQueryAll<R>(sql, params, client))[0],
        execute: (sql: string, params: SqlParam[] = []) => pgExecute(sql, params, client),
      };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const db = getSqlJsDb();
  try {
    db.run('BEGIN');
    const tx: DbExecutor = {
      queryAll: async <R>(sql: string, params: SqlParam[] = []) => sqlJsQueryAll<R>(sql, params),
      queryOne: async <R>(sql: string, params: SqlParam[] = []) => sqlJsQueryAll<R>(sql, params)[0],
      execute: async (sql: string, params: SqlParam[] = []) => sqlJsExecute(sql, params),
    };
    const result = await fn(tx);
    db.run('COMMIT');
    return result;
  } catch (err) {
    try { db.run('ROLLBACK'); } catch {}
    throw err;
  }
}

export function driver(): DbDriver {
  return getDriver();
}
