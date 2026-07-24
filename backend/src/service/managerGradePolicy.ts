import type { DbExecutor } from '../db/query.js';
import {
  buildGradeConstraints,
  evaluateGradePolicy,
  type Grade,
  type GradeConstraint,
} from './scoreGradePolicy.js';

const GRADES: Grade[] = ['A', 'B', 'C', 'D', 'E'];

export type ManagerGradePolicyMode = 'default' | 'custom' | 'unrestricted';

export interface ManagerGradePolicyInput {
  mode: ManagerGradePolicyMode;
  constraints?: Array<{
    grades?: unknown;
    min?: unknown;
    max?: unknown;
  }>;
}

export interface NormalizedManagerGradePolicy {
  mode: ManagerGradePolicyMode;
  constraints: GradeConstraint[];
}

export interface ManagerGradePolicyRow {
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

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label}必须是 ${minimum}～${maximum} 的整数`);
  }
  return parsed;
}

export function normalizeManagerGradePolicy(
  input: ManagerGradePolicyInput,
  targetCount: number
): NormalizedManagerGradePolicy {
  if (!Number.isInteger(targetCount) || targetCount < 1) throw new Error('评价对象人数无效');
  if (!['default', 'custom', 'unrestricted'].includes(input?.mode)) throw new Error('分档规则模式无效');
  if (input.mode === 'default') {
    return { mode: 'default', constraints: buildGradeConstraints(targetCount) };
  }
  if (input.mode === 'unrestricted') return { mode: 'unrestricted', constraints: [] };

  if (!Array.isArray(input.constraints) || input.constraints.length === 0) {
    throw new Error('自定义规则至少需要一条人数约束');
  }
  const covered = new Set<Grade>();
  const constraints = input.constraints.map((raw, index): GradeConstraint => {
    if (!Array.isArray(raw.grades) || raw.grades.length === 0) {
      throw new Error(`第 ${index + 1} 条约束必须选择等级`);
    }
    const grades = [...new Set(raw.grades.map(value => String(value).toUpperCase()))]
      .filter((value): value is Grade => GRADES.includes(value as Grade))
      .sort((a, b) => GRADES.indexOf(a) - GRADES.indexOf(b));
    if (grades.length !== raw.grades.length) throw new Error(`第 ${index + 1} 条约束包含无效或重复等级`);
    for (const grade of grades) {
      if (covered.has(grade)) throw new Error(`${grade}级不能同时属于多个约束`);
      covered.add(grade);
    }
    const min = integer(raw.min ?? 0, `第 ${index + 1} 条最少人数`, 0, targetCount);
    const max = raw.max === null || raw.max === undefined || raw.max === ''
      ? targetCount
      : integer(raw.max, `第 ${index + 1} 条最多人数`, 0, targetCount);
    if (min > max) throw new Error(`第 ${index + 1} 条最少人数不能大于最多人数`);
    return {
      key: grades.join(''),
      label: `${grades.join('+')}级`,
      grades,
      min,
      max,
    };
  });
  const policy = { mode: 'custom' as const, constraints };
  const validation = validateManagerGradePolicy(policy, targetCount);
  if (!validation.ok) throw new Error(validation.reason);
  return policy;
}

export function validateManagerGradePolicy(
  policy: NormalizedManagerGradePolicy,
  targetCount: number
): { ok: true } | { ok: false; reason: string } {
  const result = evaluateGradePolicy([], targetCount, 100, policy.constraints);
  return result.valid
    ? { ok: true }
    : { ok: false, reason: `当前规则不存在可行的完整人数分布：${result.message}` };
}

export async function resolveManagerGradePolicy(
  db: Pick<DbExecutor, 'queryOne'>,
  batchId: number,
  department: string,
  targetCount: number
): Promise<NormalizedManagerGradePolicy> {
  const row = await db.queryOne<ManagerGradePolicyRow>(
    `SELECT id, batch_id, department, target_count, mode, constraints_json,
            created_by, created_at, updated_at
       FROM manager_grade_policy
      WHERE batch_id = ? AND department = ?`,
    [batchId, department]
  );
  if (!row) return normalizeManagerGradePolicy({ mode: 'default' }, targetCount);
  if (Number(row.target_count) !== targetCount) {
    throw Object.assign(
      new Error(`部门评价对象人数已由 ${row.target_count} 人变为 ${targetCount} 人，请管理员重新确认分档规则`),
      { status: 409 }
    );
  }
  let constraints: unknown;
  try {
    constraints = JSON.parse(row.constraints_json || '[]');
  } catch {
    throw Object.assign(new Error('部门分档规则数据损坏，请管理员重新配置'), { status: 500 });
  }
  return normalizeManagerGradePolicy({
    mode: row.mode,
    constraints: Array.isArray(constraints) ? constraints : [],
  }, targetCount);
}
