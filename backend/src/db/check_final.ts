import * as fs from 'fs';
import initSqlJs from 'sql.js';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('./src/db/hr360.db'));

  const batches = db.exec('SELECT id, name, status, start_time, end_time FROM batch ORDER BY id DESC LIMIT 3');
  console.log('=== BATCHES ===');
  batches.forEach((r: any) => {
    console.log(r.columns.join('|'));
    r.values.forEach((v: any[]) => console.log(v.join('|')));
  });

  const users = db.exec('SELECT id, name, level, department FROM app_user ORDER BY id');
  console.log('\n=== USERS ===');
  users.forEach((r: any) => {
    console.log(r.columns.join('|'));
    r.values.forEach((v: any[]) => console.log(v.join('|')));
  });

  const rels = db.exec("SELECT evaluator_id, eval_type, status, count(*) as cnt FROM relation GROUP BY evaluator_id, eval_type, status ORDER BY evaluator_id, eval_type");
  console.log('\n=== RELATIONS ===');
  rels.forEach((r: any) => {
    console.log(r.columns.join('|'));
    r.values.forEach((v: any[]) => console.log(v.join('|')));
  });

  const ans = db.exec("SELECT evaluator_id, question_seq, score, is_total, count(*) as cnt FROM answer GROUP BY evaluator_id, question_seq ORDER BY evaluator_id");
  console.log('\n=== ANSWERS ===');
  ans.forEach((r: any) => {
    console.log(r.columns.join('|'));
    r.values.forEach((v: any[]) => console.log(v.join('|')));
  });

  const sq = db.exec('SELECT batch_id, count(*) as cnt FROM self_question GROUP BY batch_id');
  console.log('\n=== SELF_QUESTIONS ===');
  sq.forEach((r: any) => {
    console.log(r.columns.join('|'));
    r.values.forEach((v: any[]) => console.log(v.join('|')));
  });

  db.close();
}

main().catch(console.error);
