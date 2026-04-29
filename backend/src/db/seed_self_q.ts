/**
 * 评测题目生成脚本
 * 为 batch_id=2 的所有用户（除 admin）生成10道自评题目
 *
 * 题目覆盖维度（360度评价通用）：
 *   1. 工作目标达成
 *   2. 工作质量
 *   3. 专业能力
 *   4. 团队协作
 *   5. 沟通协调
 *   6. 学习成长
 *   7. 责任心
 *   8. 执行力
 *   9. 创新能力
 *   10. 职业素养
 *
 * 权重：每题10%，总和100%
 */

import * as fs from 'fs';
import initSqlJs from 'sql.js';

const BATCH_ID = 2;

const QUESTIONS = [
  { content: '工作目标达成', weight: 10 },
  { content: '工作质量与效率', weight: 10 },
  { content: '专业能力', weight: 10 },
  { content: '团队协作', weight: 10 },
  { content: '沟通协调', weight: 10 },
  { content: '学习成长', weight: 10 },
  { content: '责任心', weight: 10 },
  { content: '执行力', weight: 10 },
  { content: '创新能力', weight: 10 },
  { content: '职业素养', weight: 10 },
];

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('d:/HR开发/hr-360/backend/src/db/hr360.db'));

  // 确认批次存在
  const batch = db.exec(`SELECT id, name, status FROM batch WHERE id=${BATCH_ID}`);
  if (!batch[0]) {
    console.error(`批次 ${BATCH_ID} 不存在！`);
    db.close();
    return;
  }
  console.log(`目标批次: ${batch[0].values[0].join(' | ')}`);

  // 获取所有非管理员用户
  const users = db.exec(`SELECT id, name, level, department FROM app_user WHERE is_admin=0 ORDER BY id`);
  if (!users[0]) {
    console.error('没有找到用户！');
    db.close();
    return;
  }

  const col = users[0].columns;
  const idIdx = col.indexOf('id');
  const nameIdx = col.indexOf('name');
  const levelIdx = col.indexOf('level');
  const deptIdx = col.indexOf('department');
  const rows = users[0].values;

  console.log(`共 ${rows.length} 个用户，开始生成题目...\n`);

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO self_question
      (batch_id, user_id, content_1, content_2, content_3, content_4, content_5,
       content_6, content_7, content_8, content_9, content_10,
       weight_1, weight_2, weight_3, weight_4, weight_5,
       weight_6, weight_7, weight_8, weight_9, weight_10)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const userId = row[idIdx] as number;
    const name = row[nameIdx] as string;
    const level = row[levelIdx] as string;
    const dept = row[deptIdx] as string;

    const values = [
      BATCH_ID, userId,
      ...QUESTIONS.map(q => q.content),
      ...QUESTIONS.map(q => q.weight),
    ];

    try {
      stmt.run(values);
      inserted++;
      console.log(`  ✓ ${name}（${level}/${dept}）`);
    } catch (e: unknown) {
      const msg = (e as Error).message || '';
      if (msg.includes('UNIQUE')) {
        skipped++;
        console.log(`  — ${name}（已有，跳过）`);
      } else {
        console.error(`  ✗ ${name} 失败: ${msg}`);
      }
    }
  }

  stmt.free();

  // 验证写入
  const verify = db.exec(`SELECT COUNT(*) FROM self_question WHERE batch_id=${BATCH_ID}`);
  const total = verify[0]?.values[0][0] ?? 0;

  console.log(`\n完成！新增 ${inserted} 条，跳过 ${skipped} 条，当前 batch ${BATCH_ID} 共 ${total} 条自评题目`);

  // 展示题目内容
  console.log('\n=== 题目内容 ===');
  QUESTIONS.forEach((q, i) => {
    console.log(`  ${i + 1}. ${q.content}（权重 ${q.weight}%）`);
  });

  // 保存
  const data = db.export();
  fs.writeFileSync('d:/HR开发/hr-360/backend/src/db/hr360.db', Buffer.from(data));
  db.close();
  console.log('\n数据库已保存。');
}

main().catch(e => { console.error(e.message); process.exit(1); });
