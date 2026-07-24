import type { DbExecutor } from '../db/query.js';
import {
  normalizeManagerGradePolicy,
  type ManagerGradePolicyInput,
  type ManagerGradePolicyMode,
  type NormalizedManagerGradePolicy,
} from './managerGradePolicy.js';

export type StaffPeerGradePolicyMode = ManagerGradePolicyMode;
export type StaffPeerGradePolicyInput = ManagerGradePolicyInput;
export type NormalizedStaffPeerGradePolicy = NormalizedManagerGradePolicy;

export interface StaffPeerGradePolicyRow {
  id: number;
  batch_id: number;
  department: string;
  target_count: number;
  mode: 'custom' | 'unrestricted';
  constraints_json: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface StaffPeerRelationShape {
  evaluator_id: number;
  target_id: number;
}

export function inspectStaffPeerRelationGroups(relations: StaffPeerRelationShape[]): {
  ok: boolean;
  staffCount: number;
  evaluatorCount: number;
  targetCount: number;
  reason?: string;
} {
  const groups = new Map<number, number>();
  const participants = new Set<number>();
  for (const relation of relations) {
    groups.set(relation.evaluator_id, (groups.get(relation.evaluator_id) || 0) + 1);
    participants.add(relation.evaluator_id);
    participants.add(relation.target_id);
  }
  if (!groups.size || groups.size !== participants.size) {
    return {
      ok: false,
      staffCount: participants.size,
      evaluatorCount: groups.size,
      targetCount: 0,
      reason: '存在员工没有互评任务，请重新生成或修正评价关系',
    };
  }
  const counts = [...new Set(groups.values())];
  if (counts.length !== 1) {
    return {
      ok: false,
      staffCount: participants.size,
      evaluatorCount: groups.size,
      targetCount: 0,
      reason: '部门内员工互评对象人数不一致，请重新生成或修正评价关系',
    };
  }
  return {
    ok: true,
    staffCount: participants.size,
    evaluatorCount: groups.size,
    targetCount: counts[0],
  };
}

export function normalizeStaffPeerGradePolicy(
  input: StaffPeerGradePolicyInput,
  targetCount: number
): NormalizedStaffPeerGradePolicy {
  return normalizeManagerGradePolicy(input, targetCount);
}

export async function resolveStaffPeerGradePolicy(
  db: Pick<DbExecutor, 'queryOne'>,
  batchId: number,
  department: string,
  targetCount: number
): Promise<NormalizedStaffPeerGradePolicy> {
  const row = await db.queryOne<StaffPeerGradePolicyRow>(
    `SELECT id, batch_id, department, target_count, mode, constraints_json,
            created_by, created_at, updated_at
       FROM staff_peer_grade_policy
      WHERE batch_id = ? AND department = ?`,
    [batchId, department]
  );
  if (!row) return normalizeStaffPeerGradePolicy({ mode: 'default' }, targetCount);
  if (Number(row.target_count) !== targetCount) {
    throw Object.assign(
      new Error(`员工互评对象人数已由 ${row.target_count} 人变为 ${targetCount} 人，请管理员重新确认分档规则`),
      { status: 409 }
    );
  }
  let constraints: unknown;
  try {
    constraints = JSON.parse(row.constraints_json || '[]');
  } catch {
    throw Object.assign(new Error('员工互评分档规则数据损坏，请管理员重新配置'), { status: 500 });
  }
  return normalizeStaffPeerGradePolicy({
    mode: row.mode,
    constraints: Array.isArray(constraints) ? constraints : [],
  }, targetCount);
}
