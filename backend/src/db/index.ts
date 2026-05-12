import initSqlJs, { Database } from 'sql.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import pg from 'pg';

export type DbDriver = 'sqljs' | 'postgres';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'data', 'hr360.db');
const DATABASE_URL = process.env.DATABASE_URL || '';
const DB_DRIVER = (process.env.DB_DRIVER || '').toLowerCase();

let driver: DbDriver = DATABASE_URL || DB_DRIVER === 'postgres' ? 'postgres' : 'sqljs';
let sqlJsDb: Database | null = null;
let pgPool: pg.Pool | null = null;
let saveTimer: NodeJS.Timeout | null = null;
let dirty = false;

const SAVE_DEBOUNCE_MS = parseInt(process.env.DB_SAVE_DEBOUNCE_MS || '200', 10);

function readSchema(name = 'schema.sql'): string {
  const candidates = [
    join(__dirname, name),
    join(process.cwd(), 'src', 'db', name),
  ];
  const schemaPath = candidates.find(path => existsSync(path));
  if (!schemaPath) throw new Error(`找不到数据库 ${name}`);
  return readFileSync(schemaPath, 'utf-8');
}

function splitSql(sql: string): string[] {
  return sql.split(';').map(s => s.trim()).filter(Boolean);
}

async function initPostgres(): Promise<void> {
  if (!DATABASE_URL) throw new Error('DB_DRIVER=postgres 时必须配置 DATABASE_URL');
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    max: parseInt(process.env.PG_POOL_MAX || '20', 10),
    idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT_MS || '30000', 10),
  });
  await pgPool.query('SELECT 1');
  for (const stmt of splitSql(readSchema('schema.postgres.sql'))) {
    await pgPool.query(stmt);
  }
  await ensureAdminPostgres();
}

function hasColumn(table: string, column: string): boolean {
  const result = sqlJsDb!.exec(`PRAGMA table_info(${table})`);
  const rows = result[0]?.values ?? [];
  return rows.some(row => row[1] === column);
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  if (!hasColumn(table, column)) {
    sqlJsDb!.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function initSqlJsDb(): Promise<void> {
  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    sqlJsDb = new SQL.Database(readFileSync(DB_PATH));
  } else {
    sqlJsDb = new SQL.Database();
  }

  sqlJsDb.run('PRAGMA foreign_keys = ON;');

  const statements = splitSql(readSchema('schema.sql'));
  for (const stmt of statements) {
    try {
      sqlJsDb.run(stmt);
    } catch (e: any) {
      if (!e.message.includes('already exists')) throw e;
    }
  }

  addColumnIfMissing('self_question', 'comp_content_1', 'TEXT');
  addColumnIfMissing('self_question', 'comp_content_2', 'TEXT');
  addColumnIfMissing('self_question', 'comp_content_3', 'TEXT');
  addColumnIfMissing('self_question', 'comp_content_4', 'TEXT');
  addColumnIfMissing('self_question', 'comp_content_5', 'TEXT');
  addColumnIfMissing('self_question', 'comp_weight_1', 'REAL');
  addColumnIfMissing('self_question', 'comp_weight_2', 'REAL');
  addColumnIfMissing('self_question', 'comp_weight_3', 'REAL');
  addColumnIfMissing('self_question', 'comp_weight_4', 'REAL');
  addColumnIfMissing('self_question', 'comp_weight_5', 'REAL');
  addColumnIfMissing('app_user', 'status', "TEXT NOT NULL DEFAULT 'active'");

  sqlJsDb.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_phone_idcard ON app_user(phone, id_card_tail)');
  ensureAdminSqlJs();
  saveDb();
}

function ensureAdminSqlJs(): void {
  const adminResult = sqlJsDb!.exec("SELECT id FROM app_user WHERE employee_no = 'admin'");
  if (!adminResult.length || !adminResult[0].values.length) {
    const hash = bcrypt.hashSync('admin123', 12);
    sqlJsDb!.run(
      `INSERT INTO app_user (name, employee_no, department, position, level, phone, id_card_tail, password, is_admin)
       VALUES ('系统管理员', 'admin', '系统', '管理员', 'admin', '00000000000', '0000', ?, 1)`,
      [hash]
    );
  }
}

async function ensureAdminPostgres(): Promise<void> {
  const result = await pgPool!.query("SELECT id FROM app_user WHERE employee_no = 'admin' LIMIT 1");
  if (result.rowCount === 0) {
    const hash = bcrypt.hashSync('admin123', 12);
    await pgPool!.query(
      `INSERT INTO app_user (name, employee_no, department, position, level, phone, id_card_tail, password, is_admin)
       VALUES ('系统管理员', 'admin', '系统', '管理员', 'admin', '00000000000', '0000', $1, 1)`,
      [hash]
    );
  }
}

export async function initDb(): Promise<void> {
  if (driver === 'postgres') await initPostgres();
  else await initSqlJsDb();
}

export function getDriver(): DbDriver {
  return driver;
}

export function getSqlJsDb(): Database {
  if (!sqlJsDb) throw new Error('sql.js 数据库未初始化');
  return sqlJsDb;
}

export function getPgPool(): pg.Pool {
  if (!pgPool) throw new Error('PostgreSQL 连接池未初始化');
  return pgPool;
}

export function saveDb(): void {
  if (!sqlJsDb || driver !== 'sqljs') return;
  dirty = true;
  if (process.env.DB_SAVE_MODE === 'immediate' || SAVE_DEBOUNCE_MS <= 0) {
    flushDb();
    return;
  }
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushDb();
  }, SAVE_DEBOUNCE_MS);
}

export function flushDb(): void {
  if (!sqlJsDb || !dirty || driver !== 'sqljs') return;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const tmpPath = `${DB_PATH}.${process.pid}.tmp`;
  writeFileSync(tmpPath, Buffer.from(sqlJsDb.export()));
  renameSync(tmpPath, DB_PATH);
  dirty = false;
}

async function closePostgres(): Promise<void> {
  if (pgPool) await pgPool.end();
}

function flushBeforeExit(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  flushDb();
}

process.once('beforeExit', flushBeforeExit);
process.once('SIGINT', () => {
  flushBeforeExit();
  void closePostgres().finally(() => process.exit(0));
});
process.once('SIGTERM', () => {
  flushBeforeExit();
  void closePostgres().finally(() => process.exit(0));
});
