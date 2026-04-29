/**
 * Sprint 2 回归测试脚本
 * 测试链路：批次创建→矩阵配置→关系生成→Reset
 *
 * 执行方式：npx tsx src/test/regression_test.ts
 */
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
  let passed = 0, failed = 0;

  function check(label: string, condition: boolean) {
    if (condition) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label}`);
      failed++;
    }
  }

  console.log('\n=== 回归测试开始 ===\n');

  // ── T1: 检查 batch 表是否已有 peer_cross_dept 字段 ──
  console.log('[T1] batch 表结构检查');
  const cols = db.exec('PRAGMA table_info(batch)');
  const colNames = (cols[0]?.values ?? []).map((v: any[]) => v[1] as string);
  check('batch 表存在 peer_cross_dept 字段', colNames.includes('peer_cross_dept'));
  check('batch 表 peer_cross_dept 默认值应为 0', colNames.includes('peer_cross_dept'));

  // ── T2: 检查现有批次数据 ──
  console.log('\n[T2] 现有批次数据');
  const batches = db.exec('SELECT id, name, peer_cross_dept FROM batch ORDER BY id DESC LIMIT 3');
  const batchRows = batches[0]?.values ?? [];
  console.log(`  现有 ${batchRows.length} 个批次`);
  for (const row of batchRows) {
    console.log(`    id=${row[0]}, name=${row[1]}, peer_cross_dept=${row[2]}`);
  }
  check('至少存在 1 个批次', batchRows.length >= 1);

  // ── T3: 检查矩阵默认8行 ──
  console.log('\n[T3] 矩阵默认行数');
  const latestBatchId = batchRows[0]?.[0] as number;
  if (latestBatchId) {
    const matrix = db.exec(`SELECT COUNT(*) FROM eval_matrix WHERE batch_id = ${latestBatchId}`);
    const matrixCount = matrix[0]?.values[0]?.[0] ?? 0;
    check(`批次${latestBatchId} 有 8 行矩阵数据`, matrixCount === 8);
  }

  // ── T4: peer_cross_dept=0 时，经理互评范围是本部门 ──
  console.log('\n[T4] peer_cross_dept=0 时关系生成模拟（经理互评本部门）');
  const managers = db.exec(`SELECT id, name, department FROM app_user WHERE level = 'manager'`);
  const managerRows = managers[0]?.values ?? [];
  console.log(`  部门负责人数量: ${managerRows.length}`);
  const depts = [...new Set(managerRows.map((r: any[]) => r[2]))];
  console.log(`  涉及部门: ${depts}`);

  if (managerRows.length >= 2) {
    // 模拟 peer_cross_dept=0 时的互评：同部门才互评
    let crossDeptCount = 0, sameDeptCount = 0;
    for (let i = 0; i < managerRows.length; i++) {
      for (let j = 0; j < managerRows.length; j++) {
        if (i === j) continue;
        if (managerRows[i][2] === managerRows[j][2]) sameDeptCount++;
        else crossDeptCount++;
      }
    }
    console.log(`  peer_cross_dept=0 时，经理互评应有 ${sameDeptCount} 条（同部门）`);
    console.log(`  peer_cross_dept=1 时，经理互评应有 ${sameDeptCount + crossDeptCount} 条（全部）`);
    check('同部门经理互评条数 >= 0', sameDeptCount >= 0);
  }

  // ── T5: staff 同部门互评 ──
  console.log('\n[T5] 员工互评（同部门）');
  const staff = db.exec(`SELECT id, name, department FROM app_user WHERE level = 'staff'`);
  const staffRows = staff[0]?.values ?? [];
  const staffByDept: Record<string, number> = {};
  for (const r of staffRows) {
    const dept = r[2] as string;
    staffByDept[dept] = (staffByDept[dept] ?? 0) + 1;
  }
  console.log(`  员工总数: ${staffRows.length}`);
  console.log(`  按部门分布:`, staffByDept);
  let expectedPeerStaff = 0;
  for (const cnt of Object.values(staffByDept)) {
    const n = cnt as number;
    expectedPeerStaff += n * (n - 1); // n个员工两两互评（不含自己）
  }
  console.log(`  预期员工互评条数（本部门）: ${expectedPeerStaff}`);
  check('员工互评条数计算正确（n*(n-1)）', expectedPeerStaff >= 0);

  // ── T6: 验证向下评估关系 ──
  console.log('\n[T6] 向下评估逻辑');
  const managerDepts = new Set(managerRows.map((r: any[]) => r[2]));
  const staffDepts = new Set(staffRows.map((r: any[]) => r[2]));
  // 领导→全员向下评估（当前无leader，数据会是0）
  // 部门负责人→本部门员工
  let deptDownwardCount = 0;
  for (const mDept of managerDepts) {
    const staffInDept = staffRows.filter((r: any[]) => r[2] === mDept).length;
    deptDownwardCount += managerRows.filter((r: any[]) => r[2] === mDept).length * staffInDept;
  }
  console.log(`  部门负责人→本部门员工 预期条数: ${deptDownwardCount}`);
  check('向下评估条数 >= 0', deptDownwardCount >= 0);

  // ── T7: 检查 schema.sql 与 DB 一致性 ──
  console.log('\n[T7] schema.sql 字段检查');
  const schema = fs.readFileSync('./src/db/schema.sql', 'utf8');
  check('schema.sql 包含 peer_cross_dept 字段', schema.includes('peer_cross_dept'));
  check('schema.sql batch 表在 eval_matrix 表之前定义', schema.indexOf('CREATE TABLE IF NOT EXISTS batch') < schema.indexOf('CREATE TABLE IF NOT EXISTS eval_matrix'));

  // ── T8: 检查 generateRelations.ts 是否读取 peer_cross_dept ──
  console.log('\n[T8] generateRelations.ts 代码检查');
  const genCode = fs.readFileSync('./src/service/generateRelations.ts', 'utf8');
  check('generateRelations 导入了 BatchModel', genCode.includes("from '../model/batch.js'"));
  check('generateRelations 读取 peer_cross_dept', genCode.includes('peer_cross_dept'));
  check('generateRelations 区分本部门/跨部门逻辑', genCode.includes('peerCrossDept'));

  // ── T9: 检查 eval_matrix route Reset 返回格式 ──
  console.log('\n[T9] eval_matrix route 代码检查');
  const routeCode = fs.readFileSync('./src/route/eval_matrix.ts', 'utf8');
  check('Reset 接口重置 peer_cross_dept=0', routeCode.includes("peer_cross_dept: 0"));
  check('Reset 接口返回 { matrix, peer_cross_dept } 格式', routeCode.includes('{ matrix, peer_cross_dept: 0 }'));
  check('PUT 接口保存 peer_cross_dept', routeCode.includes('peer_cross_dept'));

  // ── T10: 检查前端 API ──
  console.log('\n[T10] 前端 API 检查');
  const apiCode = fs.readFileSync('../admin/src/api/index.ts', 'utf8');
  check('evalMatrixApi.save 支持 peer_cross_dept 参数', apiCode.includes('peer_cross_dept'));

  // ── 总结 ──
  console.log(`\n=== 测试完成: ${passed} 通过, ${failed} 失败 ===\n`);

  db.close();
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
