import type { DbExecutor } from '../db/query.js';
import type { RelationRow } from '../model/relation.js';
import { classifyEvaluationRelation } from './evaluationScene.js';

export interface DependencyGate {
  ok: boolean;
  reason?: string;
}

function isSameLevelPeer(row: RelationRow, targetId: number): boolean {
  return row.target_id === targetId
    && row.eval_type === 'peer'
    && row.evaluator_level === row.target_level;
}

function isUpwardToManager(row: RelationRow, targetId: number): boolean {
  return row.target_id === targetId
    && classifyEvaluationRelation(row).evaluation_scene === 'upward';
}

function allCompleted(rows: RelationRow[]): boolean {
  return rows.every(row => row.status === 'completed');
}

export function validateEvaluationDependenciesFromRelations(
  relation: RelationRow,
  allRelations: RelationRow[]
): DependencyGate {
  if (relation.eval_type !== 'downward') return { ok: true };
  const targetSelf = allRelations.find(row => (
    row.target_id === relation.target_id
    && row.evaluator_id === relation.target_id
    && row.eval_type === 'self'
  ));
  const incomingPeers = allRelations.filter(row => isSameLevelPeer(row, relation.target_id));

  if (relation.evaluator_level === 'manager' && relation.target_level === 'staff') {
    if (targetSelf?.status !== 'completed') {
      return { ok: false, reason: '员工正式提交自评后，部门负责人才能评价' };
    }
    if (!allCompleted(incomingPeers)) {
      return { ok: false, reason: '该员工收到的全部员工互评完成后，部门负责人才能评价' };
    }
    return { ok: true };
  }

  if (!['main_leader', 'division_leader'].includes(relation.evaluator_level || '')) return { ok: true };
  if (relation.target_level === 'manager') {
    if (targetSelf?.status !== 'completed') {
      return { ok: false, reason: '部门负责人正式提交自评后，领导才能评价' };
    }
    if (!allCompleted(incomingPeers)) {
      return { ok: false, reason: '该负责人收到的全部负责人互评完成后，领导才能评价' };
    }
    const incomingUpward = allRelations.filter(row => isUpwardToManager(row, relation.target_id));
    if (!allCompleted(incomingUpward)) {
      return { ok: false, reason: '该负责人收到的全部员工向上评价完成后，领导才能评价' };
    }
    const managerDownward = allRelations.filter(row => (
      row.evaluator_id === relation.target_id
      && row.eval_type === 'downward'
      && row.target_level === 'staff'
    ));
    if (!allCompleted(managerDownward)) {
      return { ok: false, reason: '部门负责人完成所负责部门的所有员工评分后，领导才能评价' };
    }
    return { ok: true };
  }

  if (relation.target_level === 'staff') {
    if (targetSelf?.status !== 'completed') return { ok: false, reason: '该员工尚未完成自评' };
    if (!allCompleted(incomingPeers)) return { ok: false, reason: '该员工收到的全部员工互评尚未完成' };
    const manager = allRelations.find(row => (
      row.target_id === relation.target_id
      && row.eval_type === 'downward'
      && row.evaluator_level === 'manager'
    ));
    if (manager?.status !== 'completed') {
      return { ok: false, reason: '部门负责人完成该员工评分后，领导才能评价' };
    }
    const managerDownward = allRelations.filter(row => (
      row.evaluator_id === manager.evaluator_id
      && row.eval_type === 'downward'
      && row.target_level === 'staff'
    ));
    if (!allCompleted(managerDownward)) {
      return { ok: false, reason: '部门负责人完成所负责部门的所有员工评分后，领导才能评价该部门人员' };
    }
  }
  return { ok: true };
}

async function batchRelations(db: Pick<DbExecutor, 'queryAll'>, batchId: number): Promise<RelationRow[]> {
  return db.queryAll<RelationRow>(
    `SELECT r.*,
            e.name AS evaluator_name, e.level AS evaluator_level, e.department AS evaluator_department,
            t.name AS target_name, t.level AS target_level, t.department AS target_department
       FROM relation r
       JOIN app_user e ON e.id = r.evaluator_id
       JOIN app_user t ON t.id = r.target_id
      WHERE r.batch_id = ?
      ORDER BY r.id`,
    [batchId]
  );
}

async function lockedRelationsByIds(db: Pick<DbExecutor, 'queryAll'>, ids: number[]): Promise<RelationRow[]> {
  if (ids.length === 0) return [];
  const marks = ids.map(() => '?').join(',');
  return db.queryAll<RelationRow>(
    `SELECT r.*,
            e.name AS evaluator_name, e.level AS evaluator_level, e.department AS evaluator_department,
            t.name AS target_name, t.level AS target_level, t.department AS target_department
       FROM relation r
       JOIN app_user e ON e.id = r.evaluator_id
       JOIN app_user t ON t.id = r.target_id
      WHERE r.id IN (${marks})
      ORDER BY r.id
      FOR UPDATE`,
    ids
  );
}

function dependencyIds(relation: RelationRow, all: RelationRow[]): number[] {
  const ids = new Set<number>([relation.id]);
  const addTargetUpstream = () => {
    for (const row of all) {
      if (
        row.target_id === relation.target_id
        && (
          (row.eval_type === 'self' && row.evaluator_id === row.target_id)
          || isSameLevelPeer(row, relation.target_id)
          || isUpwardToManager(row, relation.target_id)
          || (row.eval_type === 'downward' && row.evaluator_level === 'manager')
        )
      ) ids.add(row.id);
    }
  };

  if (relation.eval_type !== 'downward') return [...ids];
  addTargetUpstream();
  if (relation.evaluator_level === 'manager' && relation.target_level === 'staff') return [...ids];

  if (relation.target_level === 'manager') {
    for (const row of all) {
      if (row.evaluator_id === relation.target_id && row.eval_type === 'downward' && row.target_level === 'staff') {
        ids.add(row.id);
      }
    }
  } else {
    const manager = all.find(row => (
      row.target_id === relation.target_id
      && row.eval_type === 'downward'
      && row.evaluator_level === 'manager'
    ));
    if (manager) {
      for (const row of all) {
        if (row.evaluator_id === manager.evaluator_id && row.eval_type === 'downward' && row.target_level === 'staff') {
          ids.add(row.id);
        }
      }
    }
  }
  return [...ids];
}

export async function lockAndValidateEvaluationDependencies(
  tx: DbExecutor,
  relations: RelationRow[],
  additionalLockIds: number[] = []
): Promise<void> {
  const byBatch = new Map<number, RelationRow[]>();
  for (const relation of relations) {
    const list = byBatch.get(relation.batch_id) ?? [];
    list.push(relation);
    byBatch.set(relation.batch_id, list);
  }

  for (const [batchId, batchItems] of [...byBatch.entries()].sort(([a], [b]) => a - b)) {
    const all = await batchRelations(tx, batchId);
    const batchRelationIds = new Set(all.map(row => row.id));
    const ids = [...new Set([
      ...batchItems.flatMap(relation => dependencyIds(relation, all)),
      ...additionalLockIds.filter(id => batchRelationIds.has(id)),
    ])].sort((a, b) => a - b);
    const refreshed = await lockedRelationsByIds(tx, ids);
    for (const relation of batchItems) {
      const current = refreshed.find(row => row.id === relation.id);
      if (!current || current.status === 'completed') {
        throw Object.assign(new Error('评价状态已变化，请刷新后重试'), { status: 409 });
      }
      const gate = validateEvaluationDependenciesFromRelations(current, refreshed);
      if (!gate.ok) throw Object.assign(new Error(gate.reason || '评价依赖尚未完成'), { status: 409 });
    }
  }
}

export async function findRevokeConsumers(
  db: Pick<DbExecutor, 'queryAll'>,
  relation: RelationRow
): Promise<RelationRow[]> {
  const all = await batchRelations(db, relation.batch_id);
  if (classifyEvaluationRelation(relation).evaluation_scene === 'upward') {
    return all.filter(row => (
      row.target_id === relation.target_id
      && row.eval_type === 'downward'
      && ['main_leader', 'division_leader'].includes(row.evaluator_level || '')
    ));
  }

  if (relation.target_level === 'staff' && (relation.eval_type === 'self' || relation.eval_type === 'peer')) {
    return all.filter(row => (
      row.target_id === relation.target_id
      && row.eval_type === 'downward'
      && row.evaluator_level === 'manager'
    ));
  }
  if (
    relation.target_level === 'manager'
    && (relation.eval_type === 'self' || classifyEvaluationRelation(relation).evaluation_scene === 'peer')
  ) {
    return all.filter(row => (
      row.target_id === relation.target_id
      && row.eval_type === 'downward'
      && ['main_leader', 'division_leader'].includes(row.evaluator_level || '')
    ));
  }
  if (relation.eval_type === 'downward' && relation.evaluator_level === 'manager') {
    const managedTargetIds = new Set(all
      .filter(row => row.evaluator_id === relation.evaluator_id && row.eval_type === 'downward' && row.target_level === 'staff')
      .map(row => row.target_id));
    return all.filter(row => (
      row.eval_type === 'downward'
      && ['main_leader', 'division_leader'].includes(row.evaluator_level || '')
      && (row.target_id === relation.evaluator_id || managedTargetIds.has(row.target_id))
    ));
  }
  return [];
}
