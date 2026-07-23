import { transaction, type DbExecutor } from '../db/query.js';
import { AnswerModel } from '../model/answer.js';
import type { RelationRow } from '../model/relation.js';
import { evaluateGradePolicy, gradePolicyDescription, type GradePolicyResult, type ScoreScale } from './scoreGradePolicy.js';

export interface DetailedSubmission {
  relation: RelationRow;
  answers: Array<{ seq: number; score: number }>;
  draft: boolean;
}

interface PolicyGroup {
  key: string;
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
       WHERE is_total = 1 AND relation_id IN (${placeholders})`,
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
  return evaluateGradePolicy(scores, rows.length, group.scale);
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

    for (const group of [...groups.values()].sort((a, b) => a.policy.key.localeCompare(b.policy.key))) {
      const result = await validateGroup(tx, group.policy, group.incoming);
      if (!result.valid) {
        throw Object.assign(
          new Error(`${result.message}。本组规则：${gradePolicyDescription(result.group_size)}`),
          { status: 409, detail: result }
        );
      }
    }

    const policyRelationIds = new Set([...groups.values()].flatMap(group => [...group.incoming.keys()]));
    const relationIds = [...new Set(items.map(item => item.relation.id))]
      .filter(id => !policyRelationIds.has(id))
      .sort((a, b) => a - b);
    for (const relationId of relationIds) {
      await tx.queryOne('SELECT id FROM relation WHERE id = ? FOR UPDATE', [relationId]);
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
