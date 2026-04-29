import { getDb } from './index.js';

export type SqlParam = string | number | null | Uint8Array;

export function queryOne<T>(sql: string, params: SqlParam[] = []): T | undefined {
  const stmt = getDb().prepare(sql);
  try {
    stmt.bind(params);
    if (stmt.step()) return stmt.getAsObject() as T;
    return undefined;
  } finally {
    stmt.free();
  }
}

export function queryAll<T>(sql: string, params: SqlParam[] = []): T[] {
  const stmt = getDb().prepare(sql);
  const results: T[] = [];
  try {
    stmt.bind(params);
    while (stmt.step()) results.push(stmt.getAsObject() as T);
    return results;
  } finally {
    stmt.free();
  }
}
