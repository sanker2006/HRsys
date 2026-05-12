import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initSqlJs from 'sql.js';
import pg from 'pg';
import { initDb } from '../db/index.js';

const { Pool } = pg;
const sourcePath = resolve(process.env.SQLJS_SOURCE || './data/hr360.db');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('迁移到 PostgreSQL 必须配置 DATABASE_URL');
}
if (!existsSync(sourcePath)) {
  throw new Error(`找不到 sql.js 源数据库：${sourcePath}`);
}

const tables = [
  'department',
  'app_user',
  'division_leader_department',
  'batch',
  'eval_matrix',
  'relation',
  'self_question',
  'answer',
  'log',
];

const columns: Record<string, string[]> = {
  department: ['id', 'name', 'sort_order', 'created_at', 'updated_at'],
  app_user: ['id', 'name', 'employee_no', 'department', 'position', 'level', 'phone', 'id_card_tail', 'password', 'status', 'is_admin', 'created_at', 'updated_at'],
  division_leader_department: ['id', 'user_id', 'department', 'created_at'],
  batch: ['id', 'name', 'period', 'start_time', 'end_time', 'status', 'peer_cross_dept', 'created_at', 'updated_at'],
  eval_matrix: ['id', 'batch_id', 'from_role', 'to_role', 'eval_type', 'enabled', 'created_at'],
  relation: ['id', 'batch_id', 'evaluator_id', 'target_id', 'role_type', 'eval_type', 'status', 'is_anonymous', 'created_at', 'updated_at'],
  self_question: [
    'id', 'batch_id', 'user_id',
    'content_1', 'content_2', 'content_3', 'content_4', 'content_5', 'content_6', 'content_7', 'content_8', 'content_9', 'content_10',
    'weight_1', 'weight_2', 'weight_3', 'weight_4', 'weight_5', 'weight_6', 'weight_7', 'weight_8', 'weight_9', 'weight_10',
    'comp_content_1', 'comp_content_2', 'comp_content_3', 'comp_content_4', 'comp_content_5',
    'comp_weight_1', 'comp_weight_2', 'comp_weight_3', 'comp_weight_4', 'comp_weight_5',
    'created_at', 'updated_at',
  ],
  answer: ['id', 'relation_id', 'question_seq', 'score', 'is_total', 'is_draft', 'created_at', 'updated_at'],
  log: ['id', 'user_id', 'action', 'ip', 'detail', 'created_at'],
};

const SQL = await initSqlJs();
const source = new SQL.Database(readFileSync(sourcePath));
await initDb();
const pool = new Pool({ connectionString: databaseUrl });

function sourceRows(table: string): any[] {
  const result = source.exec(`SELECT ${columns[table].join(', ')} FROM ${table} ORDER BY id`);
  if (!result.length) return [];
  const colNames = result[0].columns;
  return result[0].values.map(values => Object.fromEntries(colNames.map((name, index) => [name, values[index]])));
}

async function resetSequence(client: pg.PoolClient, table: string): Promise<void> {
  await client.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), (SELECT COUNT(*) > 0 FROM ${table}))`,
    [table]
  );
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);

  const report: Record<string, number> = {};
  const skipped: Record<string, Array<{ id: unknown; reason: string }>> = {};
  const validIds: Record<string, Set<unknown>> = {};

  function skip(table: string, row: any, reason: string): void {
    if (!skipped[table]) skipped[table] = [];
    skipped[table].push({ id: row.id, reason });
  }

  function validRows(table: string, rows: any[]): any[] {
    if (table === 'division_leader_department') {
      return rows.filter(row => {
        if (!validIds.app_user.has(row.user_id)) {
          skip(table, row, `user_id ${row.user_id} 不存在`);
          return false;
        }
        return true;
      });
    }
    if (table === 'batch') return rows;
    if (table === 'eval_matrix') {
      return rows.filter(row => {
        if (!validIds.batch.has(row.batch_id)) {
          skip(table, row, `batch_id ${row.batch_id} 不存在`);
          return false;
        }
        return true;
      });
    }
    if (table === 'relation') {
      return rows.filter(row => {
        if (!validIds.batch.has(row.batch_id)) {
          skip(table, row, `batch_id ${row.batch_id} 不存在`);
          return false;
        }
        if (!validIds.app_user.has(row.evaluator_id)) {
          skip(table, row, `evaluator_id ${row.evaluator_id} 不存在`);
          return false;
        }
        if (!validIds.app_user.has(row.target_id)) {
          skip(table, row, `target_id ${row.target_id} 不存在`);
          return false;
        }
        return true;
      });
    }
    if (table === 'self_question') {
      return rows.filter(row => {
        if (!validIds.batch.has(row.batch_id)) {
          skip(table, row, `batch_id ${row.batch_id} 不存在`);
          return false;
        }
        if (!validIds.app_user.has(row.user_id)) {
          skip(table, row, `user_id ${row.user_id} 不存在`);
          return false;
        }
        return true;
      });
    }
    if (table === 'answer') {
      return rows.filter(row => {
        if (!validIds.relation.has(row.relation_id)) {
          skip(table, row, `relation_id ${row.relation_id} 不存在`);
          return false;
        }
        return true;
      });
    }
    if (table === 'log') {
      return rows.filter(row => {
        if (row.user_id !== null && row.user_id !== undefined && !validIds.app_user.has(row.user_id)) {
          skip(table, row, `user_id ${row.user_id} 不存在`);
          return false;
        }
        return true;
      });
    }
    return rows;
  }

  for (const table of tables) {
    const sourceTableRows = sourceRows(table);
    const rows = validRows(table, sourceTableRows);
    report[table] = rows.length;
    validIds[table] = new Set(rows.map(row => row.id));
    if (rows.length === 0) continue;
    const cols = columns[table];
    const names = cols.join(', ');
    const placeholders = cols.map((_, index) => `$${index + 1}`).join(', ');
    for (const row of rows) {
      await client.query(
        `INSERT INTO ${table} (${names}) VALUES (${placeholders})`,
        cols.map(col => row[col] ?? null)
      );
    }
    await resetSequence(client, table);
  }

  await client.query('COMMIT');
  console.log(JSON.stringify({ ok: true, sourcePath, imported: report, skipped }, null, 2));
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
  await pool.end();
}
