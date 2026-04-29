import * as fs from 'fs';
import initSqlJs from 'sql.js';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('./backend/src/db/hr360.db'));
  db.run("UPDATE relation SET status='pending', updated_at=datetime('now') WHERE id=145");
  db.run("DELETE FROM answer WHERE relation_id=145");
  const r = db.exec("SELECT id, status FROM relation WHERE id=145");
  console.log('rel145:', JSON.stringify(r));
  fs.writeFileSync('./backend/src/db/hr360.db', db.export());
  db.close();
  console.log('DB saved');
}

main().catch(console.error);
