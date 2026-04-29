/**
 * V1.3 数据库迁移脚本
 * 给 batch 表添加 peer_cross_dept 字段
 */
import initSqlJs from 'sql.js';
import * as fs from 'fs';

const DB_PATH = './src/db/hr360.db';

async function migrate() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  // 检查字段是否已存在
  const cols = db.exec('PRAGMA table_info(batch)');
  const colNames = (cols[0]?.values ?? []).map((v: any[]) => v[1] as string);

  if (colNames.includes('peer_cross_dept')) {
    console.log('字段 peer_cross_dept 已存在，跳过。');
  } else {
    db.run('ALTER TABLE batch ADD COLUMN peer_cross_dept INTEGER NOT NULL DEFAULT 0');
    console.log('ALTER TABLE: peer_cross_dept 添加成功');
  }

  // 验证
  const cols2 = db.exec('PRAGMA table_info(batch)');
  const names = (cols2[0]?.values ?? []).map((v: any[]) => v[1]);
  console.log('当前 batch 表字段:', names);

  fs.writeFileSync(DB_PATH, db.export());
  db.close();
  console.log('DB 已保存，迁移完成。');
}

migrate().catch(e => { console.error(e); process.exit(1); });
