import { initDb, getDb, saveDb } from './index.js';

await initDb();
const db = getDb();

// Check app_user columns
const cols = db.exec("PRAGMA table_info(app_user)");
console.log('app_user columns:');
if (cols.length > 0) {
  for (const row of cols[0].values) {
    console.log(`  ${row[1]} (${row[2]})`);
  }
}

// Show admin record
const admin = db.exec("SELECT * FROM app_user WHERE is_admin = 1");
console.log('\nadmin record:');
if (admin.length > 0 && admin[0].values.length > 0) {
  const columns = admin[0].columns;
  const values = admin[0].values[0];
  for (let i = 0; i < columns.length; i++) {
    console.log(`  ${columns[i]}: ${values[i]}`);
  }
}

db.close();
