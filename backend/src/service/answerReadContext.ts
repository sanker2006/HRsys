import { AnswerModel, type AnswerRow } from '../model/answer.js';
import { RelationModel, type RelationRow } from '../model/relation.js';
import {
  SelfQuestionModel,
  type QuestionItem,
  type SelfQuestionExport,
  type SelfQuestionRow,
} from '../model/self_question.js';
import { classifyEvaluationRelation } from './evaluationScene.js';

export interface EvaluationQuestionContext extends SelfQuestionExport {
  performance_questions: Array<QuestionItem & { self_score: number | null; manager_score: number | null }>;
  comprehensive_questions: Array<QuestionItem & { self_score: number | null; manager_score: number | null }>;
  questions: Array<QuestionItem & { self_score: number | null; manager_score: number | null }>;
  self_total: number | null;
  manager_total: number | null;
  references: EvaluationReference[];
}

export interface EvaluationReference {
  type: 'self' | 'manager' | 'peer';
  source_relation_id: number;
  source_role: string;
  status: 'completed';
  label: string;
  total: number | null;
  scores: Array<{ question_seq: number; score: number }>;
}

export interface EvaluationReadContext {
  questionByTarget: Map<number, SelfQuestionRow>;
  selfRelationByTarget: Map<number, RelationRow>;
  managerRelationByTarget: Map<number, RelationRow>;
  answersByRelation: Map<number, AnswerRow[]>;
  managerCompletion: Map<number, { total: number; completed: number }>;
  peerCompletion: Map<number, { total: number; completed: number }>;
  referenceRelationsByTarget: Map<number, RelationRow[]>;
}

export interface EvaluationReadDependencies {
  findQuestions(batchId: number, targetIds: number[]): Promise<SelfQuestionRow[]>;
  findContextRelations(batchId: number, targetIds: number[]): Promise<RelationRow[]>;
  findAnswers(relationIds: number[]): Promise<AnswerRow[]>;
  findManagerCompletion(
    batchId: number,
    managerIds: number[]
  ): Promise<Array<{ manager_id: number; total: number; completed: number }>>;
  findPeerCompletion(
    batchId: number,
    targetIds: number[]
  ): Promise<Array<{ target_id: number; total: number; completed: number }>>;
}

const defaultDependencies: EvaluationReadDependencies = {
  findQuestions: (batchId, targetIds) => SelfQuestionModel.findByBatchAndUsers(batchId, targetIds),
  findContextRelations: (batchId, targetIds) => RelationModel.findEvaluationContextRelations(batchId, targetIds),
  findAnswers: relationIds => AnswerModel.findByRelationIds(relationIds),
  findManagerCompletion: (batchId, managerIds) => RelationModel.findManagerStaffCompletion(batchId, managerIds),
  findPeerCompletion: (batchId, targetIds) => RelationModel.findIncomingPeerCompletion(batchId, targetIds),
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
      peerCompletion: new Map(),
      referenceRelationsByTarget: new Map(),
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
  const completedContextRelations = contextRelations.filter(relation => relation.status === 'completed');

  const selfRelationByTarget = new Map<number, RelationRow>();
  const managerRelationByTarget = new Map<number, RelationRow>();
  const referenceRelationsByTarget = new Map<number, RelationRow[]>();
  for (const relation of completedContextRelations) {
    if (!referenceRelationsByTarget.has(relation.target_id)) referenceRelationsByTarget.set(relation.target_id, []);
    referenceRelationsByTarget.get(relation.target_id)!.push(relation);
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

  const answerRelationIds = completedContextRelations.map(relation => relation.id);
  const [answers, completionRows, peerCompletionRows] = await Promise.all([
    dependencies.findAnswers(answerRelationIds),
    dependencies.findManagerCompletion(batchId, [...managerIds]),
    dependencies.findPeerCompletion(batchId, targetIds),
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
    peerCompletion: new Map(peerCompletionRows.map(row => [
      row.target_id,
      { total: Number(row.total), completed: Number(row.completed) },
    ])),
    referenceRelationsByTarget,
  };
}

function completionSatisfied(value: { total: number; completed: number } | undefined): boolean {
  return !value || value.total === 0 || value.total === value.completed;
}

export function canEvaluateFromContext(
  relation: RelationRow,
  context: EvaluationReadContext
): { ok: boolean; reason?: string } {
  const scene = classifyEvaluationRelation(relation).evaluation_scene;
  if (scene === 'self' || scene === 'peer' || scene === 'upward') return { ok: true };

  if (relation.evaluator_level === 'manager' && relation.target_level === 'staff') {
    const selfRelation = context.selfRelationByTarget.get(relation.target_id);
    if (selfRelation?.status !== 'completed') {
      return { ok: false, reason: '员工正式提交自评后，部门负责人才能评价' };
    }
    if (!completionSatisfied(context.peerCompletion?.get(relation.target_id))) {
      return { ok: false, reason: '该员工收到的全部员工互评完成后，部门负责人才能评价' };
    }
    return { ok: true };
  }

  if (relation.evaluator_level === 'division_leader' || relation.evaluator_level === 'main_leader') {
    if (relation.target_level === 'manager') {
      const selfRelation = context.selfRelationByTarget.get(relation.target_id);
      if (selfRelation?.status !== 'completed') {
        return { ok: false, reason: '部门负责人正式提交自评后，领导才能评价' };
      }
      if (!completionSatisfied(context.peerCompletion?.get(relation.target_id))) {
        return { ok: false, reason: '该负责人收到的全部负责人互评完成后，领导才能评价' };
      }
      const completion = context.managerCompletion.get(relation.target_id);
      if (!completionSatisfied(completion)) {
        return { ok: false, reason: '部门负责人完成所负责部门的所有员工评分后，领导才能评价' };
      }
      return { ok: true };
    }

    if (relation.target_level === 'staff') {
      const selfRelation = context.selfRelationByTarget.get(relation.target_id);
      if (selfRelation?.status !== 'completed') {
        return { ok: false, reason: '该员工尚未完成自评' };
      }
      if (!completionSatisfied(context.peerCompletion?.get(relation.target_id))) {
        return { ok: false, reason: '该员工收到的全部员工互评尚未完成' };
      }
      const managerRelation = context.managerRelationByTarget.get(relation.target_id);
      if (managerRelation?.status !== 'completed') {
        return { ok: false, reason: '部门负责人完成该员工评分后，领导才能评价' };
      }
      const completion = context.managerCompletion.get(managerRelation.evaluator_id);
      if (!completionSatisfied(completion)) {
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
  const usableSelfRelation = selfRelation?.id === relation.id ? undefined : selfRelation;
  const usableManagerRelation = managerRelation?.id === relation.id ? undefined : managerRelation;
  const selfScores = usableSelfRelation ? context.answersByRelation.get(usableSelfRelation.id) || [] : [];
  const managerScores = usableManagerRelation ? context.answersByRelation.get(usableManagerRelation.id) || [] : [];
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
  const comprehensiveOnly = classifyEvaluationRelation(relation).answer_mode === 'comprehensive_detailed';
  const performanceQuestions = comprehensiveOnly
    ? []
    : exportRow.performance_questions.map(enrich);
  const comprehensiveQuestions = exportRow.comprehensive_questions.map(enrich);
  const references = (context.referenceRelationsByTarget?.get(relation.target_id) ?? [])
    .filter(source => source.id !== relation.id)
    .filter(source => {
      if (relation.evaluator_level === 'manager' && relation.target_level === 'staff') return source.eval_type === 'self';
      if (relation.evaluator_level === 'main_leader' || relation.evaluator_level === 'division_leader') {
        if (relation.target_level === 'staff') {
          return source.eval_type === 'self'
            || (source.eval_type === 'downward' && source.evaluator_level === 'manager');
        }
        return source.eval_type === 'self'
          || (source.eval_type === 'peer' && source.evaluator_level === 'manager');
      }
      return false;
    })
    .map<EvaluationReference>(source => {
      const sourceAnswers = context.answersByRelation.get(source.id) ?? [];
      const type: EvaluationReference['type'] = source.eval_type === 'self'
        ? 'self'
        : source.eval_type === 'peer' ? 'peer' : 'manager';
      return {
        type,
        source_relation_id: source.id,
        source_role: source.evaluator_level || source.role_type,
        status: 'completed',
        label: type === 'self'
          ? (source.target_level === 'manager' ? '负责人自评' : '员工自评')
          : type === 'peer' ? '负责人互评' : '主管评分',
        total: totalOfAnswers(sourceAnswers),
        scores: sourceAnswers
          .filter(answer => answer.is_total === 0 && answer.question_seq !== null)
          .map(answer => ({ question_seq: answer.question_seq!, score: Number(answer.score) })),
      };
    });

  return {
    ...exportRow,
    performance_questions: performanceQuestions,
    comprehensive_questions: comprehensiveQuestions,
    questions: comprehensiveOnly
      ? comprehensiveQuestions
      : [...performanceQuestions, ...comprehensiveQuestions],
    self_total: totalOfAnswers(selfScores),
    manager_total: totalOfAnswers(managerScores),
    references,
  };
}
