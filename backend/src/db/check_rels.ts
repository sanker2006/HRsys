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

  // 张三丰(2)和李四(3)的关系和答案状态
  const rels = db.exec(`
    SELECT r.id, r.evaluator_id, r.target_id, r.eval_type, r.status,
           u1.name as evaluator, u2.name as target,
           (SELECT COUNT(*) FROM answer WHERE relation_id = r.id) as answer_count
    FROM relation r
    JOIN app_user u1 ON r.evaluator_id = u1.id
    JOIN app_user u2 ON r.target_id = u2.id
    WHERE r.evaluator_id IN (2, 3)
    ORDER BY r.evaluator_id, r.eval_type
  `);

  console.log('=== 张三丰/李四的关系和答案状态 ===');
  rels.forEach(r => {
    console.log(r.columns.join(' | '));
    r.values.forEach(v => console.log(v.join(' | ')));
  });

  // 检查自评题目数量
  const sq = db.exec('SELECT batch_id, content_1, weight_1, count(*) as has_content FROM self_question GROUP BY batch_id');
  console.log('\n=== 自评题目(batches with questions) ===');
  sq.forEach(r => {
    console.log(r.columns.join(' | '));
    r.values.forEach(v => console.log(v.join(' | ')));
  });

  // 检查答案
  const ans = db.exec('SELECT relation_id, question_seq, score, is_total FROM answer ORDER BY relation_id LIMIT 30');
  console.log('\n=== 答案表样本 ===');
  ans.forEach(r => {
    console.log(r.columns.join(' | '));
    r.values.forEach(v => console.log(v.join(' | ')));
  });

  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
