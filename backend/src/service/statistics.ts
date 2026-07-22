import { queryAll } from '../db/query.js';
import { AnswerModel, type AnswerRow } from '../model/answer.js';
import { BatchModel } from '../model/batch.js';
import { RelationModel, type RelationRow } from '../model/relation.js';
import type { QuestionScoreMode } from '../model/self_question.js';

type TargetLevel = 'manager' | 'staff';

interface StatUser {
  id: number;
  name: string;
  employee_no: string;
  department: string;
  position: string;
  level: TargetLevel;
  department_sort_order: number;
  department_id: number;
  performance_total: number;
  comprehensive_total: number;
}

export interface StatisticsRow {
  index: number;
  department: string;
  employee_no: string;
  name: string;
  role: TargetLevel;
  role_label: string;
  performance_main_leader_score: number | null;
  performance_division_leader_score: number | null;
  performance_manager_score: number | null;
  performance_leader_score: number | null;
  performance_self_score: number | null;
  performance_score: number | null;
  comprehensive_main_leader_score: number | null;
  comprehensive_division_leader_score: number | null;
  comprehensive_manager_score: number | null;
  comprehensive_manager_peer_score: number | null;
  comprehensive_employee_review_score: number | null;
  comprehensive_staff_peer_score: number | null;
  comprehensive_self_score: number | null;
  comprehensive_score: number | null;
  final_score: number | null;
  data_status: 'complete' | 'missing';
  missing_items: string[];
}

export interface StatisticsResult {
  batch: Awaited<ReturnType<typeof BatchModel.findById>>;
  summary: {
    total: number;
    complete: number;
    missing: number;
  };
  rows: StatisticsRow[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function composeManagerFinalScore(
  performanceScore: number | null,
  comprehensiveScore: number | null,
  scoreMode: QuestionScoreMode
): number | null {
  if (performanceScore === null) return null;
  if (scoreMode === 'performance_only_100_0') return round1(performanceScore);
  return comprehensiveScore === null ? null : round1(performanceScore + comprehensiveScore);
}

function average(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number =>
    value !== null && value !== undefined && Number.isFinite(Number(value))
  );
  if (valid.length === 0) return null;
  return round1(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function sumBySection(answers: AnswerRow[], section: 'performance' | 'comprehensive'): number | null {
  const sectionSeq = section === 'performance' ? -1 : -2;
  const explicit = answers.find(answer => answer.question_seq === sectionSeq && answer.is_total === 0);
  if (explicit?.score !== null && explicit?.score !== undefined) return round1(Number(explicit.score));
  const scores = answers
    .filter(answer => answer.is_total === 0 && answer.question_seq !== null)
    .filter(answer => section === 'performance'
      ? Number(answer.question_seq) > 0 && Number(answer.question_seq) <= 100
      : Number(answer.question_seq) > 100)
    .map(answer => Number(answer.score));
  if (scores.length === 0) return null;
  return round1(scores.reduce((sum, score) => sum + score, 0));
}

function totalScore(answers: AnswerRow[]): number | null {
  const total = answers.find(answer => answer.is_total === 1);
  return total?.score === null || total?.score === undefined ? null : round1(Number(total.score));
}

function completedRelationScore(
  relation: RelationRow | undefined,
  answersMap: Map<number, AnswerRow[]>,
  mode: 'performance' | 'comprehensive' | 'total'
): number | null {
  if (!relation || relation.status !== 'completed') return null;
  const answers = answersMap.get(relation.id) || [];
  if (mode === 'total') return totalScore(answers);
  const section = sumBySection(answers, mode);
  if (
    section === null
    && mode === 'comprehensive'
    && relation.eval_type === 'downward'
    && ['main_leader', 'division_leader'].includes(relation.evaluator_level || '')
  ) {
    const legacyTotal = totalScore(answers);
    return legacyTotal !== null && legacyTotal <= 30 ? legacyTotal : null;
  }
  return section;
}

function completedRelationScores(
  relations: RelationRow[],
  answersMap: Map<number, AnswerRow[]>,
  mode: 'performance' | 'comprehensive' | 'total'
): Array<number | null> {
  return relations.map(relation => completedRelationScore(relation, answersMap, mode));
}

function findSelfRelation(relations: RelationRow[], userId: number): RelationRow | undefined {
  return relations.find(relation =>
    relation.eval_type === 'self'
    && relation.evaluator_id === userId
    && relation.target_id === userId
  );
}

function relationsToTarget(
  relations: RelationRow[],
  targetId: number,
  filters: { evalType: 'peer' | 'downward'; evaluatorLevel?: string }
): RelationRow[] {
  return relations.filter(relation =>
    relation.target_id === targetId
    && relation.eval_type === filters.evalType
    && (!filters.evaluatorLevel || relation.evaluator_level === filters.evaluatorLevel)
  );
}

function firstRelationToTarget(
  relations: RelationRow[],
  targetId: number,
  filters: { evalType: 'peer' | 'downward'; evaluatorLevel?: string }
): RelationRow | undefined {
  return relationsToTarget(relations, targetId, filters)[0];
}

function getTargetUsers(batchId: number): Promise<StatUser[]> {
  return queryAll<StatUser>(
    `SELECT u.id, u.name, u.employee_no, u.department, u.position, u.level,
            COALESCE(d.sort_order, 999999) as department_sort_order,
            COALESCE(d.id, 999999) as department_id,
            ${Array.from({ length: 10 }, (_, index) => `COALESCE(sq.weight_${index + 1}, 0)`).join(' + ')} as performance_total,
            ${Array.from({ length: 5 }, (_, index) => `COALESCE(sq.comp_weight_${index + 1}, 0)`).join(' + ')} as comprehensive_total
     FROM app_user u
     JOIN self_question sq ON sq.user_id = u.id AND sq.batch_id = ?
     LEFT JOIN department d ON d.name = u.department
     WHERE u.is_admin = 0 AND u.status = 'active' AND u.level IN ('manager', 'staff')
     ORDER BY COALESCE(d.sort_order, 999999), COALESCE(d.id, 999999), u.employee_no ASC`,
    [batchId]
  );
}

function addMissing(missing: string[], label: string, value: number | null): void {
  if (value === null || value === undefined || !Number.isFinite(value)) missing.push(label);
}

function roleLabel(role: TargetLevel): string {
  return role === 'manager' ? '部门负责人' : '员工';
}

function weighted(values: Array<{ label: string; value: number | null; weight: number }>, missing: string[]): number | null {
  for (const item of values) addMissing(missing, item.label, item.value);
  if (values.some(item => item.value === null || item.value === undefined)) return null;
  return round1(values.reduce((sum, item) => sum + Number(item.value) * item.weight, 0));
}

function managerPerformance(
  userId: number,
  relations: RelationRow[],
  answersMap: Map<number, AnswerRow[]>,
  missing: string[]
): number | null {
  const mainRelations = relationsToTarget(relations, userId, { evalType: 'downward', evaluatorLevel: 'main_leader' });
  const divisionRelations = relationsToTarget(relations, userId, { evalType: 'downward', evaluatorLevel: 'division_leader' });
  const main = average(completedRelationScores(mainRelations, answersMap, 'performance'));
  const division = average(completedRelationScores(divisionRelations, answersMap, 'performance'));
  addMissing(missing, '业绩-主要领导评价', main);
  if (divisionRelations.length > 0) addMissing(missing, '业绩-分管领导评价', division);
  if (main === null) return null;
  if (divisionRelations.length === 0) return main;
  if (division === null) return null;
  return round1(main * 0.4 + division * 0.6);
}

function buildManagerRow(
  index: number,
  user: StatUser,
  relations: RelationRow[],
  answersMap: Map<number, AnswerRow[]>
): StatisticsRow {
  const missing: string[] = [];
  const scoreMode: QuestionScoreMode = Math.abs(Number(user.performance_total) - 100) <= 0.001
    && Math.abs(Number(user.comprehensive_total)) <= 0.001
    ? 'performance_only_100_0'
    : 'standard_70_30';
  const performanceOnly = scoreMode === 'performance_only_100_0';
  const selfRel = findSelfRelation(relations, user.id);
  const selfAnswers = selfRel?.status === 'completed' ? answersMap.get(selfRel.id) || [] : [];
  const performanceSelf = selfAnswers.length ? sumBySection(selfAnswers, 'performance') : null;
  const comprehensiveSelf = !performanceOnly && selfAnswers.length ? sumBySection(selfAnswers, 'comprehensive') : null;
  const performanceLeader = managerPerformance(user.id, relations, answersMap, missing);
  const performanceMainLeader = average(completedRelationScores(
    relationsToTarget(relations, user.id, { evalType: 'downward', evaluatorLevel: 'main_leader' }), answersMap, 'performance'
  ));
  const performanceDivisionLeader = average(completedRelationScores(
    relationsToTarget(relations, user.id, { evalType: 'downward', evaluatorLevel: 'division_leader' }), answersMap, 'performance'
  ));
  addMissing(missing, '业绩-自评价', performanceSelf);
  const performanceScore = performanceLeader !== null && performanceSelf !== null
    ? round1(performanceLeader * 0.7 + performanceSelf * 0.3)
    : null;

  const mainComp = performanceOnly ? null : average(completedRelationScores(
    relationsToTarget(relations, user.id, { evalType: 'downward', evaluatorLevel: 'main_leader' }),
    answersMap,
    'comprehensive'
  ));
  const divisionComp = performanceOnly ? null : average(completedRelationScores(
    relationsToTarget(relations, user.id, { evalType: 'downward', evaluatorLevel: 'division_leader' }),
    answersMap,
    'comprehensive'
  ));
  const managerPeer = performanceOnly ? null : average(completedRelationScores(
    relationsToTarget(relations, user.id, { evalType: 'peer', evaluatorLevel: 'manager' }),
    answersMap,
    'total'
  ));
  const staffReview = performanceOnly ? null : average(completedRelationScores(
    relationsToTarget(relations, user.id, { evalType: 'peer', evaluatorLevel: 'staff' }),
    answersMap,
    'total'
  ));
  const comprehensiveMissing: string[] = [];
  const comprehensiveScore = performanceOnly ? null : weighted([
    { label: '综合-主要领导评价', value: mainComp, weight: 0.4 },
    { label: '综合-分管领导评价', value: divisionComp, weight: 0.25 },
    { label: '中层互评', value: managerPeer, weight: 0.2 },
    { label: '员工评议', value: staffReview, weight: 0.15 },
  ], comprehensiveMissing);
  missing.push(...comprehensiveMissing);

  const finalScore = composeManagerFinalScore(performanceScore, comprehensiveScore, scoreMode);

  return {
    index,
    department: user.department,
    employee_no: user.employee_no,
    name: user.name,
    role: user.level,
    role_label: roleLabel(user.level),
    performance_main_leader_score: performanceMainLeader,
    performance_division_leader_score: performanceDivisionLeader,
    performance_manager_score: null,
    performance_leader_score: performanceLeader,
    performance_self_score: performanceSelf,
    performance_score: performanceScore,
    comprehensive_main_leader_score: mainComp,
    comprehensive_division_leader_score: divisionComp,
    comprehensive_manager_score: null,
    comprehensive_manager_peer_score: managerPeer,
    comprehensive_employee_review_score: staffReview,
    comprehensive_staff_peer_score: null,
    comprehensive_self_score: comprehensiveSelf,
    comprehensive_score: comprehensiveScore,
    final_score: finalScore,
    data_status: finalScore === null ? 'missing' : 'complete',
    missing_items: [...new Set(missing)],
  };
}

function buildStaffRow(
  index: number,
  user: StatUser,
  relations: RelationRow[],
  answersMap: Map<number, AnswerRow[]>
): StatisticsRow {
  const missing: string[] = [];
  const selfRel = findSelfRelation(relations, user.id);
  const selfAnswers = selfRel?.status === 'completed' ? answersMap.get(selfRel.id) || [] : [];
  const performanceSelf = selfAnswers.length ? sumBySection(selfAnswers, 'performance') : null;
  const comprehensiveSelf = selfAnswers.length ? sumBySection(selfAnswers, 'comprehensive') : null;
  addMissing(missing, '业绩-自评价', performanceSelf);

  const managerRel = firstRelationToTarget(relations, user.id, { evalType: 'downward', evaluatorLevel: 'manager' });
  const performanceLeader = completedRelationScore(managerRel, answersMap, 'performance');
  const performanceMainLeader = average(completedRelationScores(
    relationsToTarget(relations, user.id, { evalType: 'downward', evaluatorLevel: 'main_leader' }), answersMap, 'performance'
  ));
  const performanceDivisionLeader = average(completedRelationScores(
    relationsToTarget(relations, user.id, { evalType: 'downward', evaluatorLevel: 'division_leader' }), answersMap, 'performance'
  ));
  addMissing(missing, '业绩-部门负责人评价', performanceLeader);
  const performanceScore = performanceLeader !== null && performanceSelf !== null
    ? round1(performanceLeader * 0.7 + performanceSelf * 0.3)
    : null;

  const mainComp = average(completedRelationScores(
    relationsToTarget(relations, user.id, { evalType: 'downward', evaluatorLevel: 'main_leader' }),
    answersMap,
    'comprehensive'
  ));
  const divisionComp = average(completedRelationScores(
    relationsToTarget(relations, user.id, { evalType: 'downward', evaluatorLevel: 'division_leader' }),
    answersMap,
    'comprehensive'
  ));
  const managerComp = completedRelationScore(managerRel, answersMap, 'comprehensive');
  const staffPeer = average(completedRelationScores(
    relationsToTarget(relations, user.id, { evalType: 'peer', evaluatorLevel: 'staff' }),
    answersMap,
    'total'
  ));
  const comprehensiveScore = weighted([
    { label: '综合-主要领导评价', value: mainComp, weight: 0.15 },
    { label: '综合-分管领导评价', value: divisionComp, weight: 0.25 },
    { label: '综合-部门负责人评价', value: managerComp, weight: 0.4 },
    { label: '员工互评', value: staffPeer, weight: 0.2 },
  ], missing);
  const finalScore = performanceScore !== null && comprehensiveScore !== null
    ? round1(performanceScore + comprehensiveScore)
    : null;

  return {
    index,
    department: user.department,
    employee_no: user.employee_no,
    name: user.name,
    role: user.level,
    role_label: roleLabel(user.level),
    performance_main_leader_score: performanceMainLeader,
    performance_division_leader_score: performanceDivisionLeader,
    performance_manager_score: performanceLeader,
    performance_leader_score: performanceLeader,
    performance_self_score: performanceSelf,
    performance_score: performanceScore,
    comprehensive_main_leader_score: mainComp,
    comprehensive_division_leader_score: divisionComp,
    comprehensive_manager_score: managerComp,
    comprehensive_manager_peer_score: null,
    comprehensive_employee_review_score: null,
    comprehensive_staff_peer_score: staffPeer,
    comprehensive_self_score: comprehensiveSelf,
    comprehensive_score: comprehensiveScore,
    final_score: finalScore,
    data_status: finalScore === null ? 'missing' : 'complete',
    missing_items: [...new Set(missing)],
  };
}

export async function buildStatistics(batchId: number): Promise<StatisticsResult | null> {
  const batch = await BatchModel.findById(batchId);
  if (!batch) return null;

  const users = await getTargetUsers(batchId);
  const relations = await RelationModel.findByBatchId(batchId);
  const answers = await AnswerModel.findByRelationIds(relations.map(relation => relation.id));
  const answersMap = new Map<number, AnswerRow[]>();
  for (const answer of answers) {
    if (!answersMap.has(answer.relation_id)) answersMap.set(answer.relation_id, []);
    answersMap.get(answer.relation_id)!.push(answer);
  }

  const rows = users.map((user, index) => user.level === 'manager'
    ? buildManagerRow(index + 1, user, relations, answersMap)
    : buildStaffRow(index + 1, user, relations, answersMap)
  );

  return {
    batch,
    summary: {
      total: rows.length,
      complete: rows.filter(row => row.data_status === 'complete').length,
      missing: rows.filter(row => row.data_status === 'missing').length,
    },
    rows,
  };
}
