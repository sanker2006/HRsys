/**
 * 快速验证：后端是否正常 + peer_cross_dept 字段是否存在
 */
import * as fs from 'fs';
import initSqlJs from 'sql.js';

async function main() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('./src/db/hr360.db');
  const db = new SQL.Database(buf);

  const cols = db.exec('PRAGMA table_info(batch)');
  const names = (cols[0]?.values ?? []).map((v: any[]) => v[1]);
  console.log('batch字段:', names);

  const batches = db.exec('SELECT id, name, peer_cross_dept FROM batch');
  console.log('批次:', JSON.stringify(batches[0]?.values));

  const matrix = db.exec('SELECT batch_id, COUNT(*) FROM eval_matrix GROUP BY batch_id');
  console.log('矩阵行数:', JSON.stringify(matrix[0]?.values));

  db.close();
}
main().catch(e => console.error(e));
