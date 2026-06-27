import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initSqlJs from 'sql.js';
import { initDb, getMysqlPool, closeDb } from '../db/index.js';

const sourcePath = resolve(process.env.SQLJS_SOURCE || './data/hr360.db');

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
  'intern_user',
  'intern_attendance_record',
  'intern_attendance_adjustment',
] as const;

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
  intern_user: ['id', 'intern_no', 'name', 'phone', 'id_card_tail', 'department', 'position', 'mentor', 'start_date', 'end_date', 'status', 'created_at', 'updated_at'],
  intern_attendance_record: ['id', 'intern_id', 'punch_time', 'punch_date', 'latitude', 'longitude', 'accuracy', 'photo_data', 'photo_mime', 'evidence_type', 'source', 'created_at'],
  intern_attendance_adjustment: ['id', 'intern_id', 'record_id', 'target_date', 'action', 'reason', 'admin_id', 'created_at'],
};

const SQL = await initSqlJs();
const source = new SQL.Database(readFileSync(sourcePath));
await initDb();

function tableExists(table: string): boolean {
  const result = source.exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${table}'`);
  return !!result.length && result[0].values.length > 0;
}

function sourceRows(table: string): any[] {
  if (!tableExists(table)) return [];
  const result = source.exec(`SELECT ${columns[table].join(', ')} FROM ${table} ORDER BY id`);
  if (!result.length) return [];
  const colNames = result[0].columns;
  return result[0].values.map(values => Object.fromEntries(colNames.map((name, index) => [name, values[index]])));
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return Buffer.from(value);
  return value ?? null;
}

async function resetSequence(client: any, table: string): Promise<void> {
  const [rows] = await client.query(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ${table}`);
  const nextId = Number(rows?.[0]?.next_id || 1);
  await client.query(`ALTER TABLE ${table} AUTO_INCREMENT = ${Math.max(nextId, 1)}`);
}

const client = await getMysqlPool().getConnection();
try {
  await client.beginTransaction();
  await client.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of [...tables].reverse()) {
    await client.query(`DELETE FROM ${table}`);
  }
  await client.query('SET FOREIGN_KEY_CHECKS = 1');

  const report: Record<string, number> = {};
  const skipped: Record<string, Array<{ id: unknown; reason: string }>> = {};
  const validIds: Record<string, Set<unknown>> = {};

  function skip(table: string, row: any, reason: string): void {
    if (!skipped[table]) skipped[table] = [];
    skipped[table].push({ id: row.id, reason });
  }

  function isDeletedStatus(status: unknown): boolean {
    return ['deleted', 'inactive', 'disabled', 'removed'].includes(String(status ?? '').toLowerCase());
  }

  function validRows(table: string, rows: any[]): any[] {
    if (table === 'app_user' || table === 'intern_user') {
      return rows.filter(row => {
        if (isDeletedStatus(row.status)) {
          skip(table, row, `status ${row.status} is not migratable`);
          return false;
        }
        return true;
      });
    }
    if (table === 'batch') {
      return rows.filter(row => {
        if (String(row.status ?? '').toLowerCase() === 'deleted') {
          skip(table, row, `status ${row.status} is not migratable`);
          return false;
        }
        return true;
      });
    }
    if (table === 'division_leader_department') {
      return rows.filter(row => {
        if (!validIds.app_user.has(row.user_id)) {
          skip(table, row, `user_id ${row.user_id} 不存在`);
          return false;
        }
        return true;
      });
    }
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
    if (table === 'intern_attendance_record') {
      return rows.filter(row => {
        if (!validIds.intern_user.has(row.intern_id)) {
          skip(table, row, `intern_id ${row.intern_id} 不存在`);
          return false;
        }
        return true;
      });
    }
    if (table === 'intern_attendance_adjustment') {
      return rows.filter(row => {
        if (!validIds.intern_user.has(row.intern_id)) {
          skip(table, row, `intern_id ${row.intern_id} 不存在`);
          return false;
        }
        if (row.record_id !== null && row.record_id !== undefined && !validIds.intern_attendance_record.has(row.record_id)) {
          skip(table, row, `record_id ${row.record_id} 不存在`);
          return false;
        }
        if (row.admin_id !== null && row.admin_id !== undefined && !validIds.app_user.has(row.admin_id)) {
          skip(table, row, `admin_id ${row.admin_id} 不存在`);
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
    if (rows.length === 0) {
      await resetSequence(client, table);
      continue;
    }
    const cols = columns[table];
    const names = cols.map(col => `\`${col}\``).join(', ');
    const placeholders = cols.map(() => '?').join(', ');
    for (const row of rows) {
      await client.execute(
        `INSERT INTO ${table} (${names}) VALUES (${placeholders})`,
        cols.map(col => normalizeValue(row[col])) as any[]
      );
    }
    await resetSequence(client, table);
  }

  await client.commit();
  console.log(JSON.stringify({ ok: true, sourcePath, imported: report, skipped }, null, 2));
} catch (err) {
  try { await client.query('SET FOREIGN_KEY_CHECKS = 1'); } catch {}
  try { await client.rollback(); } catch {}
  throw err;
} finally {
  client.release();
  await closeDb();
}
