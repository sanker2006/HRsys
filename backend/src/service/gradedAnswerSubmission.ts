import { transaction, type DbExecutor } from '../db/query.js';
import { AnswerModel } from '../model/answer.js';
import type { RelationRow } from '../model/relation.js';
import {
  classifyGrade,
  evaluateGradePolicy,
  gradePolicyDescription,
  type Grade,
  type GradePolicyResult,
  type ScoreScale,
} from './scoreGradePolicy.js';
import { lockAndValidateEvaluationDependencies } from './evaluationDependencies.js';
import { resolveManagerGradePolicy } from './managerGradePolicy.js';

export interface DetailedSubmission {
  relation: RelationRow;
  answers: Array<{ seq: number; score: number }>;
  draft: boolean;
}

interface PolicyGroup {
  key: string;
  scene: 'staff_peer' | 'manager_downward';
  scale: ScoreScale;
  batchId: number;
  evaluatorId: number;
  department?: string;
}

function policyGroupFor(relation: RelationRow): PolicyGroup | null {
  if (
    relation.eval_type === 'peer'
    && relation.evaluator_level === 'staff'
    && relation.target_level === 'staff'
  ) {
    return {
      key: `${relation.batch_id}:peer:${relation.evaluator_id}`,
      scene: 'staff_peer',
      scale: 30,
      batchId: relation.batch_id,
      evaluatorId: relation.evaluator_id,
    };
  }
  if (
    relation.eval_type === 'downward'
    && relation.evaluator_level === 'manager'
    && relation.target_level === 'staff'
  ) {
    return {
      key: `${relation.batch_id}:downward:${relation.evaluator_id}:${relation.target_department || ''}`,
      scene: 'manager_downward',
      scale: 100,
      batchId: relation.batch_id,
      evaluatorId: relation.evaluator_id,
      department: relation.target_department || '',
    };
  }
  return null;
}

async function groupRelations(tx: DbExecutor, group: PolicyGroup, forUpdate: boolean) {
  const params: Array<string | number> = [group.batchId, group.evaluatorId];
  let sql = `SELECT r.id, r.status
    FROM relation r
    JOIN app_user e ON e.id = r.evaluator_id
    JOIN app_user t ON t.id = r.target_id
    WHERE r.batch_id = ? AND r.evaluator_id = ?`;
  if (group.scale === 30) {
    sql += " AND r.eval_type = 'peer' AND e.level = 'staff' AND t.level = 'staff'";
  } else {
    sql += " AND r.eval_type = 'downward' AND e.level = 'manager' AND t.level = 'staff' AND t.department = ?";
    params.push(group.department || '');
  }
  sql += ` ORDER BY r.id${forUpdate ? ' FOR UPDATE' : ''}`;
  return tx.queryAll<{ id: number; status: string }>(sql, params);
}

async function validateGroup(
  tx: DbExecutor,
  group: PolicyGroup,
  incoming: Map<number, number>,
  forUpdate = true
): Promise<GradePolicyResult> {
  const rows = await groupRelations(tx, group, forUpdate);
  const completedIds = rows
    .filter(row => !incoming.has(row.id) && row.status === 'completed')
    .map(row => row.id);
  const totals = new Map<number, number>();
  if (completedIds.length > 0) {
    const placeholders = completedIds.map(() => '?').join(',');
    const totalRows = await tx.queryAll<{ relation_id: number; score: number }>(
      `SELECT relation_id, score
       FROM answer
       WHERE is_total = 1 AND relation_id IN (${placeholders})
       ORDER BY relation_id${forUpdate ? ' FOR UPDATE' : ''}`,
      completedIds
    );
    for (const row of totalRows) totals.set(row.relation_id, Number(row.score));
  }
  const scores: number[] = [];
  for (const row of rows) {
    if (incoming.has(row.id)) {
      scores.push(incoming.get(row.id)!);
      continue;
    }
    if (row.status !== 'completed') continue;
    const total = totals.get(row.id);
    if (total !== undefined && Number.isFinite(total)) scores.push(total);
  }
  const resolved = group.scene === 'manager_downward'
    ? await resolveManagerGradePolicy(tx, group.batchId, group.department || '', rows.length)
    : null;
  return evaluateGradePolicy(scores, rows.length, group.scale, resolved?.constraints);
}

export async function submitDetailedItems(items: DetailedSubmission[]): Promise<void> {
  await transaction(async tx => {
    const groups = new Map<string, { policy: PolicyGroup; incoming: Map<number, number> }>();
    for (const item of items) {
      if (item.draft) continue;
      const policy = policyGroupFor(item.relation);
      if (!policy) continue;
      if (!groups.has(policy.key)) groups.set(policy.key, { policy, incoming: new Map() });
      groups.get(policy.key)!.incoming.set(
        item.relation.id,
        Math.round(item.answers.reduce((sum, answer) => sum + Number(answer.score || 0), 0) * 10) / 10
      );
    }

    const groupRelationIds: number[] = [];
    for (const group of [...groups.values()].sort((a, b) => a.policy.key.localeCompare(b.policy.key))) {
      groupRelationIds.push(...(await groupRelations(tx, group.policy, false)).map(row => row.id));
    }
    const formalRelations = items.filter(item => !item.draft).map(item => item.relation);
    const allLockIds = [...new Set([...items.map(item => item.relation.id), ...groupRelationIds])].sort((a, b) => a - b);
    if (formalRelations.length > 0) {
      await lockAndValidateEvaluationDependencies(tx, formalRelations, allLockIds);
    } else if (allLockIds.length > 0) {
      const marks = allLockIds.map(() => '?').join(',');
      await tx.queryAll(`SELECT id FROM relation WHERE id IN (${marks}) ORDER BY id FOR UPDATE`, allLockIds);
    }

    for (const group of [...groups.values()].sort((a, b) => a.policy.key.localeCompare(b.policy.key))) {
      const result = await validateGroup(tx, group.policy, group.incoming, true);
      if (!result.valid) {
        throw Object.assign(
          new Error(`${result.message}。本组规则：${gradePolicyDescription(result.group_size, result.constraints)}`),
          { status: 409, detail: result }
        );
      }
    }

    for (const item of items) {
      await AnswerModel.replaceDetailed(
        tx,
        item.relation.id,
        item.answers,
        item.draft ? 'draft' : 'completed',
        item.draft
      );
    }
  });
}

export async function getGradePolicyForRelation(relation: RelationRow): Promise<GradePolicyResult | null> {
  const policy = policyGroupFor(relation);
  if (!policy) return null;
  return transaction(tx => validateGroup(tx, policy, new Map(), false));
}

export async function previewDetailedGradeSubmission(
  relation: RelationRow,
  answers: Array<{ seq: number; score: number }>
): Promise<{ total: number; grade: Grade; policy: GradePolicyResult } | null> {
  const policy = policyGroupFor(relation);
  if (!policy) return null;
  const total = Math.round(answers.reduce((sum, answer) => sum + Number(answer.score || 0), 0) * 10) / 10;
  const result = await transaction(tx => validateGroup(tx, policy, new Map([[relation.id, total]]), false));
  return { total, grade: classifyGrade(total, policy.scale), policy: result };
}
