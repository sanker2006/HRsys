import initSqlJs, { Database } from 'sql.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'data', 'hr360.db');

let db: Database;
let saveTimer: NodeJS.Timeout | null = null;
let dirty = false;

const SAVE_DEBOUNCE_MS = parseInt(process.env.DB_SAVE_DEBOUNCE_MS || '200', 10);

function hasColumn(table: string, column: string): boolean {
  const result = db.exec(`PRAGMA table_info(${table})`);
  const rows = result[0]?.values ?? [];
  return rows.some(row => row[1] === column);
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  if (!hasColumn(table, column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function readSchema(): string {
  const candidates = [
    join(__dirname, 'schema.sql'),
    join(process.cwd(), 'src', 'db', 'schema.sql'),
  ];
  const schemaPath = candidates.find(path => existsSync(path));
  if (!schemaPath) throw new Error('找不到数据库 schema.sql');
  return readFileSync(schemaPath, 'utf-8');
}

export async function initDb(): Promise<void> {
  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    db = new SQL.Database(readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON;');

  const statements = readSchema().split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    try {
      db.run(stmt);
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

  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_phone_idcard ON app_user(phone, id_card_tail)');

  const adminResult = db.exec("SELECT id FROM app_user WHERE employee_no = 'admin'");
  if (!adminResult.length || !adminResult[0].values.length) {
    const hash = bcrypt.hashSync('admin123', 12);
    db.run(
      `INSERT INTO app_user (name, employee_no, department, position, level, phone, id_card_tail, password, is_admin)
       VALUES ('系统管理员', 'admin', '系统', '管理员', 'admin', '00000000000', '0000', ?, 1)`,
      [hash]
    );
  }

  saveDb();
}

export function getDb(): Database {
  if (!db) throw new Error('数据库未初始化，请先调用 initDb()');
  return db;
}

export function saveDb(): void {
  if (!db) return;
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
  if (!db || !dirty) return;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const tmpPath = `${DB_PATH}.${process.pid}.tmp`;
  writeFileSync(tmpPath, Buffer.from(db.export()));
  renameSync(tmpPath, DB_PATH);
  dirty = false;
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
  process.exit(0);
});
process.once('SIGTERM', () => {
  flushBeforeExit();
  process.exit(0);
});
