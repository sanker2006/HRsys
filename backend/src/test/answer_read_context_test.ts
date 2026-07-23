import assert from 'node:assert/strict';
import {
  buildQuestionContextFromReadContext,
  canEvaluateFromContext,
  loadEvaluationReadContext,
  type EvaluationReadContext,
  type EvaluationReadDependencies,
} from '../service/answerReadContext.js';
import type { RelationRow } from '../model/relation.js';

function relation(overrides: Partial<RelationRow>): RelationRow {
  return {
    id: 1,
    batch_id: 9,
    evaluator_id: 10,
    target_id: 20,
    role_type: 'manager',
    eval_type: 'downward',
    status: 'pending',
    is_anonymous: 0,
    created_at: '',
    updated_at: '',
    evaluator_level: 'manager',
    target_level: 'staff',
    ...overrides,
  };
}

const managerDownward = relation({ status: 'completed' });
const selfRelation = relation({
  id: 2,
  evaluator_id: 20,
  target_id: 20,
  eval_type: 'self',
  evaluator_level: 'staff',
  target_level: 'staff',
  status: 'completed',
});
const context: EvaluationReadContext = {
  questionByTarget: new Map([[20, {
    batch_id: 9,
    user_id: 20,
    content_1: '业绩题',
    weight_1: 70,
    comp_content_1: '综合题',
    comp_weight_1: 30,
  } as any]]),
  selfRelationByTarget: new Map([[20, selfRelation]]),
  managerRelationByTarget: new Map([[20, managerDownward]]),
  answersByRelation: new Map([
    [2, [
      { relation_id: 2, question_seq: 1, score: 60, is_total: 0 } as any,
      { relation_id: 2, question_seq: null, score: 90, is_total: 1 } as any,
    ]],
    [1, [{ relation_id: 1, question_seq: null, score: 85, is_total: 1 } as any]],
  ]),
  managerCompletion: new Map([[10, { total: 1, completed: 1 }]]),
};

assert.deepEqual(canEvaluateFromContext(managerDownward, context), { ok: true });
const blockedContext = { ...context, selfRelationByTarget: new Map() };
assert.equal(canEvaluateFromContext(managerDownward, blockedContext).ok, false);

const leaderToStaff = relation({
  id: 3,
  evaluator_id: 30,
  evaluator_level: 'main_leader',
});
assert.deepEqual(canEvaluateFromContext(leaderToStaff, context), { ok: true });
assert.equal(
  canEvaluateFromContext(leaderToStaff, {
    ...context,
    managerCompletion: new Map([[10, { total: 2, completed: 1 }]]),
  }).ok,
  false
);

const questionContext = buildQuestionContextFromReadContext(managerDownward, context);
assert.equal(questionContext?.self_total, 90);
assert.equal(questionContext?.manager_total, 85);
assert.equal(questionContext?.performance_questions[0].self_score, 60);

async function assertFixedDependencyCalls(size: number) {
  const calls: string[] = [];
  const relations = Array.from({ length: size }, (_, index) => relation({
    id: 100 + index,
    target_id: 1000 + index,
  }));
  const dependencies: EvaluationReadDependencies = {
    async findQuestions() { calls.push('questions'); return []; },
    async findContextRelations() { calls.push('relations'); return []; },
    async findAnswers() { calls.push('answers'); return []; },
    async findManagerCompletion() { calls.push('completion'); return []; },
  };
  await loadEvaluationReadContext(relations, dependencies);
  assert.deepEqual(calls.sort(), ['answers', 'completion', 'questions', 'relations']);
}

await assertFixedDependencyCalls(1);
await assertFixedDependencyCalls(50);

console.log('answer read context tests passed');
