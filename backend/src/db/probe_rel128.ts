import * as fs from 'fs';
import initSqlJs from 'sql.js';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('./src/db/hr360.db'));

  const ans128 = db.exec("SELECT * FROM answer WHERE relation_id = 128");
  console.log('答案128:', JSON.stringify(ans128));

  const ans127 = db.exec("SELECT * FROM answer WHERE relation_id = 127");
  console.log('答案127:', JSON.stringify(ans127));

  // 李四的所有关系
  const lisiRels = db.exec(`
    SELECT r.id, r.eval_type, r.status, u.name as target
    FROM relation r
    JOIN app_user u ON r.target_id = u.id
    WHERE r.evaluator_id = (SELECT id FROM app_user WHERE phone='13800138002')
    ORDER BY r.id
  `);
  console.log('李四关系:', JSON.stringify(lisiRels));

  // 张三丰的所有关系
  const zhangRels = db.exec(`
    SELECT r.id, r.eval_type, r.status, u.name as target
    FROM relation r
    JOIN app_user u ON r.target_id = u.id
    WHERE r.evaluator_id = (SELECT id FROM app_user WHERE phone='13800138001')
    ORDER BY r.id
  `);
  console.log('张三丰关系:', JSON.stringify(zhangRels));

  // 看看answer表里有哪几条数据
  const allAns = db.exec("SELECT relation_id, question_seq, score, is_total, is_draft FROM answer ORDER BY relation_id");
  console.log('所有答案:', JSON.stringify(allAns));

  db.close();
}

main().catch(console.error);
