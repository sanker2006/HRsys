import { chromium } from 'playwright';

async function main() {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext();
  const api = ctx.request as any;

  // 找到汤猛的手机号
  // 先看batch_id=15里哪些用户有peer pending
  // 汤猛: id=4, 需要找手机号
  // 测试用户: id=5

  // 试几个常见测试账号
  const testAccounts = [
    { phone: '13800138003', tail: '1234', name: '汤猛?' },  // 假设
    { phone: '13800000003', tail: '1234', name: '汤猛?' },
  ];

  // 直接从DB查
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  // 用tsx查DB
  const fs = require('fs');
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('./backend/src/db/hr360.db'));
  const users = db.exec("SELECT id, name, phone, department FROM app_user WHERE id IN (4, 5, 7)");
  console.log('目标用户:', JSON.stringify(users));
  const tangmeng = db.exec("SELECT * FROM app_user WHERE name LIKE '%汤猛%' OR name LIKE '%Tang%'");
  console.log('汤猛:', JSON.stringify(tangmeng));
  db.close();

  await b.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
