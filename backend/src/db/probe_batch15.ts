import * as fs from 'fs';
import initSqlJs from 'sql.js';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('./src/db/hr360.db'));

  // batch_id=15 的所有关系，按eval_type分组
  const rels = db.exec(`
    SELECT r.id, r.evaluator_id, u.name as evaluator, u.department, r.eval_type, r.status
    FROM relation r
    JOIN app_user u ON r.evaluator_id = u.id
    WHERE r.batch_id = 15
    ORDER BY r.eval_type, r.evaluator_id
  `);
  console.log('batch_id=15所有关系:', JSON.stringify(rels));

  // 按eval_type计数
  const counts = db.exec(`
    SELECT eval_type, status, COUNT(*) as cnt
    FROM relation
    WHERE batch_id = 15
    GROUP BY eval_type, status
  `);
  console.log('按类型统计:', JSON.stringify(counts));

  // 看所有批次
  const batches = db.exec("SELECT id, name, status FROM batch ORDER BY id DESC LIMIT 5");
  console.log('所有批次:', JSON.stringify(batches));

  db.close();
}

main().catch(console.error);
