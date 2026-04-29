import * as fs from 'fs';
import initSqlJs from 'sql.js';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('./src/db/hr360.db'));

  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log('所有表:', JSON.stringify(tables, null, 2));

  if (tables[0]) {
    for (const row of tables[0].values) {
      const tname = row[0] as string;
      const cnt = db.exec('SELECT COUNT(*) FROM "' + tname + '"');
      console.log(tname + ': ' + (cnt[0]?.values[0]?.[0] ?? 'N/A') + ' 条');
    }
  }

  db.close();
}

main().catch(e => console.error(e.message));
