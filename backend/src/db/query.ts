import type mysql from 'mysql2/promise';
import { getDriver, getMysqlPool, type DbDriver } from './index.js';

export type SqlParam = string | number | boolean | null | Uint8Array | Buffer;
export type DbExecutor = {
  queryAll<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  queryOne<T>(sql: string, params?: SqlParam[]): Promise<T | undefined>;
  execute(sql: string, params?: SqlParam[]): Promise<void>;
};

function normalizeParams(params: SqlParam[]): any[] {
  return params.map(value => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Uint8Array && !Buffer.isBuffer(value)) return Buffer.from(value);
    return value;
  });
}

function toMysqlSql(sql: string): string {
  return sql
    .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/INSERT OR IGNORE/gi, 'INSERT IGNORE')
    .replace(/ORDER BY question_seq NULLS FIRST/gi, 'ORDER BY question_seq IS NOT NULL, question_seq')
    .replace(/ORDER BY relation_id, question_seq NULLS FIRST/gi, 'ORDER BY relation_id, question_seq IS NOT NULL, question_seq');
}

async function mysqlQueryAll<T>(
  sql: string,
  params: SqlParam[] = [],
  runner: mysql.Pool | mysql.PoolConnection = getMysqlPool()
): Promise<T[]> {
  const [rows] = await runner.query(toMysqlSql(sql), normalizeParams(params));
  return rows as T[];
}

async function mysqlExecute(
  sql: string,
  params: SqlParam[] = [],
  runner: mysql.Pool | mysql.PoolConnection = getMysqlPool()
): Promise<void> {
  await runner.execute(toMysqlSql(sql), normalizeParams(params));
}

export async function queryAll<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
  return mysqlQueryAll<T>(sql, params);
}

export async function queryOne<T>(sql: string, params: SqlParam[] = []): Promise<T | undefined> {
  const rows = await queryAll<T>(sql, params);
  return rows[0];
}

export async function execute(sql: string, params: SqlParam[] = []): Promise<void> {
  await mysqlExecute(sql, params);
}

export async function transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const tx: DbExecutor = {
      queryAll: <R>(sql: string, params: SqlParam[] = []) => mysqlQueryAll<R>(sql, params, connection),
      queryOne: async <R>(sql: string, params: SqlParam[] = []) => (await mysqlQueryAll<R>(sql, params, connection))[0],
      execute: (sql: string, params: SqlParam[] = []) => mysqlExecute(sql, params, connection),
    };
    const result = await fn(tx);
    await connection.commit();
    return result;
  } catch (err) {
    try { await connection.rollback(); } catch {}
    throw err;
  } finally {
    connection.release();
  }
}

export function driver(): DbDriver {
  return getDriver();
}
