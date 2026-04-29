import * as fs from 'fs';
import initSqlJs from 'sql.js';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('./src/db/hr360.db'));

  const tables = ['app_user', 'batch', 'eval_matrix', 'relation', 'self_question', 'answer', 'log'];
  for (const t of tables) {
    const r = db.exec(`SELECT COUNT(*) as cnt FROM ${t}`);
    console.log(`${t}: ${r[0]?.values[0]?.[0] ?? 'N/A'} 条`);
  }

  // 用户列表
  console.log('\n用户:');
  const users = db.exec('SELECT id, name, phone, level, department FROM app_user ORDER BY id');
  if (users[0]) {
    console.log(users[0].columns.join(' | '));
    users[0].values.forEach(v => console.log(v.join(' | ')));
  }

  // 批次
  console.log('\n批次:');
  const batches = db.exec('SELECT id, name, status, start_time FROM batch ORDER BY id');
  if (batches[0]) {
    console.log(batches[0].columns.join(' | '));
    batches[0].values.forEach(v => console.log(v.join(' | ')));
  }

  // 最新批次的关系状态
  console.log('\n最新批次(batch_id=15)关系状态:');
  const rels = db.exec("SELECT id, evaluator_id, target_id, eval_type, status, created_at FROM relation WHERE batch_id=15 ORDER BY id");
  if (rels[0]) {
    console.log(rels[0].columns.join(' | '));
    rels[0].values.forEach(v => console.log(v.join(' | ')));
  }

  db.close();
}

main().catch(e => console.error(e.message));
