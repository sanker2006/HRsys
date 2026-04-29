import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';

const SQL = await initSqlJs();
const dbBuffer = readFileSync('d:/HR开发/hr-360/backend/src/db/hr360.db');
const db = new SQL.Database(dbBuffer);

const result = db.exec("SELECT id, name, employee_no, phone, is_admin, substr(password, 1, 30) as pwd_prefix FROM app_user WHERE is_admin = 1");
if (result.length) {
  console.log('Admin users found:');
  result[0].values.forEach(row => {
    console.log(row);
  });
} else {
  console.log('No admin users found!');
}

db.close();
