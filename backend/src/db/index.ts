import initSqlJs, { Database } from 'sql.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'data', 'hr360.db');

let db: Database;

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
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, Buffer.from(db.export()));
}
