import * as fs from 'fs';
import initSqlJs from 'sql.js';

const DB_PATH = './src/db/hr360.db';

async function getDb() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  return new SQL.Database(buf);
}

async function main() {
  const db = await getDb();

  console.log('=== BATCHES ===');
  const batches = db.exec('SELECT id, name, status, start_time, end_time, peer_cross_dept FROM batch ORDER BY id DESC LIMIT 5');
  batches.forEach(r => { console.log(r.columns.join(' | ')); r.values.forEach(v => console.log(v.join(' | '))); });

  console.log('\n=== USERS ===');
  const users = db.exec('SELECT id, name, phone, level, department FROM app_user ORDER BY id');
  users.forEach(r => { console.log(r.columns.join(' | ')); r.values.forEach(v => console.log(v.join(' | '))); });

  console.log('\n=== SELF_QUESTIONS ===');
  const selfQ = db.exec('SELECT batch_id, count(*) as cnt FROM self_question GROUP BY batch_id');
  selfQ.forEach(r => { console.log(r.columns.join(' | ')); r.values.forEach(v => console.log(v.join(' | '))); });

  console.log('\n=== RELATIONS COUNT ===');
  const rels = db.exec('SELECT count(*) as total FROM relation');
  rels.forEach(r => { console.log(r.columns.join(' | ')); r.values.forEach(v => console.log(v.join(' | '))); });

  console.log('\n=== EVAL_MATRIX (latest batch) ===');
  const batches2 = db.exec('SELECT id FROM batch ORDER BY id DESC LIMIT 1');
  const latestBatchId = batches2[0]?.values[0]?.[0];
  if (latestBatchId) {
    const pragma = db.exec(`PRAGMA table_info(eval_matrix)`);
    pragma.forEach(r => { console.log('columns:', r.values.map((v:any[]) => v[1]).join(', ')); });
    const matrix = db.exec(`SELECT * FROM eval_matrix WHERE batch_id = ${latestBatchId} ORDER BY id`);
    matrix.forEach(r => { console.log(r.columns.join(' | ')); r.values.slice(0, 8).forEach(v => console.log(v.join(' | '))); });
  }

  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
