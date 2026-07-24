import assert from 'node:assert/strict';
import { closeDb, initDb } from '../db/index.js';
import { execute, queryAll, queryOne } from '../db/query.js';
import { RelationModel, type RelationRow } from '../model/relation.js';
import {
  previewDetailedGradeSubmission,
  submitDetailedItems,
} from '../service/gradedAnswerSubmission.js';

if (process.env.ALLOW_AUTH_INTEGRATION_TEST !== 'true') {
  throw new Error('仅允许在隔离数据库中设置 ALLOW_AUTH_INTEGRATION_TEST=true 后执行');
}

await initDb();
async function cleanupFixture() {
  await execute("DELETE FROM batch WHERE name = '分档并发测试' AND period = 'test'");
  await execute("DELETE FROM app_user WHERE employee_no IN ('M1','S1','S2','S3','S4','S5')");
  await execute("DELETE FROM department WHERE name = '并发测试部'");
}

try {
  await cleanupFixture();
  await execute("INSERT INTO department (name, sort_order) VALUES ('并发测试部', 1)");
  await execute(
    `INSERT INTO batch (name, period, start_time, end_time, status)
     VALUES ('分档并发测试', 'test', '2026-01-01 00:00:00', '2099-12-31 23:59:59', 'active')`
  );
  const batch = await queryOne<{ id: number }>("SELECT id FROM batch WHERE name = '分档并发测试'");
  assert.ok(batch);
  await execute(
    `INSERT INTO app_user
      (name, employee_no, department, position, level, phone, id_card_tail, password,
       must_change_password, password_version, status, is_admin)
     VALUES
      ('测试主管', 'M1', '并发测试部', '主管', 'manager', '13820000001', '0001', 'x', 0, 1, 'active', 0),
      ('员工1', 'S1', '并发测试部', '员工', 'staff', '13820000002', '0002', 'x', 0, 1, 'active', 0),
      ('员工2', 'S2', '并发测试部', '员工', 'staff', '13820000003', '0003', 'x', 0, 1, 'active', 0),
      ('员工3', 'S3', '并发测试部', '员工', 'staff', '13820000004', '0004', 'x', 0, 1, 'active', 0),
      ('员工4', 'S4', '并发测试部', '员工', 'staff', '13820000005', '0005', 'x', 0, 1, 'active', 0),
      ('员工5', 'S5', '并发测试部', '员工', 'staff', '13820000006', '0006', 'x', 0, 1, 'active', 0)`
  );
  const users = await queryAll<{ id: number; employee_no: string }>(
    "SELECT id, employee_no FROM app_user WHERE employee_no IN ('M1','S1','S2','S3','S4','S5')"
  );
  const id = new Map(users.map(user => [user.employee_no, user.id]));
  const managerId = id.get('M1')!;
  const staffIds = ['S1', 'S2', 'S3', 'S4', 'S5'].map(no => id.get(no)!);
  for (const staffId of staffIds) {
    await execute(
      `INSERT INTO relation (batch_id, evaluator_id, target_id, role_type, eval_type, status)
       VALUES (?, ?, ?, 'staff', 'self', 'completed')`,
      [batch.id, staffId, staffId]
    );
    await execute(
      `INSERT INTO relation (batch_id, evaluator_id, target_id, role_type, eval_type, status)
       VALUES (?, ?, ?, 'manager', 'downward', 'pending')`,
      [batch.id, managerId, staffId]
    );
  }
  await execute(
    `INSERT INTO relation (batch_id, evaluator_id, target_id, role_type, eval_type, status)
     VALUES (?, ?, ?, 'staff', 'peer', 'draft')`,
    [batch.id, staffIds[1], staffIds[2]]
  );

  const downward = await RelationModel.findByBatchId(batch.id, {
    evaluator_id: managerId,
    eval_type: 'downward',
  });
  assert.equal(downward.length, 5);
  const byTarget = new Map(downward.map(row => [row.target_id, row]));

  const concurrent = await Promise.allSettled([
    submitDetailedItems([{ relation: downward[0], answers: [{ seq: 1, score: 95 }], draft: false }]),
    submitDetailedItems([{ relation: downward[1], answers: [{ seq: 1, score: 95 }], draft: false }]),
  ]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = concurrent.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason?.status, 409);
  const completedAfterConcurrent = await queryAll<{ id: number }>(
    "SELECT id FROM relation WHERE batch_id = ? AND evaluator_id = ? AND eval_type = 'downward' AND status = 'completed'",
    [batch.id, managerId]
  );
  assert.equal(completedAfterConcurrent.length, 1);

  const blockedRelation = byTarget.get(staffIds[2])!;
  await assert.rejects(
    submitDetailedItems([{ relation: blockedRelation, answers: [{ seq: 1, score: 65 }], draft: false }]),
    (error: any) => error?.status === 409 && String(error.message).includes('员工互评')
  );
  await execute(
    "UPDATE relation SET status = 'completed' WHERE batch_id = ? AND evaluator_id = ? AND target_id = ? AND eval_type = 'peer'",
    [batch.id, staffIds[1], staffIds[2]]
  );
  await submitDetailedItems([
    { relation: blockedRelation, answers: [{ seq: 1, score: 65 }], draft: false },
  ]);

  const previewRelation = byTarget.get(staffIds[3]) as RelationRow;
  const preview = await previewDetailedGradeSubmission(
    previewRelation,
    [{ seq: 1, score: 50 }]
  );
  assert.equal(preview?.grade, 'E');
  assert.equal(preview?.policy.valid, true);

  await execute(
    `INSERT INTO manager_grade_policy
      (batch_id, department, target_count, mode, constraints_json)
     VALUES (?, '并发测试部', 5, 'custom', ?)`,
    [batch.id, JSON.stringify([
      { key: 'AB', label: 'A+B级', grades: ['A', 'B'], min: 1, max: 1 },
      { key: 'CD', label: 'C+D级', grades: ['C', 'D'], min: 3, max: 3 },
      { key: 'E', label: 'E级', grades: ['E'], min: 1, max: 1 },
    ])]
  );
  const customPreview = await previewDetailedGradeSubmission(
    previewRelation,
    [{ seq: 1, score: 50 }]
  );
  assert.equal(customPreview?.policy.valid, true);
  assert.deepEqual(customPreview?.policy.constraints.map(item => item.key), ['AB', 'CD', 'E']);

  const blockedByCustomQuota = await previewDetailedGradeSubmission(
    byTarget.get(staffIds[4]) as RelationRow,
    [{ seq: 1, score: 95 }]
  );
  assert.equal(blockedByCustomQuota?.policy.valid, false);
  assert.match(blockedByCustomQuota?.policy.message || '', /A\+B级最多 1 人/);

  console.log('graded submission MySQL integration tests passed');
} finally {
  try {
    await cleanupFixture();
  } finally {
    await closeDb();
  }
}
