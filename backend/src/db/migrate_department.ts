// 运行一次即可：npx tsx src/db/migrate_department.ts
import { initDb, getDb, saveDb } from './index.js';

await initDb();
const db = getDb();

// 建表
db.run(`
  CREATE TABLE IF NOT EXISTS department (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

// 从 app_user 中提取现有部门
const rows = db.exec(
  "SELECT DISTINCT department FROM app_user WHERE department IS NOT NULL AND department != '' ORDER BY department"
);

const existingDepts: string[] = [];
if (rows.length > 0) {
  for (const row of rows[0].values) {
    const name = row[0] as string;
    if (name) existingDepts.push(name);
  }
}

// 插入现有部门
for (let i = 0; i < existingDepts.length; i++) {
  const name = existingDepts[i];
  // 避免重复
  const existing = db.prepare('SELECT id FROM department WHERE name = ?');
  existing.bind([name]);
  if (!existing.step()) {
    db.run('INSERT INTO department (name, sort_order) VALUES (?, ?)', [name, i]);
    console.log(`  ✅ 导入部门: ${name}`);
  } else {
    console.log(`  ⚠️  已存在: ${name}`);
  }
  existing.free();
}

saveDb();

const count = db.prepare('SELECT COUNT(*) as cnt FROM department');
count.step();
console.log(`\n✅ 部门表迁移完成，共 ${count.getAsObject().cnt} 个部门`);
count.free();
db.close();
