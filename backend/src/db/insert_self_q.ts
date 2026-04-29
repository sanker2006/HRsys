import * as fs from 'fs';
import initSqlJs from 'sql.js';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('./src/db/hr360.db'));

  // 获取batch=15所有用户
  const users = db.exec("SELECT id, name, level FROM app_user WHERE id IN (SELECT DISTINCT evaluator_id FROM relation WHERE batch_id=15)");
  console.log('用户列表:');
  users.forEach((r: any) => {
    console.log(r.columns.join('|'));
    r.values.forEach((v: any[]) => console.log(v.join('|')));
  });

  // 检查是否已有自评题目
  const existing = db.exec("SELECT count(*) as cnt FROM self_question WHERE batch_id=15");
  console.log('\n现有自评题目数:', existing[0]?.values[0]?.[0]);

  // 为batch=15所有用户插入自评题目（5题，权重总和=100）
  const userIds = users[0]?.values.map((v: any[]) => v[0]) || [];
  let inserted = 0;
  for (const userId of userIds) {
    const check = db.exec(`SELECT count(*) FROM self_question WHERE batch_id=15 AND user_id=${userId}`);
    if ((check[0]?.values[0]?.[0] as number) > 0) {
      console.log(`user_id=${userId} 已有题目，跳过`);
      continue;
    }
    db.run(`
      INSERT INTO self_question (batch_id, user_id, content_1, content_2, content_3, content_4, content_5,
        weight_1, weight_2, weight_3, weight_4, weight_5)
      VALUES (15, ${userId},
        '工作质量：您对本人本季度工作完成质量的评价（准确率、完整性）',
        '工作效率：您对本人本季度工作效率的评价（响应速度、按时完成）',
        '团队协作：您对本人本季度团队协作表现的评价',
        '业务能力：您对本人本季度业务能力的评价（专业技能、解决问题）',
        '学习成长：您对本人本季度学习成长情况的评价',
        25, 25, 20, 15, 15)
    `);
    inserted++;
    console.log(`user_id=${userId} 插入成功`);
  }

  console.log(`\n共插入 ${inserted} 条自评题目`);

  // 验证
  const sq = db.exec("SELECT user_id, content_1, weight_1 FROM self_question WHERE batch_id=15");
  console.log('\n验证插入结果:');
  sq.forEach((r: any) => {
    console.log(r.columns.join('|'));
    r.values.slice(0, 3).forEach((v: any[]) => console.log(v.join('|')));
  });

  // 保存
  const data = db.export();
  fs.writeFileSync('./src/db/hr360.db', Buffer.from(data));
  console.log('\n数据库已保存');

  db.close();
}

main().catch(console.error);
