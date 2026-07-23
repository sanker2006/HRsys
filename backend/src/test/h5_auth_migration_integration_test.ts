import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import type mysql from 'mysql2/promise';
import { closeDb, getMysqlPool, initDb } from '../db/index.js';
import {
  applyPasswordAuthMigration,
  preflightPasswordAuthMigration,
} from '../tools/migrate-h5-password-auth.js';

if (process.env.ALLOW_AUTH_INTEGRATION_TEST !== 'true') {
  throw new Error('仅允许在隔离数据库中设置 ALLOW_AUTH_INTEGRATION_TEST=true 后执行');
}

await initDb({ ensureSchema: false });
try {
  await getMysqlPool().query(`
    CREATE TABLE app_user (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      employee_no VARCHAR(64) NOT NULL UNIQUE,
      department VARCHAR(255) NOT NULL,
      position VARCHAR(255) NOT NULL DEFAULT '',
      level VARCHAR(32) NOT NULL,
      phone VARCHAR(32) NOT NULL,
      id_card_tail VARCHAR(16) NOT NULL,
      password VARCHAR(255) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      is_admin TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY idx_user_phone_idcard (phone, id_card_tail)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  const initialHash = bcrypt.hashSync('0004', 4);
  const customHash = bcrypt.hashSync('CustomPass123', 4);
  const adminHash = bcrypt.hashSync('admin123', 4);
  await getMysqlPool().execute(
    `INSERT INTO app_user
      (name, employee_no, department, position, level, phone, id_card_tail, password, is_admin)
     VALUES
      ('系统管理员', 'admin', '系统', '管理员', 'admin', '00000000000', '0000', ?, 1),
      ('初始密码用户', 'U1', '测试部', '员工', 'staff', '13810000004', '9999', ?, 0),
      ('自定义密码用户', 'U2', '测试部', '员工', 'staff', '13810000005', '8888', ?, 0)`,
    [adminHash, initialHash, customHash]
  );

  const before = await preflightPasswordAuthMigration();
  assert.equal(before.canApply, true);
  assert.equal(before.initialPasswordUsers, 1);
  assert.equal(before.customPasswordUsers, 1);
  await applyPasswordAuthMigration(before);
  await applyPasswordAuthMigration(await preflightPasswordAuthMigration());

  const [columns] = await getMysqlPool().query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'app_user'
        AND COLUMN_NAME IN ('must_change_password', 'password_version')`
  );
  assert.equal(columns.length, 2);
  const [indexes] = await getMysqlPool().query<mysql.RowDataPacket[]>(
    `SELECT DISTINCT INDEX_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user'`
  );
  const indexNames = indexes.map(row => String(row.INDEX_NAME));
  assert.equal(indexNames.includes('idx_user_phone_unique'), true);
  assert.equal(indexNames.includes('idx_user_phone_idcard'), false);

  const [users] = await getMysqlPool().query<mysql.RowDataPacket[]>(
    `SELECT employee_no, password, must_change_password, password_version
       FROM app_user
      ORDER BY employee_no`
  );
  const byNo = new Map(users.map(row => [String(row.employee_no), row]));
  assert.equal(Number(byNo.get('admin')?.must_change_password), 0);
  assert.equal(Number(byNo.get('U1')?.must_change_password), 1);
  assert.equal(Number(byNo.get('U2')?.must_change_password), 0);
  assert.equal(Number(byNo.get('U1')?.password_version), 1);
  assert.equal(byNo.get('U1')?.password, initialHash);
  assert.equal(byNo.get('U2')?.password, customHash);

  console.log('H5 auth migration integration tests passed');
} finally {
  await closeDb();
}
