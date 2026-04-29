// 用 sql.js 直接写测试题库数据（权重为百分比格式，总和=100）
import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'src', 'db', 'hr360.db');

async function main() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  // 找一个活跃批次
  let batchId: number;
  const batches = db.exec("SELECT id FROM batch WHERE status = 'active' LIMIT 1");
  if (batches.length > 0 && batches[0].values.length > 0) {
    batchId = batches[0].values[0][0] as number;
    console.log('找到活跃批次:', batchId);
  } else {
    // 新建批次
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const end = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    db.run(`INSERT INTO batch (name, period, start_time, end_time, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)`, [
      '2026年度第一季度绩效评价', '2026Q1', now, end, now, now
    ]);
    const result = db.exec("SELECT last_insert_rowid()");
    batchId = result[0].values[0][0] as number;
    console.log('新建批次:', batchId);
  }

  // 检查是否已有题库
  const existing = db.exec(`SELECT COUNT(*) FROM self_question WHERE batch_id = ${batchId}`);
  if ((existing[0].values[0][0] as number) > 0) {
    console.log(`批次${batchId}已有题库数据，跳过`);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    db.close();
    return;
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // 插入张三丰（user_id=2）：4题 30+25+25+20=100
  db.run(`INSERT INTO self_question (batch_id, user_id,
    content_1, content_2, content_3, content_4,
    weight_1, weight_2, weight_3, weight_4,
    created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    batchId, 2,
    '能按时完成工作任务', '团队协作能力强', '学习成长能力突出', '创新意识强主动改进工作',
    30, 25, 25, 20,
    now, now
  ]);
  console.log('插入张三丰（user_id=2）自评题: 4题，权重30/25/25/20');

  // 插入李四（user_id=3）：4题 35+25+20+20=100
  db.run(`INSERT INTO self_question (batch_id, user_id,
    content_1, content_2, content_3, content_4,
    weight_1, weight_2, weight_3, weight_4,
    created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    batchId, 3,
    '部门管理能力强', '业务决策判断准确', '团队建设成效显著', '沟通协调能力突出',
    35, 25, 20, 20,
    now, now
  ]);
  console.log('插入李四（user_id=3）自评题: 4题，权重35/25/20/20');

  // 验证
  const rows = db.exec(`SELECT sq.user_id, u.name FROM self_question sq JOIN app_user u ON sq.user_id = u.id WHERE sq.batch_id = ${batchId}`);
  if (rows.length > 0) {
    console.log('\n当前题库记录:');
    rows[0].values.forEach((v: any[]) => {
      const userId = v[0], name = v[1];
      const qInfo = db.exec(`SELECT content_1, content_2, content_3, content_4, weight_1, weight_2, weight_3, weight_4 FROM self_question WHERE batch_id = ${batchId} AND user_id = ${userId}`);
      if (qInfo.length > 0) {
        const r = qInfo[0].values[0];
        const qs = [0,1,2,3].map(i => `Q${i+1}(weight=${r[4+i]})`).join(', ');
        console.log(`  ${name}: ${qs}`);
      }
    });
  }

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log('\n题库导入完成，batchId:', batchId);
  db.close();
}

main().catch(console.error);
