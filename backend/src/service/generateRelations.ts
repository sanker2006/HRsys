/**
 * 根据评估矩阵自动生成评价关系
 * 矩阵规则（V1.3）：
 * 领导层 → 部门负责人（向下评估）
 * 领导层 → 员工层（向下评估）
 * 领导层 → 本人（自评）
 * 部门负责人 → 本部门同事（同层互评，默认本部门，可配置跨部门）
 * 部门负责人 → 本部门员工（向下评估）
 * 部门负责人 → 本人（自评）
 * 员工层 → 本部门同事（同事互评）
 * 员工层 → 本人（自评）
 */

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

export function generateRelations(batchId: number): GenResult {
  // 清空旧关系
  RelationModel.deleteByBatchId(batchId);

  // 获取批次启用的矩阵
  const matrix = EvalMatrixModel.findEnabledByBatchId(batchId);
  if (matrix.length === 0) return { total: 0, self: 0, peer: 0, downward: 0 };

  // 读取批次的跨部门互评配置
  const batch = BatchModel.findById(batchId);
  const peerCrossDept = batch?.peer_cross_dept === 1;

  // 获取所有用户（排除管理员）
  const users = UserModel.findAll().filter(u => !u.is_admin);

  const leaders = users.filter(u => u.level === 'leader');
  const managers = users.filter(u => u.level === 'manager');
  const staff = users.filter(u => u.level === 'staff');
  const usersByRole = {
    leader: leaders,
    manager: managers,
    staff,
  };

  const relations: Array<{
    batch_id: number; evaluator_id: number; target_id: number;
    role_type: string; eval_type: string;
  }> = [];

  let selfCount = 0, peerCount = 0, downwardCount = 0;

  for (const row of matrix) {
    if (!row.enabled) continue;

    if (row.eval_type === 'self' && row.to_role === 'self') {
      const roleUsers = usersByRole[row.from_role] ?? [];
      for (const evaluator of roleUsers) {
        relations.push({
          batch_id: batchId,
          evaluator_id: evaluator.id,
          target_id: evaluator.id,
          role_type: evaluator.level,
          eval_type: 'self',
        });
        selfCount++;
      }
    }

    else if (row.eval_type === 'downward' && row.to_role === 'manager') {
      // 领导层 → 部门负责人（向下评估全部部门负责人）
      for (const evaluator of leaders) {
        for (const target of managers) {
          relations.push({
            batch_id: batchId,
            evaluator_id: evaluator.id,
            target_id: target.id,
            role_type: evaluator.level,
            eval_type: 'downward',
          });
          downwardCount++;
        }
      }
    }

    else if (row.eval_type === 'downward' && row.to_role === 'staff') {
      // 领导层 → 员工层（向下评估全部员工）
      for (const evaluator of leaders) {
        for (const target of staff) {
          relations.push({
            batch_id: batchId,
            evaluator_id: evaluator.id,
            target_id: target.id,
            role_type: evaluator.level,
            eval_type: 'downward',
          });
          downwardCount++;
        }
      }
      // 部门负责人 → 本部门员工
      for (const evaluator of managers) {
        for (const target of staff) {
          if (target.department === evaluator.department) {
            relations.push({
              batch_id: batchId,
              evaluator_id: evaluator.id,
              target_id: target.id,
              role_type: evaluator.level,
              eval_type: 'downward',
            });
            downwardCount++;
          }
        }
      }
    }

    else if (row.eval_type === 'peer' && row.to_role === 'manager') {
      // 部门负责人同层互评
      // peerCrossDept=1: 全公司跨部门（排除自己）
      // peerCrossDept=0: 仅本部门（排除自己 + 同部门）
      for (const evaluator of managers) {
        for (const target of managers) {
          if (evaluator.id === target.id) continue;
          if (!peerCrossDept && evaluator.department !== target.department) continue;
          relations.push({
            batch_id: batchId,
            evaluator_id: evaluator.id,
            target_id: target.id,
            role_type: evaluator.level,
            eval_type: 'peer',
          });
          peerCount++;
        }
      }
    }

    else if (row.eval_type === 'peer' && row.to_role === 'staff') {
      // 员工同事互评（本部门，排除自己）
      for (const evaluator of staff) {
        for (const target of staff) {
          if (evaluator.id !== target.id && evaluator.department === target.department) {
            relations.push({
              batch_id: batchId,
              evaluator_id: evaluator.id,
              target_id: target.id,
              role_type: evaluator.level,
              eval_type: 'peer',
            });
            peerCount++;
          }
        }
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
