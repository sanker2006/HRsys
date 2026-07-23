import bcrypt from 'bcryptjs';
import type mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { closeDb, getMysqlPool, initDb } from '../db/index.js';

type ExistingUser = mysql.RowDataPacket & {
  id: number;
  name: string;
  employee_no: string;
  phone: string;
  password: string;
  is_admin: number;
};

export function classifyPasswordState(user: ExistingUser): 0 | 1 {
  if (user.is_admin === 1) return 0;
  return bcrypt.compareSync(user.phone.slice(-4), user.password) ? 1 : 0;
}

function validH5Phone(phone: string): boolean {
  return /^1\d{10}$/.test(phone);
}

async function columnExists(name: string): Promise<boolean> {
  const [rows] = await getMysqlPool().query<mysql.RowDataPacket[]>(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user' AND COLUMN_NAME = ?
      LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function indexExists(name: string): Promise<boolean> {
  const [rows] = await getMysqlPool().query<mysql.RowDataPacket[]>(
    `SELECT 1
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user' AND INDEX_NAME = ?
      LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

export function analyzeExistingUsers(users: ExistingUser[]) {
  const invalidPhones = users
    .filter(user => user.is_admin !== 1 && !validH5Phone(user.phone))
    .map(user => ({ id: user.id, employee_no: user.employee_no, name: user.name, phone: user.phone }));
  const phoneOwners = new Map<string, ExistingUser[]>();
  for (const user of users) {
    const list = phoneOwners.get(user.phone) ?? [];
    list.push(user);
    phoneOwners.set(user.phone, list);
  }
  const duplicatePhones = [...phoneOwners.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([phone, owners]) => ({
      phone,
      users: owners.map(user => ({ id: user.id, employee_no: user.employee_no, name: user.name })),
    }));
  const classified = users.map(user => ({ id: user.id, mustChange: classifyPasswordState(user) }));
  return {
    total: users.length,
    h5Users: users.filter(user => user.is_admin !== 1).length,
    initialPasswordUsers: classified.filter(item => item.mustChange === 1).length,
    customPasswordUsers: classified.filter(item => item.mustChange === 0).length - users.filter(user => user.is_admin === 1).length,
    invalidPhones,
    duplicatePhones,
    classified,
    canApply: invalidPhones.length === 0 && duplicatePhones.length === 0,
  };
}

export async function preflightPasswordAuthMigration() {
  const [users] = await getMysqlPool().query<ExistingUser[]>('SELECT id, name, employee_no, phone, password, is_admin FROM app_user ORDER BY id');
  return analyzeExistingUsers(users);
}

export async function applyPasswordAuthMigration(preflight: Awaited<ReturnType<typeof preflightPasswordAuthMigration>>) {
  if (!preflight.canApply) throw new Error('预检未通过，禁止执行迁移');
  if (!await columnExists('must_change_password')) {
    await getMysqlPool().query(
      'ALTER TABLE app_user ADD COLUMN must_change_password TINYINT NOT NULL DEFAULT 1 AFTER password'
    );
  }
  if (!await columnExists('password_version')) {
    await getMysqlPool().query(
      'ALTER TABLE app_user ADD COLUMN password_version INT NOT NULL DEFAULT 1 AFTER must_change_password'
    );
  }
  await getMysqlPool().query(
    `CREATE TABLE IF NOT EXISTS h5_login_guard (
       guard_key CHAR(64) PRIMARY KEY,
       failure_count INT NOT NULL DEFAULT 0,
       window_started DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       locked_until DATETIME NULL,
       updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_h5_login_guard_updated (updated_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  for (const item of preflight.classified) {
    await getMysqlPool().execute(
      'UPDATE app_user SET must_change_password = ?, password_version = GREATEST(password_version, 1) WHERE id = ?',
      [item.mustChange, item.id]
    );
  }
  if (!await indexExists('idx_user_phone_unique')) {
    await getMysqlPool().query('ALTER TABLE app_user ADD UNIQUE KEY idx_user_phone_unique (phone)');
  }
  if (await indexExists('idx_user_phone_idcard')) {
    await getMysqlPool().query('ALTER TABLE app_user DROP INDEX idx_user_phone_idcard');
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  await initDb({ ensureSchema: false });
  const result = await preflightPasswordAuthMigration();
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'preflight',
    total: result.total,
    h5_users: result.h5Users,
    initial_password_users: result.initialPasswordUsers,
    custom_password_users: result.customPasswordUsers,
    invalid_phones: result.invalidPhones,
    duplicate_phones: result.duplicatePhones,
    can_apply: result.canApply,
  }, null, 2));
  if (!apply) return;
  await applyPasswordAuthMigration(result);
  console.log('H5密码认证迁移执行完成；现有密码哈希未被重置或重新散列。');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
