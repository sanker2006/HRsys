import Router from '@koa/router';
import type { Context } from 'koa';
import { auth } from '../middleware/auth.js';
import { admin } from '../middleware/admin.js';
import { BatchModel } from '../model/batch.js';
import { queryAll, transaction, type DbExecutor } from '../db/query.js';
import { fail, success } from '../utils/response.js';
import {
  normalizeStaffPeerGradePolicy,
  inspectStaffPeerRelationGroups,
  type StaffPeerGradePolicyInput,
  type StaffPeerGradePolicyRow,
} from '../service/staffPeerGradePolicy.js';
import {
  evaluateGradePolicy,
  gradePolicyDescription,
} from '../service/scoreGradePolicy.js';

const router = new Router({ prefix: '/api/v1/staff-peer-grade-policy' });
router.use(auth, admin);

interface PeerRelationRow {
  id: number;
  status: string;
  evaluator_id: number;
  evaluator_name: string;
  target_id: number;
  department: string;
}

async function departmentRelations(
  db: Pick<DbExecutor, 'queryAll'>,
  batchId: number,
  department?: string,
  forUpdate = false
): Promise<PeerRelationRow[]> {
  const params: Array<string | number> = [batchId];
  let filter = '';
  if (department !== undefined) {
    filter = ' AND e.department = ?';
    params.push(department);
  }
  return db.queryAll<PeerRelationRow>(
    `SELECT r.id, r.status, r.evaluator_id, e.name AS evaluator_name,
            r.target_id, e.department
       FROM relation r
       JOIN app_user e ON e.id = r.evaluator_id
       JOIN app_user t ON t.id = r.target_id
      WHERE r.batch_id = ?
        AND r.eval_type = 'peer'
        AND e.level = 'staff'
        AND t.level = 'staff'
        AND e.department = t.department${filter}
      ORDER BY e.department, r.evaluator_id, r.id${forUpdate ? ' FOR UPDATE' : ''}`,
    params
  );
}

async function totalScoresByRelation(
  db: Pick<DbExecutor, 'queryAll'>,
  relationIds: number[],
  forUpdate = false
): Promise<Map<number, number>> {
  if (!relationIds.length) return new Map();
  const marks = relationIds.map(() => '?').join(',');
  const rows = await db.queryAll<{ relation_id: number; score: number }>(
    `SELECT relation_id, score
       FROM answer
      WHERE is_total = 1 AND relation_id IN (${marks})
      ORDER BY relation_id${forUpdate ? ' FOR UPDATE' : ''}`,
    relationIds
  );
  return new Map(rows.map(row => [row.relation_id, Number(row.score)]));
}

function groupByEvaluator(relations: PeerRelationRow[]) {
  const groups = new Map<number, PeerRelationRow[]>();
  for (const relation of relations) {
    if (!groups.has(relation.evaluator_id)) groups.set(relation.evaluator_id, []);
    groups.get(relation.evaluator_id)!.push(relation);
  }
  return groups;
}

function participantIds(relations: PeerRelationRow[]): Set<number> {
  return new Set(relations.flatMap(row => [row.evaluator_id, row.target_id]));
}

function consistentTargetCount(relations: PeerRelationRow[]): {
  ok: boolean;
  targetCount: number;
  reason?: string;
} {
  const result = inspectStaffPeerRelationGroups(relations);
  return { ok: result.ok, targetCount: result.targetCount, reason: result.reason };
}

function constraintsFromRow(row: StaffPeerGradePolicyRow | undefined, targetCount: number) {
  if (!row) return normalizeStaffPeerGradePolicy({ mode: 'default' }, targetCount);
  let constraints: unknown;
  try {
    constraints = JSON.parse(row.constraints_json || '[]');
  } catch {
    throw Object.assign(new Error(`${row.department}的员工互评分档规则数据损坏`), { status: 500 });
  }
  return normalizeStaffPeerGradePolicy({
    mode: row.mode,
    constraints: Array.isArray(constraints) ? constraints : [],
  }, targetCount);
}

router.get('/:batchId', async (ctx: Context) => {
  const batchId = Number(ctx.params.batchId);
  const batch = await BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  const [relations, policies] = await Promise.all([
    departmentRelations({ queryAll }, batchId),
    queryAll<StaffPeerGradePolicyRow>(
      `SELECT id, batch_id, department, target_count, mode, constraints_json,
              created_by, created_at, updated_at
         FROM staff_peer_grade_policy
        WHERE batch_id = ?`,
      [batchId]
    ),
  ]);
  const scores = await totalScoresByRelation(
    { queryAll },
    relations.filter(row => row.status === 'completed').map(row => row.id)
  );
  const policyByDepartment = new Map(policies.map(row => [row.department, row]));
  const departments = [...new Set(relations.map(row => row.department))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const list = departments.map(department => {
    const items = relations.filter(row => row.department === department);
    const groups = groupByEvaluator(items);
    const consistency = consistentTargetCount(items);
    const stored = policyByDepartment.get(department);
    const configuredTargetCount = stored ? Number(stored.target_count) : consistency.targetCount;
    const targetCountChanged = Boolean(stored) && consistency.ok && configuredTargetCount !== consistency.targetCount;
    const policy = constraintsFromRow(stored, configuredTargetCount || 1);
    let currentMessage = consistency.reason || null;
    if (!currentMessage && targetCountChanged) {
      currentMessage = `每人评价人数已由 ${configuredTargetCount} 人变为 ${consistency.targetCount} 人，请重新配置`;
    }
    if (!currentMessage) {
      for (const evaluatorItems of groups.values()) {
        const completedScores = evaluatorItems
          .filter(row => row.status === 'completed')
          .map(row => scores.get(row.id))
          .filter((score): score is number => score !== undefined && Number.isFinite(score));
        const evaluation = evaluateGradePolicy(
          completedScores,
          consistency.targetCount,
          30,
          policy.constraints
        );
        if (!evaluation.valid) {
          currentMessage = `${evaluatorItems[0].evaluator_name}：${evaluation.message}`;
          break;
        }
      }
    }
    return {
      department,
      staff_count: participantIds(items).size,
      evaluator_count: groups.size,
      target_count: consistency.targetCount,
      relation_count: items.length,
      completed_count: items.filter(row => row.status === 'completed').length,
      mode: policy.mode,
      override: Boolean(stored),
      configured_target_count: stored ? Number(stored.target_count) : null,
      constraints: policy.constraints,
      description: gradePolicyDescription(configuredTargetCount || 1, policy.constraints),
      current_valid: !currentMessage,
      current_message: currentMessage,
      updated_at: stored?.updated_at ?? null,
    };
  });
  success(ctx, { batch, list });
});

router.put('/:batchId', async (ctx: Context) => {
  const batchId = Number(ctx.params.batchId);
  const body = ctx.request.body as StaffPeerGradePolicyInput & {
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
      const relations = await departmentRelations(tx, batchId, department, true);
      if (!relations.length) throw Object.assign(new Error('该部门没有员工互评关系'), { status: 409 });
      const consistency = consistentTargetCount(relations);
      if (!consistency.ok) throw Object.assign(new Error(consistency.reason), { status: 409 });
      if (
        body.expected_target_count !== undefined
        && Number(body.expected_target_count) !== consistency.targetCount
      ) {
        throw Object.assign(new Error('员工互评对象人数已变化，请刷新后重新配置'), { status: 409 });
      }
      const policy = normalizeStaffPeerGradePolicy(body, consistency.targetCount);
      const scoreMap = await totalScoresByRelation(
        tx,
        relations.filter(row => row.status === 'completed').map(row => row.id),
        true
      );
      for (const evaluatorItems of groupByEvaluator(relations).values()) {
        const completedScores = evaluatorItems
          .filter(row => row.status === 'completed')
          .map(row => scoreMap.get(row.id))
          .filter((score): score is number => score !== undefined && Number.isFinite(score));
        const evaluation = evaluateGradePolicy(
          completedScores,
          consistency.targetCount,
          30,
          policy.constraints
        );
        if (!evaluation.valid) {
          throw Object.assign(
            new Error(`${evaluatorItems[0].evaluator_name}的现有正式评分与新规则不兼容：${evaluation.message}`),
            { status: 409, detail: evaluation }
          );
        }
      }
      if (policy.mode === 'default') {
        await tx.execute(
          'DELETE FROM staff_peer_grade_policy WHERE batch_id = ? AND department = ?',
          [batchId, department]
        );
      } else {
        await tx.execute(
          `INSERT INTO staff_peer_grade_policy
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
            consistency.targetCount,
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
          'staff_peer_grade_policy.update',
          ctx.ip || null,
          JSON.stringify({
            batch_id: batchId,
            department,
            staff_count: participantIds(relations).size,
            target_count: consistency.targetCount,
            mode: policy.mode,
            constraints: policy.constraints,
          }),
        ]
      );
      return {
        department,
        target_count: consistency.targetCount,
        mode: policy.mode,
        constraints: policy.constraints,
        description: gradePolicyDescription(consistency.targetCount, policy.constraints),
      };
    });
    success(ctx, result, '员工互评分档规则已保存');
  } catch (error: any) {
    return fail(ctx, error?.message || '保存员工互评分档规则失败', error?.detail ?? -1, error?.status || 400);
  }
});

export default router;
