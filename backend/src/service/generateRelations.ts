import { createHash } from 'node:crypto';
import { queryAll, queryOne, transaction, type DbExecutor } from '../db/query.js';
import { BatchModel, type BatchRow } from '../model/batch.js';
import { getQuestionScorePolicy, type QuestionScoreMode, type SelfQuestionRow } from '../model/self_question.js';
import { effectiveManagedDepartments } from '../model/user.js';

export interface MissingQuestionUser {
  user_id: number;
  name: string;
  employee_no: string;
  department: string;
  level: string;
}

export type RelationInput = {
  batch_id: number;
  evaluator_id: number;
  target_id: number;
  role_type: string;
  eval_type: 'self' | 'peer' | 'upward' | 'downward';
};

export type GenerationUser = {
  id: number;
  name: string;
  employee_no: string;
  department: string;
  position: string;
  level: string;
  managed_departments: string[];
};

type ExistingRelation = {
  id: number;
  batch_id: number;
  evaluator_id: number;
  target_id: number;
  role_type: string;
  eval_type: 'self' | 'peer' | 'upward' | 'downward';
  status: 'pending' | 'draft' | 'completed';
};

type MatrixRow = {
  from_role: string;
  to_role: string;
  eval_type: string;
};

export interface GenerationUserImpact {
  user_id: number;
  name: string;
  employee_no: string;
  department: string;
  level: string;
  new_tasks?: number;
  new_scores?: number;
}

export interface RelationGenerationPreview {
  preview_hash: string;
  batch: { id: number; name: string; status: string };
  existing_total: number;
  desired_total: number;
  skipped_existing: number;
  obsolete_relations: number;
  inapplicable_pending_relations: number;
  new_relations: { total: number; self: number; peer: number; upward: number; downward: number };
  new_participants: GenerationUserImpact[];
  existing_evaluators_with_new_tasks: GenerationUserImpact[];
  score_affected_users: GenerationUserImpact[];
  missing_questions: MissingQuestionUser[];
}

export interface GenResult {
  total: number;
  self: number;
  peer: number;
  upward: number;
  downward: number;
  skipped_existing: number;
  preserved_existing: number;
  obsolete_relations: number;
  removed_inapplicable: number;
}

export class RelationGenerationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly data: unknown = null
  ) {
    super(message);
  }
}

type ReadDb = Pick<DbExecutor, 'queryAll' | 'queryOne'>;
const defaultDb: ReadDb = { queryAll, queryOne };

function relationKey(row: Pick<RelationInput, 'batch_id' | 'evaluator_id' | 'target_id' | 'eval_type'>): string {
  return `${row.batch_id}:${row.evaluator_id}:${row.target_id}:${row.eval_type}`;
}

function isEnabled(matrix: MatrixRow[], fromRole: string, toRole: string, evalType: string): boolean {
  if (matrix.length === 0) return true;
  return matrix.some(row => row.from_role === fromRole && row.to_role === toRole && row.eval_type === evalType);
}

function userImpact(user: GenerationUser): GenerationUserImpact {
  return {
    user_id: user.id,
    name: user.name,
    employee_no: user.employee_no,
    department: user.department,
    level: user.level,
  };
}

export function buildDesiredRelations(
  batch: BatchRow,
  matrix: MatrixRow[],
  users: GenerationUser[],
  scoreModes: Map<number, QuestionScoreMode>
): RelationInput[] {
  const mainLeaders = users.filter(user => user.level === 'main_leader');
  const divisionLeaders = users.filter(user => user.level === 'division_leader');
  const managers = users.filter(user => user.level === 'manager');
  const staff = users.filter(user => user.level === 'staff');
  const managerByDepartment = new Map<string, GenerationUser>();
  const managerDepartments = new Map<number, Set<string>>();
  for (const manager of managers) {
    const departments = new Set(effectiveManagedDepartments(manager));
    managerDepartments.set(manager.id, departments);
    for (const department of departments) {
      const existing = managerByDepartment.get(department);
      if (existing && existing.id !== manager.id) {
        throw new RelationGenerationError(`部门「${department}」同时配置了部门负责人「${existing.name}」和「${manager.name}」`, 409);
      }
      managerByDepartment.set(department, manager);
    }
  }
  const desired = new Map<string, RelationInput>();
  const supportsComprehensive = (target: GenerationUser) => scoreModes.get(target.id) !== 'performance_only_100_0';
  const add = (evaluator: GenerationUser, target: GenerationUser, evalType: RelationInput['eval_type']) => {
    const row: RelationInput = {
      batch_id: batch.id,
      evaluator_id: evaluator.id,
      target_id: target.id,
      role_type: evaluator.level,
      eval_type: evalType,
    };
    desired.set(relationKey(row), row);
  };

  for (const user of [...managers, ...staff]) {
    if (isEnabled(matrix, user.level, 'self', 'self')) add(user, user, 'self');
  }

  if (isEnabled(matrix, 'manager', 'manager', 'peer')) {
    for (const evaluator of managers) {
      for (const target of managers) {
        if (evaluator.id === target.id) continue;
        if (batch.peer_cross_dept !== 1 && evaluator.department !== target.department) continue;
        if (!supportsComprehensive(target)) continue;
        add(evaluator, target, 'peer');
      }
    }
  }

  if (isEnabled(matrix, 'staff', 'staff', 'peer')) {
    for (const evaluator of staff) {
      for (const target of staff) {
        if (evaluator.id !== target.id && evaluator.department === target.department) add(evaluator, target, 'peer');
      }
    }
  }

  if (
    isEnabled(matrix, 'staff', 'manager', 'upward')
    || isEnabled(matrix, 'staff', 'manager', 'peer')
  ) {
    for (const evaluator of staff) {
      const manager = managerByDepartment.get(evaluator.department);
      if (manager && supportsComprehensive(manager)) add(evaluator, manager, 'upward');
    }
  }

  if (isEnabled(matrix, 'manager', 'staff', 'downward')) {
    for (const manager of managers) {
      const departments = managerDepartments.get(manager.id) ?? new Set<string>();
      for (const target of staff) {
        if (departments.has(target.department)) add(manager, target, 'downward');
      }
    }
  }

  for (const leader of divisionLeaders) {
    const departments = new Set(leader.managed_departments);
    if (isEnabled(matrix, 'division_leader', 'manager', 'downward')) {
      for (const target of managers) if (departments.has(target.department)) add(leader, target, 'downward');
    }
    if (isEnabled(matrix, 'division_leader', 'staff', 'downward')) {
      for (const target of staff) if (departments.has(target.department)) add(leader, target, 'downward');
    }
  }

  for (const leader of mainLeaders) {
    if (isEnabled(matrix, 'main_leader', 'manager', 'downward')) {
      for (const target of managers) add(leader, target, 'downward');
    }
    if (isEnabled(matrix, 'main_leader', 'staff', 'downward')) {
      for (const target of staff) add(leader, target, 'downward');
    }
  }

  return [...desired.values()].sort((a, b) => relationKey(a).localeCompare(relationKey(b)));
}

function questionPolicies(rows: SelfQuestionRow[], users: GenerationUser[]): Map<number, ReturnType<typeof getQuestionScorePolicy>> {
  const usersById = new Map(users.map(user => [user.id, user]));
  return new Map(rows.map(row => {
    const user = usersById.get(row.user_id);
    return [row.user_id, getQuestionScorePolicy(row, user?.level ?? 'staff')];
  }));
}

function questionFingerprint(row: SelfQuestionRow): unknown[] {
  const values: unknown[] = [row.user_id];
  for (let i = 1; i <= 10; i++) values.push(row[`content_${i}` as keyof SelfQuestionRow] ?? null, Number(row[`weight_${i}` as keyof SelfQuestionRow] ?? 0));
  for (let i = 1; i <= 5; i++) values.push(row[`comp_content_${i}` as keyof SelfQuestionRow] ?? null, Number(row[`comp_weight_${i}` as keyof SelfQuestionRow] ?? 0));
  return values;
}

async function loadState(batchId: number, db: ReadDb) {
  const batch = await db.queryOne<BatchRow>('SELECT * FROM batch WHERE id = ?', [batchId]);
  if (!batch) throw new RelationGenerationError('批次不存在', 404);
  if (!['draft', 'active'].includes(batch.status) || BatchModel.isPastEndTime(batch)) {
    throw new RelationGenerationError('已结束或已过期批次不能生成评价关系', 409);
  }

  const rawUsers = await db.queryAll<Omit<GenerationUser, 'managed_departments'>>(
    `SELECT id, name, employee_no, department, position, level
       FROM app_user
      WHERE status = 'active' AND is_admin = 0
      ORDER BY id`,
    []
  );
  const managedRows = await db.queryAll<{ user_id: number; department: string }>(
    'SELECT user_id, department FROM division_leader_department ORDER BY user_id, department',
    []
  );
  const managed = new Map<number, string[]>();
  for (const row of managedRows) {
    if (!managed.has(row.user_id)) managed.set(row.user_id, []);
    managed.get(row.user_id)!.push(row.department);
  }
  const users: GenerationUser[] = rawUsers.map(user => ({
    ...user,
    managed_departments: managed.get(user.id) ?? [],
  }));
  const matrix = await db.queryAll<MatrixRow>(
    `SELECT from_role, to_role, eval_type
       FROM eval_matrix
      WHERE batch_id = ? AND enabled = 1
      ORDER BY from_role, to_role, eval_type`,
    [batchId]
  );
  const questions = await db.queryAll<SelfQuestionRow>(
    'SELECT * FROM self_question WHERE batch_id = ? ORDER BY user_id',
    [batchId]
  );
  const existing = await db.queryAll<ExistingRelation>(
    `SELECT id, batch_id, evaluator_id, target_id, role_type, eval_type, status
       FROM relation WHERE batch_id = ? ORDER BY id`,
    [batchId]
  );
  const answeredTargets = new Set((await db.queryAll<{ target_id: number }>(
    `SELECT DISTINCT r.target_id
       FROM relation r
       JOIN answer a ON a.relation_id = r.id
      WHERE r.batch_id = ?`,
    [batchId]
  )).map(row => row.target_id));
  const answeredRelationIds = new Set((await db.queryAll<{ relation_id: number }>(
    `SELECT DISTINCT r.id as relation_id
       FROM relation r
       JOIN answer a ON a.relation_id = r.id
      WHERE r.batch_id = ?`,
    [batchId]
  )).map(row => row.relation_id));

  return { batch, users, matrix, questions, existing, answeredTargets, answeredRelationIds };
}

async function calculatePreview(batchId: number, db: ReadDb) {
  const state = await loadState(batchId, db);
  const policies = questionPolicies(state.questions, state.users);
  const scoreModes = new Map([...policies].map(([userId, policy]) => [userId, policy.score_mode]));
  const desired = buildDesiredRelations(state.batch, state.matrix, state.users, scoreModes);
  const usersById = new Map(state.users.map(user => [user.id, user]));
  const comparisonKey = (row: RelationInput | ExistingRelation) => {
    const legacyUpward = row.eval_type === 'peer'
      && row.role_type === 'staff'
      && usersById.get(row.target_id)?.level === 'manager';
    return relationKey(legacyUpward ? { ...row, eval_type: 'upward' } : row);
  };
  const existingKeys = new Set(state.existing.map(comparisonKey));
  const desiredKeys = new Set(desired.map(relationKey));
  const missingRelations = desired.filter(row => !existingKeys.has(comparisonKey(row)));
  const validQuestions = new Set([...policies].filter(([, policy]) => policy.valid).map(([userId]) => userId));
  const missingQuestions = state.users
    .filter(user => ['manager', 'staff'].includes(user.level) && !validQuestions.has(user.id))
    .map(user => userImpact(user));

  const existingParticipants = new Set<number>();
  for (const row of state.existing) {
    existingParticipants.add(row.evaluator_id);
    existingParticipants.add(row.target_id);
  }
  const desiredParticipants = new Set<number>();
  for (const row of desired) {
    desiredParticipants.add(row.evaluator_id);
    desiredParticipants.add(row.target_id);
  }
  const inapplicableRelations = state.existing.filter(row => {
    const target = usersById.get(row.target_id);
    return (row.eval_type === 'peer' || row.eval_type === 'upward')
      && target?.level === 'manager'
      && scoreModes.get(row.target_id) === 'performance_only_100_0'
      && row.status === 'pending'
      && !state.answeredRelationIds.has(row.id);
  });
  const inapplicableIds = new Set(inapplicableRelations.map(row => row.id));
  const newParticipants = [...desiredParticipants]
    .filter(id => !existingParticipants.has(id))
    .map(id => usersById.get(id))
    .filter((user): user is GenerationUser => !!user)
    .map(userImpact);

  const evaluatorTaskCounts = new Map<number, number>();
  const scoreCounts = new Map<number, number>();
  for (const row of missingRelations) {
    if (existingParticipants.has(row.evaluator_id)) {
      evaluatorTaskCounts.set(row.evaluator_id, (evaluatorTaskCounts.get(row.evaluator_id) ?? 0) + 1);
    }
    if (existingParticipants.has(row.target_id) && state.answeredTargets.has(row.target_id)) {
      scoreCounts.set(row.target_id, (scoreCounts.get(row.target_id) ?? 0) + 1);
    }
  }
  const existingEvaluators = [...evaluatorTaskCounts].map(([id, newTasks]) => ({
    ...userImpact(usersById.get(id)!),
    new_tasks: newTasks,
  }));
  const scoreAffected = [...scoreCounts].map(([id, newScores]) => ({
    ...userImpact(usersById.get(id)!),
    new_scores: newScores,
  }));

  const fingerprint = {
    batch: [state.batch.id, state.batch.status, state.batch.start_time, state.batch.end_time, state.batch.peer_cross_dept],
    users: state.users.map(user => [user.id, user.level, user.department, [...user.managed_departments].sort()]),
    matrix: state.matrix.map(row => [row.from_role, row.to_role, row.eval_type]),
    questions: state.questions.map(questionFingerprint),
    relations: state.existing.map(row => [row.id, relationKey(row), row.status]),
    answered_relations: [...state.answeredRelationIds].sort((a, b) => a - b),
  };
  const previewHash = createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
  const countType = (type: RelationInput['eval_type']) => missingRelations.filter(row => row.eval_type === type).length;

  const preview: RelationGenerationPreview = {
    preview_hash: previewHash,
    batch: { id: state.batch.id, name: state.batch.name, status: state.batch.status },
    existing_total: state.existing.length,
    desired_total: desired.length,
    skipped_existing: desired.length - missingRelations.length,
    obsolete_relations: state.existing.filter(row => !desiredKeys.has(comparisonKey(row)) && !inapplicableIds.has(row.id)).length,
    inapplicable_pending_relations: inapplicableRelations.length,
    new_relations: {
      total: missingRelations.length,
      self: countType('self'),
      peer: countType('peer'),
      upward: countType('upward'),
      downward: countType('downward'),
    },
    new_participants: newParticipants,
    existing_evaluators_with_new_tasks: existingEvaluators,
    score_affected_users: scoreAffected,
    missing_questions: missingQuestions,
  };

  return { preview, missingRelations, inapplicableRelationIds: inapplicableRelations.map(row => row.id) };
}

export async function buildRelationPreview(batchId: number): Promise<RelationGenerationPreview> {
  return (await calculatePreview(batchId, defaultDb)).preview;
}

export async function generateRelations(
  batchId: number,
  expectedHash: string,
  audit: { adminId: number; ip?: string }
): Promise<GenResult> {
  return transaction(async tx => {
    await tx.queryOne<{ id: number }>('SELECT id FROM batch WHERE id = ? FOR UPDATE', [batchId]);
    const { preview, missingRelations, inapplicableRelationIds } = await calculatePreview(batchId, tx);
    if (preview.missing_questions.length > 0) {
      throw new RelationGenerationError('存在未录入题目的人员，无法生成评价关系', 409, {
        missing_questions: preview.missing_questions,
      });
    }
    if (!expectedHash || preview.preview_hash !== expectedHash) {
      throw new RelationGenerationError('人员、题目、矩阵或评价关系已发生变化，请重新预览', 409, {
        expected_hash: preview.preview_hash,
      });
    }

    for (const relationId of inapplicableRelationIds) {
      await tx.execute('DELETE FROM relation WHERE id = ? AND status = ?', [relationId, 'pending']);
    }

    for (const row of missingRelations) {
      await tx.execute(
        `INSERT INTO relation (batch_id, evaluator_id, target_id, role_type, eval_type)
         VALUES (?, ?, ?, ?, ?)`,
        [row.batch_id, row.evaluator_id, row.target_id, row.role_type, row.eval_type]
      );
    }

    const result: GenResult = {
      total: missingRelations.length,
      self: missingRelations.filter(row => row.eval_type === 'self').length,
      peer: missingRelations.filter(row => row.eval_type === 'peer').length,
      upward: missingRelations.filter(row => row.eval_type === 'upward').length,
      downward: missingRelations.filter(row => row.eval_type === 'downward').length,
      skipped_existing: preview.skipped_existing,
      preserved_existing: preview.existing_total - inapplicableRelationIds.length,
      obsolete_relations: preview.obsolete_relations,
      removed_inapplicable: inapplicableRelationIds.length,
    };
    await tx.execute(
      'INSERT INTO log (user_id, action, ip, detail) VALUES (?, ?, ?, ?)',
      [audit.adminId, 'relation.incremental_generate', audit.ip ?? null, JSON.stringify({ batch_id: batchId, ...result })]
    );
    return result;
  });
}
