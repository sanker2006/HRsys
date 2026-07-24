import Router from '@koa/router';
import type { Context } from 'koa';
import { auth } from '../middleware/auth.js';
import { admin } from '../middleware/admin.js';
import { BatchModel } from '../model/batch.js';
import { queryAll, transaction, type DbExecutor } from '../db/query.js';
import { fail, success } from '../utils/response.js';
import {
  normalizeManagerGradePolicy,
  type ManagerGradePolicyInput,
  type ManagerGradePolicyRow,
} from '../service/managerGradePolicy.js';
import {
  evaluateGradePolicy,
  gradePolicyDescription,
  type GradeConstraint,
} from '../service/scoreGradePolicy.js';

const router = new Router({ prefix: '/api/v1/manager-grade-policy' });
router.use(auth, admin);

interface ManagerGroupRow {
  department: string;
  manager_id: number;
  manager_name: string;
  target_count: number;
  completed_count: number;
}

interface GroupRelationRow {
  id: number;
  status: string;
  evaluator_id: number;
  evaluator_name: string;
  department?: string;
}

async function managerGroups(db: Pick<DbExecutor, 'queryAll'>, batchId: number): Promise<ManagerGroupRow[]> {
  return db.queryAll<ManagerGroupRow>(
    `SELECT t.department,
            r.evaluator_id AS manager_id,
            e.name AS manager_name,
            COUNT(*) AS target_count,
            SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) AS completed_count
       FROM relation r
       JOIN app_user e ON e.id = r.evaluator_id
       JOIN app_user t ON t.id = r.target_id
      WHERE r.batch_id = ?
        AND r.eval_type = 'downward'
        AND e.level = 'manager'
        AND t.level = 'staff'
      GROUP BY t.department, r.evaluator_id, e.name
      ORDER BY t.department, e.name`,
    [batchId]
  );
}

async function groupRelations(
  db: Pick<DbExecutor, 'queryAll'>,
  batchId: number,
  department: string,
  forUpdate = false
): Promise<GroupRelationRow[]> {
  return db.queryAll<GroupRelationRow>(
    `SELECT r.id, r.status, r.evaluator_id, e.name AS evaluator_name
       FROM relation r
       JOIN app_user e ON e.id = r.evaluator_id
       JOIN app_user t ON t.id = r.target_id
      WHERE r.batch_id = ?
        AND r.eval_type = 'downward'
        AND e.level = 'manager'
        AND t.level = 'staff'
        AND t.department = ?
      ORDER BY r.id${forUpdate ? ' FOR UPDATE' : ''}`,
    [batchId, department]
  );
}

async function allGroupRelations(
  db: Pick<DbExecutor, 'queryAll'>,
  batchId: number
): Promise<GroupRelationRow[]> {
  return db.queryAll<GroupRelationRow>(
    `SELECT r.id, r.status, r.evaluator_id, e.name AS evaluator_name, t.department
       FROM relation r
       JOIN app_user e ON e.id = r.evaluator_id
       JOIN app_user t ON t.id = r.target_id
      WHERE r.batch_id = ?
        AND r.eval_type = 'downward'
        AND e.level = 'manager'
        AND t.level = 'staff'
      ORDER BY t.department, r.evaluator_id, r.id`,
    [batchId]
  );
}

async function totalScoresByRelation(
  db: Pick<DbExecutor, 'queryAll'>,
  relationIds: number[]
): Promise<Map<number, number>> {
  if (!relationIds.length) return new Map();
  const marks = relationIds.map(() => '?').join(',');
  const rows = await db.queryAll<{ relation_id: number; score: number }>(
    `SELECT relation_id, score
       FROM answer
      WHERE is_total = 1 AND relation_id IN (${marks})
      ORDER BY relation_id`,
    relationIds
  );
  return new Map(rows.map(row => [row.relation_id, Number(row.score)]));
}

async function completedScores(
  db: Pick<DbExecutor, 'queryAll'>,
  relations: GroupRelationRow[],
  forUpdate = false
): Promise<number[]> {
  const completedIds = relations.filter(row => row.status === 'completed').map(row => row.id);
  if (!completedIds.length) return [];
  const marks = completedIds.map(() => '?').join(',');
  const rows = await db.queryAll<{ relation_id: number; score: number }>(
    `SELECT relation_id, score
       FROM answer
      WHERE is_total = 1 AND relation_id IN (${marks})
      ORDER BY relation_id${forUpdate ? ' FOR UPDATE' : ''}`,
    completedIds
  );
  return rows.map(row => Number(row.score)).filter(Number.isFinite);
}

function constraintsFromRow(row: ManagerGradePolicyRow | undefined, targetCount: number) {
  if (!row) return normalizeManagerGradePolicy({ mode: 'default' }, targetCount);
  let constraints: unknown;
  try {
    constraints = JSON.parse(row.constraints_json || '[]');
  } catch {
    throw Object.assign(new Error(`${row.department}的分档规则数据损坏`), { status: 500 });
  }
  return normalizeManagerGradePolicy({
    mode: row.mode,
    constraints: Array.isArray(constraints) ? constraints : [],
  }, targetCount);
}

router.get('/:batchId', async (ctx: Context) => {
  const batchId = Number(ctx.params.batchId);
  const batch = await BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  const [groups, policies, relations] = await Promise.all([
    managerGroups({ queryAll }, batchId),
    queryAll<ManagerGradePolicyRow>(
      `SELECT id, batch_id, department, target_count, mode, constraints_json,
              created_by, created_at, updated_at
         FROM manager_grade_policy
        WHERE batch_id = ?`,
      [batchId]
    ),
    allGroupRelations({ queryAll }, batchId),
  ]);
  const totalScores = await totalScoresByRelation(
    { queryAll },
    relations.filter(row => row.status === 'completed').map(row => row.id)
  );
  const policyByDepartment = new Map(policies.map(row => [row.department, row]));
  const list = [];
  for (const group of groups) {
    const sameDepartment = groups.filter(item => item.department === group.department);
    const duplicateManager = sameDepartment.length > 1;
    const stored = policyByDepartment.get(group.department);
    const targetCount = Number(group.target_count);
    const configuredTargetCount = stored ? Number(stored.target_count) : targetCount;
    const targetCountChanged = configuredTargetCount !== targetCount;
    const policy = constraintsFromRow(stored, configuredTargetCount);
    const groupItems = relations.filter(row => (
      row.department === group.department
      && row.evaluator_id === Number(group.manager_id)
    ));
    const scores = groupItems
      .filter(row => row.status === 'completed')
      .map(row => totalScores.get(row.id))
      .filter((score): score is number => score !== undefined && Number.isFinite(score));
    const result = evaluateGradePolicy(scores, targetCount, 100, policy.constraints);
    list.push({
      ...group,
      target_count: targetCount,
      completed_count: Number(group.completed_count),
      mode: policy.mode,
      override: Boolean(stored),
      configured_target_count: stored ? Number(stored.target_count) : null,
      constraints: policy.constraints,
      description: gradePolicyDescription(configuredTargetCount, policy.constraints),
      current_valid: !duplicateManager && !targetCountChanged && result.valid,
      current_message: duplicateManager
        ? '同一部门存在多个负责人，不能配置部门分档规则'
        : targetCountChanged
          ? `评价对象人数已由 ${configuredTargetCount} 人变为 ${targetCount} 人，请重新配置`
        : result.message,
      counts: result.counts,
      updated_at: stored?.updated_at ?? null,
    });
  }
  success(ctx, { batch, list });
});

router.put('/:batchId', async (ctx: Context) => {
  const batchId = Number(ctx.params.batchId);
  const body = ctx.request.body as ManagerGradePolicyInput & {
    department?: string;
    expected_target_count?: number;
  };
  const department = String(body.department || '').trim();
  if (!department) return fail(ctx, '请选择部门');
  const batch = await BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  if (batch.status === 'closed') return fail(ctx, '已结束批次不能修改分档规则', -1, 409);

  try {
    const result = await transaction(async tx => {
      const relations = await groupRelations(tx, batchId, department, true);
      if (!relations.length) throw Object.assign(new Error('该部门没有负责人向下评价关系'), { status: 409 });
      const managerIds = new Set(relations.map(row => row.evaluator_id));
      if (managerIds.size !== 1) {
        throw Object.assign(new Error('同一部门存在多个负责人，不能配置部门分档规则'), { status: 409 });
      }
      if (
        body.expected_target_count !== undefined
        && Number(body.expected_target_count) !== relations.length
      ) {
        throw Object.assign(new Error('部门评价对象人数已变化，请刷新后重新配置'), { status: 409 });
      }
      const policy = normalizeManagerGradePolicy(body, relations.length);
      const scores = await completedScores(tx, relations, true);
      const evaluation = evaluateGradePolicy(scores, relations.length, 100, policy.constraints);
      if (!evaluation.valid) {
        throw Object.assign(
          new Error(`现有正式评分与新规则不兼容：${evaluation.message}`),
          { status: 409, detail: evaluation }
        );
      }
      if (policy.mode === 'default') {
        await tx.execute(
          'DELETE FROM manager_grade_policy WHERE batch_id = ? AND department = ?',
          [batchId, department]
        );
      } else {
        await tx.execute(
          `INSERT INTO manager_grade_policy
            (batch_id, department, target_count, mode, constraints_json, created_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             target_count = VALUES(target_count),
             mode = VALUES(mode),
             constraints_json = VALUES(constraints_json),
             created_by = VALUES(created_by),
             updated_at = CURRENT_TIMESTAMP`,
          [
            batchId,
            department,
            relations.length,
            policy.mode,
            JSON.stringify(policy.constraints),
            Number(ctx.state.userId),
          ]
        );
      }
      await tx.execute(
        'INSERT INTO log (user_id, action, ip, detail) VALUES (?, ?, ?, ?)',
        [
          Number(ctx.state.userId),
          'manager_grade_policy.update',
          ctx.ip || null,
          JSON.stringify({
            batch_id: batchId,
            department,
            manager_id: relations[0].evaluator_id,
            target_count: relations.length,
            mode: policy.mode,
            constraints: policy.constraints,
          }),
        ]
      );
      return {
        department,
        target_count: relations.length,
        mode: policy.mode,
        constraints: policy.constraints,
        description: gradePolicyDescription(relations.length, policy.constraints),
      };
    });
    success(ctx, result, '分档规则已保存');
  } catch (error: any) {
    return fail(ctx, error?.message || '保存分档规则失败', error?.detail ?? -1, error?.status || 400);
  }
});

export default router;
