import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';

const SQL = await initSqlJs();
const dbBuffer = readFileSync('d:/HR开发/hr-360/backend/src/db/hr360.db');
const db = new SQL.Database(dbBuffer);

const result = db.exec("SELECT id, name, employee_no, password FROM app_user WHERE is_admin = 1");
if (result.length && result[0].values.length) {
  const row = result[0].values[0];
  const hash = row[3];
  console.log(`Admin: ${row[1]}, employee_no: ${row[2]}`);
  console.log(`Hash: ${hash}`);
  const matches = bcrypt.compareSync('admin123', hash);
  console.log(`Password 'admin123' matches: ${matches}`);
} else {
  console.log('No admin found');
}

db.close();
