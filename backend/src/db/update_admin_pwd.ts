import { initDb, getDb, saveDb } from './index.js';

await initDb();
const db = getDb();

const newHash = '$2a$10$/JPjuQHCA4t433Jzb1qQ/OBCaycZX8ixys32q6vGsy0ayvMw6oDFq';

// Use db.run() directly with inline hash
db.run(`UPDATE app_user SET password = '${newHash}', updated_at = datetime('now') WHERE is_admin = 1`);

console.log('Password updated');

// Verify
const result = db.exec("SELECT id, name, employee_no, password FROM app_user WHERE is_admin = 1");
if (result.length > 0 && result[0].values.length > 0) {
  const row = result[0].values[0];
  console.log('Admin:', { id: row[0], name: row[1], employee_no: row[2], hash_prefix: (row[3] as string).substring(0, 20) });
}

saveDb();
db.close();
console.log('\n✅ 管理员密码已更新为 admin123!@#');
