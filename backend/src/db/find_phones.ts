import * as fs from 'fs';
import initSqlJs from 'sql.js';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('./src/db/hr360.db'));
  const users = db.exec("SELECT id, name, phone, id_card_tail, department FROM app_user ORDER BY id");
  console.log('所有用户:', JSON.stringify(users));
  db.close();
}

main().catch(console.error);
