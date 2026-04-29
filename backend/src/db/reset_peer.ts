import * as fs from 'fs';
import initSqlJs from 'sql.js';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('./src/db/hr360.db'));

  // 把李四的互评(id=18)重置为pending，删除答案
  db.run("UPDATE relation SET status='pending', updated_at=datetime('now') WHERE id=18");
  db.run("DELETE FROM answer WHERE relation_id=18");
  console.log('已重置李四互评(id=18)为pending');

  // 确认
  const r = db.exec("SELECT id, status FROM relation WHERE id=18");
  console.log('relation 18:', JSON.stringify(r));
  const a = db.exec("SELECT * FROM answer WHERE relation_id=18");
  console.log('answer 18:', JSON.stringify(a));

  fs.writeFileSync('./src/db/hr360.db', db.export());
  db.close();
  console.log('DB saved');
}

main().catch(console.error);
