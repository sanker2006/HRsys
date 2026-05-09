import { UserModel } from '../model/user.js';
import { RelationModel } from '../model/relation.js';
import { EvalMatrixModel } from '../model/eval_matrix.js';
import { BatchModel } from '../model/batch.js';

export interface GenResult {
  total: number;
  self: number;
  peer: number;
  downward: number;
}

type RelationInput = {
  batch_id: number;
  evaluator_id: number;
  target_id: number;
  role_type: string;
  eval_type: string;
};

function isEnabled(matrix: ReturnType<typeof EvalMatrixModel.findEnabledByBatchId>, evalType: string, toRole?: string): boolean {
  if (matrix.length === 0) return true;
  return matrix.some(row => row.eval_type === evalType && (!toRole || row.to_role === toRole));
}

function addRelation(rows: RelationInput[], batchId: number, evaluator: any, target: any, evalType: string): void {
  rows.push({
    batch_id: batchId,
    evaluator_id: evaluator.id,
    target_id: target.id,
    role_type: evaluator.level,
    eval_type: evalType,
  });
}

export function generateRelations(batchId: number): GenResult {
  RelationModel.deleteByBatchId(batchId);

  const matrix = EvalMatrixModel.findEnabledByBatchId(batchId);
  const batch = BatchModel.findById(batchId);
  const peerCrossDept = batch?.peer_cross_dept === 1;

  const users = UserModel.findAll().filter(u => !u.is_admin);
  const mainLeaders = users.filter(u => u.level === 'main_leader');
  const divisionLeaders = users.filter(u => u.level === 'division_leader');
  const managers = users.filter(u => u.level === 'manager');
  const staff = users.filter(u => u.level === 'staff');
  const relations: RelationInput[] = [];

  if (isEnabled(matrix, 'self', 'self')) {
    for (const user of [...managers, ...staff]) {
      addRelation(relations, batchId, user, user, 'self');
    }
  }

  if (isEnabled(matrix, 'peer', 'manager')) {
    for (const evaluator of managers) {
      for (const target of managers) {
        if (evaluator.id === target.id) continue;
        if (!peerCrossDept && evaluator.department !== target.department) continue;
        addRelation(relations, batchId, evaluator, target, 'peer');
      }
    }
  }

  if (isEnabled(matrix, 'peer', 'staff')) {
    for (const evaluator of staff) {
      for (const target of staff) {
        if (evaluator.id === target.id) continue;
        if (evaluator.department !== target.department) continue;
        addRelation(relations, batchId, evaluator, target, 'peer');
      }
    }
  }

  if (isEnabled(matrix, 'downward', 'staff')) {
    for (const manager of managers) {
      for (const target of staff) {
        if (manager.department === target.department) {
          addRelation(relations, batchId, manager, target, 'downward');
        }
      }
    }
  }

  if (isEnabled(matrix, 'downward', 'manager') || isEnabled(matrix, 'downward', 'staff')) {
    for (const leader of divisionLeaders) {
      const departments = new Set((leader.managed_departments || []).filter(Boolean));
      if (departments.size === 0) continue;
      if (isEnabled(matrix, 'downward', 'manager')) {
        for (const target of managers) {
          if (departments.has(target.department)) addRelation(relations, batchId, leader, target, 'downward');
        }
      }
      if (isEnabled(matrix, 'downward', 'staff')) {
        for (const target of staff) {
          if (departments.has(target.department)) addRelation(relations, batchId, leader, target, 'downward');
        }
      }
    }

    for (const leader of mainLeaders) {
      if (isEnabled(matrix, 'downward', 'manager')) {
        for (const target of managers) addRelation(relations, batchId, leader, target, 'downward');
      }
      if (isEnabled(matrix, 'downward', 'staff')) {
        for (const target of staff) addRelation(relations, batchId, leader, target, 'downward');
      }
    }
  }

  const result = RelationModel.batchCreate(relations);
  const created = RelationModel.findByBatchId(batchId);
  return {
    total: result.success,
    self: created.filter(r => r.eval_type === 'self').length,
    peer: created.filter(r => r.eval_type === 'peer').length,
    downward: created.filter(r => r.eval_type === 'downward').length,
  };
}
