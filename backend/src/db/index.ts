import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

export type DbDriver = 'mysql';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL || 'mysql://hrsys:hrsys@127.0.0.1:13306/hrsys';

let pool: mysql.Pool | null = null;

function readSchema(name = 'schema.mysql.sql'): string {
  const candidates = [
    join(__dirname, name),
    join(process.cwd(), 'src', 'db', name),
  ];
  const schemaPath = candidates.find(path => existsSync(path));
  if (!schemaPath) throw new Error(`找不到数据库 ${name}`);
  return readFileSync(schemaPath, 'utf-8');
}

function splitSql(sql: string): string[] {
  return sql
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

async function ensureAdmin(): Promise<void> {
  const [rows] = await getMysqlPool().execute<mysql.RowDataPacket[]>(
    "SELECT id FROM app_user WHERE employee_no = 'admin' LIMIT 1"
  );
  if (rows.length > 0) return;

  const hash = bcrypt.hashSync('admin123', 12);
  await getMysqlPool().execute(
    `INSERT INTO app_user (name, employee_no, department, position, level, phone, id_card_tail, password, is_admin)
     VALUES ('系统管理员', 'admin', '系统', '管理员', 'admin', '00000000000', '0000', ?, 1)`,
    [hash]
  );
}

async function ensureRelationUniqueIndex(): Promise<void> {
  const [indexes] = await getMysqlPool().query<mysql.RowDataPacket[]>(
    `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'relation'
        AND INDEX_NAME = 'idx_relation_batch_pair_type_unique'
      LIMIT 1`
  );
  if (indexes.length > 0) return;

  const [duplicates] = await getMysqlPool().query<mysql.RowDataPacket[]>(
    `SELECT batch_id, evaluator_id, target_id, eval_type, COUNT(*) AS total
       FROM relation
      GROUP BY batch_id, evaluator_id, target_id, eval_type
     HAVING COUNT(*) > 1
      LIMIT 20`
  );
  if (duplicates.length > 0) {
    throw new Error(`评价关系存在重复数据，无法添加唯一约束：${JSON.stringify(duplicates)}`);
  }

  await getMysqlPool().query(
    `ALTER TABLE relation
       ADD UNIQUE KEY idx_relation_batch_pair_type_unique
       (batch_id, evaluator_id, target_id, eval_type)`
  );
}

export async function initDb(): Promise<void> {
  pool = mysql.createPool({
    uri: DATABASE_URL,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_MAX || '20'),
    maxIdle: Number(process.env.MYSQL_POOL_IDLE || '10'),
    idleTimeout: Number(process.env.MYSQL_IDLE_TIMEOUT_MS || '30000'),
    enableKeepAlive: true,
    timezone: '+08:00',
    dateStrings: true,
    multipleStatements: false,
  });

  await pool.query('SELECT 1');
  for (const stmt of splitSql(readSchema())) {
    try {
      await pool.query(stmt);
    } catch (err: any) {
      if (err?.code !== 'ER_DUP_KEYNAME') throw err;
    }
  }
  await ensureRelationUniqueIndex();
  await ensureAdmin();
}

export function getDriver(): DbDriver {
  return 'mysql';
}

export function getMysqlPool(): mysql.Pool {
  if (!pool) throw new Error('MySQL 连接池未初始化');
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

process.once('SIGINT', () => {
  void closeDb().finally(() => process.exit(0));
});

process.once('SIGTERM', () => {
  void closeDb().finally(() => process.exit(0));
});
