import { UserModel } from '../model/user.js';
import { RelationModel } from '../model/relation.js';
import { EvalMatrixModel } from '../model/eval_matrix.js';
import { BatchModel } from '../model/batch.js';
import { SelfQuestionModel } from '../model/self_question.js';

export interface GenResult {
  total: number;
  self: number;
  peer: number;
  downward: number;
}

export interface MissingQuestionUser {
  user_id: number;
  name: string;
  employee_no: string;
  department: string;
  level: string;
}

type RelationInput = {
  batch_id: number;
  evaluator_id: number;
  target_id: number;
  role_type: string;
  eval_type: string;
};

function isEnabled(matrix: Awaited<ReturnType<typeof EvalMatrixModel.findEnabledByBatchId>>, fromRole: string, toRole: string, evalType: string): boolean {
  if (matrix.length === 0) return true;
  return matrix.some(row => row.from_role === fromRole && row.to_role === toRole && row.eval_type === evalType);
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

export async function generateRelations(batchId: number): Promise<GenResult> {
  await RelationModel.deleteByBatchId(batchId);

  const matrix = await EvalMatrixModel.findEnabledByBatchId(batchId);
  const batch = await BatchModel.findById(batchId);
  const peerCrossDept = batch?.peer_cross_dept === 1;

  const users = (await UserModel.findAll({ status: 'active' })).filter(u => !u.is_admin);
  const mainLeaders = users.filter(u => u.level === 'main_leader');
  const divisionLeaders = users.filter(u => u.level === 'division_leader');
  const managers = users.filter(u => u.level === 'manager');
  const staff = users.filter(u => u.level === 'staff');
  const relations: RelationInput[] = [];

  if (isEnabled(matrix, 'manager', 'self', 'self') || isEnabled(matrix, 'staff', 'self', 'self')) {
    for (const user of [...managers, ...staff]) {
      if (!isEnabled(matrix, user.level, 'self', 'self')) continue;
      addRelation(relations, batchId, user, user, 'self');
    }
  }

  if (isEnabled(matrix, 'manager', 'manager', 'peer')) {
    for (const evaluator of managers) {
      for (const target of managers) {
        if (evaluator.id === target.id) continue;
        if (!peerCrossDept && evaluator.department !== target.department) continue;
        addRelation(relations, batchId, evaluator, target, 'peer');
      }
    }
  }

  if (isEnabled(matrix, 'staff', 'staff', 'peer')) {
    for (const evaluator of staff) {
      for (const target of staff) {
        if (evaluator.id === target.id) continue;
        if (evaluator.department !== target.department) continue;
        addRelation(relations, batchId, evaluator, target, 'peer');
      }
    }
  }

  if (isEnabled(matrix, 'staff', 'manager', 'peer')) {
    for (const evaluator of staff) {
      const manager = managers.find(target => target.department === evaluator.department);
      if (manager) addRelation(relations, batchId, evaluator, manager, 'peer');
    }
  }

  if (isEnabled(matrix, 'manager', 'staff', 'downward')) {
    for (const manager of managers) {
      for (const target of staff) {
        if (manager.department === target.department) {
          addRelation(relations, batchId, manager, target, 'downward');
        }
      }
    }
  }

  if (
    isEnabled(matrix, 'division_leader', 'manager', 'downward') ||
    isEnabled(matrix, 'division_leader', 'staff', 'downward') ||
    isEnabled(matrix, 'main_leader', 'manager', 'downward') ||
    isEnabled(matrix, 'main_leader', 'staff', 'downward')
  ) {
    for (const leader of divisionLeaders) {
      const departments = new Set((leader.managed_departments || []).filter(Boolean));
      if (departments.size === 0) continue;
      if (isEnabled(matrix, 'division_leader', 'manager', 'downward')) {
        for (const target of managers) {
          if (departments.has(target.department)) addRelation(relations, batchId, leader, target, 'downward');
        }
      }
      if (isEnabled(matrix, 'division_leader', 'staff', 'downward')) {
        for (const target of staff) {
          if (departments.has(target.department)) addRelation(relations, batchId, leader, target, 'downward');
        }
      }
    }

    for (const leader of mainLeaders) {
      if (isEnabled(matrix, 'main_leader', 'manager', 'downward')) {
        for (const target of managers) addRelation(relations, batchId, leader, target, 'downward');
      }
      if (isEnabled(matrix, 'main_leader', 'staff', 'downward')) {
        for (const target of staff) addRelation(relations, batchId, leader, target, 'downward');
      }
    }
  }

  const result = await RelationModel.batchCreate(relations);
  const created = await RelationModel.findByBatchId(batchId);
  return {
    total: result.success,
    self: created.filter(r => r.eval_type === 'self').length,
    peer: created.filter(r => r.eval_type === 'peer').length,
    downward: created.filter(r => r.eval_type === 'downward').length,
  };
}

export async function findMissingQuestionUsers(batchId: number): Promise<MissingQuestionUser[]> {
  const questionRows = SelfQuestionModel.toExportFormat(await SelfQuestionModel.findByBatchId(batchId));
  const byUser = new Map(questionRows.map(row => [row.user_id, row]));
  const users = (await UserModel.findAll({ status: 'active' }))
    .filter(u => !u.is_admin && ['manager', 'staff'].includes(u.level));

  return users
    .filter(user => {
      const row = byUser.get(user.id);
      if (!row || row.performance_questions.length === 0 || row.comprehensive_questions.length === 0) return true;
      const performanceTotal = row.performance_questions.reduce((sum, q) => sum + Number(q.weight || 0), 0);
      const comprehensiveTotal = row.comprehensive_questions.reduce((sum, q) => sum + Number(q.weight || 0), 0);
      return Math.abs(performanceTotal - 70) > 0.001 || Math.abs(comprehensiveTotal - 30) > 0.001;
    })
    .map(user => ({
      user_id: user.id,
      name: user.name,
      employee_no: user.employee_no,
      department: user.department,
      level: user.level,
    }));
}
