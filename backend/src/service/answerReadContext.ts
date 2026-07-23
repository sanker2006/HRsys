import { AnswerModel, type AnswerRow } from '../model/answer.js';
import { RelationModel, type RelationRow } from '../model/relation.js';
import {
  SelfQuestionModel,
  type QuestionItem,
  type SelfQuestionExport,
  type SelfQuestionRow,
} from '../model/self_question.js';

export interface EvaluationQuestionContext extends SelfQuestionExport {
  performance_questions: Array<QuestionItem & { self_score: number | null; manager_score: number | null }>;
  comprehensive_questions: Array<QuestionItem & { self_score: number | null; manager_score: number | null }>;
  questions: Array<QuestionItem & { self_score: number | null; manager_score: number | null }>;
  self_total: number | null;
  manager_total: number | null;
}

export interface EvaluationReadContext {
  questionByTarget: Map<number, SelfQuestionRow>;
  selfRelationByTarget: Map<number, RelationRow>;
  managerRelationByTarget: Map<number, RelationRow>;
  answersByRelation: Map<number, AnswerRow[]>;
  managerCompletion: Map<number, { total: number; completed: number }>;
}

export interface EvaluationReadDependencies {
  findQuestions(batchId: number, targetIds: number[]): Promise<SelfQuestionRow[]>;
  findContextRelations(batchId: number, targetIds: number[]): Promise<RelationRow[]>;
  findAnswers(relationIds: number[]): Promise<AnswerRow[]>;
  findManagerCompletion(
    batchId: number,
    managerIds: number[]
  ): Promise<Array<{ manager_id: number; total: number; completed: number }>>;
}

const defaultDependencies: EvaluationReadDependencies = {
  findQuestions: (batchId, targetIds) => SelfQuestionModel.findByBatchAndUsers(batchId, targetIds),
  findContextRelations: (batchId, targetIds) => RelationModel.findEvaluationContextRelations(batchId, targetIds),
  findAnswers: relationIds => AnswerModel.findByRelationIds(relationIds),
  findManagerCompletion: (batchId, managerIds) => RelationModel.findManagerStaffCompletion(batchId, managerIds),
};

function totalOfAnswers(answers: AnswerRow[]): number | null {
  return answers.find(answer => answer.is_total === 1)?.score ?? null;
}

export async function loadEvaluationReadContext(
  relations: RelationRow[],
  dependencies: EvaluationReadDependencies = defaultDependencies
): Promise<EvaluationReadContext> {
  if (relations.length === 0) {
    return {
      questionByTarget: new Map(),
      selfRelationByTarget: new Map(),
      managerRelationByTarget: new Map(),
      answersByRelation: new Map(),
      managerCompletion: new Map(),
    };
  }

  const batchId = relations[0].batch_id;
  if (relations.some(relation => relation.batch_id !== batchId)) {
    throw new Error('评价读取上下文必须属于同一批次');
  }

  const targetIds = [...new Set(relations.map(relation => relation.target_id))];
  const [questions, contextRelations] = await Promise.all([
    dependencies.findQuestions(batchId, targetIds),
    dependencies.findContextRelations(batchId, targetIds),
  ]);

  const selfRelationByTarget = new Map<number, RelationRow>();
  const managerRelationByTarget = new Map<number, RelationRow>();
  for (const relation of contextRelations) {
    if (relation.eval_type === 'self' && relation.evaluator_id === relation.target_id) {
      selfRelationByTarget.set(relation.target_id, relation);
    } else if (
      relation.eval_type === 'downward'
      && relation.evaluator_level === 'manager'
      && !managerRelationByTarget.has(relation.target_id)
    ) {
      managerRelationByTarget.set(relation.target_id, relation);
    }
  }

  const managerIds = new Set<number>();
  for (const relation of relations) {
    if (
      (relation.evaluator_level === 'main_leader' || relation.evaluator_level === 'division_leader')
      && relation.target_level === 'manager'
    ) {
      managerIds.add(relation.target_id);
    }
    const managerRelation = managerRelationByTarget.get(relation.target_id);
    if (managerRelation) managerIds.add(managerRelation.evaluator_id);
  }

  const answerRelationIds = [
    ...selfRelationByTarget.values(),
    ...managerRelationByTarget.values(),
  ].map(relation => relation.id);
  const [answers, completionRows] = await Promise.all([
    dependencies.findAnswers(answerRelationIds),
    dependencies.findManagerCompletion(batchId, [...managerIds]),
  ]);

  const answersByRelation = new Map<number, AnswerRow[]>();
  for (const answer of answers) {
    if (!answersByRelation.has(answer.relation_id)) answersByRelation.set(answer.relation_id, []);
    answersByRelation.get(answer.relation_id)!.push(answer);
  }

  return {
    questionByTarget: new Map(questions.map(question => [question.user_id, question])),
    selfRelationByTarget,
    managerRelationByTarget,
    answersByRelation,
    managerCompletion: new Map(completionRows.map(row => [
      row.manager_id,
      { total: Number(row.total), completed: Number(row.completed) },
    ])),
  };
}

export function canEvaluateFromContext(
  relation: RelationRow,
  context: EvaluationReadContext
): { ok: boolean; reason?: string } {
  if (relation.eval_type === 'self' || relation.eval_type === 'peer') return { ok: true };

  if (relation.evaluator_level === 'manager' && relation.target_level === 'staff') {
    const selfRelation = context.selfRelationByTarget.get(relation.target_id);
    return selfRelation?.status === 'completed'
      ? { ok: true }
      : { ok: false, reason: '员工正式提交自评后，部门负责人才能评价' };
  }

  if (relation.evaluator_level === 'division_leader' || relation.evaluator_level === 'main_leader') {
    if (relation.target_level === 'manager') {
      const selfRelation = context.selfRelationByTarget.get(relation.target_id);
      if (selfRelation?.status !== 'completed') {
        return { ok: false, reason: '部门负责人正式提交自评后，领导才能评价' };
      }
      const completion = context.managerCompletion.get(relation.target_id);
      if (!completion || completion.total === 0 || completion.completed !== completion.total) {
        return { ok: false, reason: '部门负责人完成所负责部门的所有员工评分后，领导才能评价' };
      }
      return { ok: true };
    }

    if (relation.target_level === 'staff') {
      const managerRelation = context.managerRelationByTarget.get(relation.target_id);
      if (managerRelation?.status !== 'completed') {
        return { ok: false, reason: '部门负责人完成该员工评分后，领导才能评价' };
      }
      const completion = context.managerCompletion.get(managerRelation.evaluator_id);
      if (!completion || completion.total === 0 || completion.completed !== completion.total) {
        return { ok: false, reason: '部门负责人完成所负责部门的所有员工评分后，领导才能评价该部门人员' };
      }
      return { ok: true };
    }
  }

  return { ok: true };
}

export function buildQuestionContextFromReadContext(
  relation: RelationRow,
  context: EvaluationReadContext
): EvaluationQuestionContext | null {
  const question = context.questionByTarget.get(relation.target_id);
  if (!question) return null;
  const exportRow = SelfQuestionModel.toExportFormat([question])[0];
  const selfRelation = context.selfRelationByTarget.get(relation.target_id);
  const managerRelation = relation.target_level === 'staff'
    ? context.managerRelationByTarget.get(relation.target_id)
    : undefined;
  const selfScores = selfRelation ? context.answersByRelation.get(selfRelation.id) || [] : [];
  const managerScores = managerRelation ? context.answersByRelation.get(managerRelation.id) || [] : [];
  const selfBySequence = new Map(
    selfScores.filter(answer => answer.question_seq !== null && answer.is_total === 0)
      .map(answer => [answer.question_seq!, answer])
  );
  const managerBySequence = new Map(
    managerScores.filter(answer => answer.question_seq !== null && answer.is_total === 0)
      .map(answer => [answer.question_seq!, answer])
  );

  const enrich = (item: QuestionItem) => ({
    ...item,
    self_score: selfBySequence.get(item.answer_seq)?.score ?? null,
    manager_score: managerBySequence.get(item.answer_seq)?.score ?? null,
  });
  const performanceQuestions = relation.eval_type === 'peer'
    ? []
    : exportRow.performance_questions.map(enrich);
  const comprehensiveQuestions = exportRow.comprehensive_questions.map(enrich);

  return {
    ...exportRow,
    performance_questions: performanceQuestions,
    comprehensive_questions: comprehensiveQuestions,
    questions: relation.eval_type === 'peer'
      ? comprehensiveQuestions
      : [...performanceQuestions, ...comprehensiveQuestions],
    self_total: totalOfAnswers(selfScores),
    manager_total: totalOfAnswers(managerScores),
  };
}
