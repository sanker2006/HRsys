import assert from 'node:assert/strict';
import { classifyEvaluationRelation } from '../service/evaluationScene.js';
import type { RelationRow } from '../model/relation.js';

function relation(overrides: Partial<RelationRow>): RelationRow {
  return {
    id: 1,
    batch_id: 1,
    evaluator_id: 10,
    target_id: 20,
    role_type: 'staff',
    eval_type: 'peer',
    status: 'pending',
    is_anonymous: 0,
    created_at: '',
    updated_at: '',
    evaluator_level: 'staff',
    target_level: 'staff',
    ...overrides,
  };
}

const staffPeer = classifyEvaluationRelation(relation({}));
assert.equal(staffPeer.evaluation_scene, 'peer');
assert.equal(staffPeer.requires_grade_preview, true);
assert.equal(staffPeer.grade_scale, 30);

const legacyUpward = classifyEvaluationRelation(relation({ target_level: 'manager' }));
assert.equal(legacyUpward.evaluation_scene, 'upward');
assert.equal(legacyUpward.display_label, '向上评价');
assert.equal(legacyUpward.answer_mode, 'comprehensive_detailed');
assert.equal(legacyUpward.requires_grade_preview, false);
assert.equal(legacyUpward.canonical_eval_type, 'upward');

const upward = classifyEvaluationRelation(relation({
  eval_type: 'upward',
  target_level: 'manager',
}));
assert.deepEqual(upward, legacyUpward);

const managerPeer = classifyEvaluationRelation(relation({
  role_type: 'manager',
  evaluator_level: 'manager',
  target_level: 'manager',
}));
assert.equal(managerPeer.evaluation_scene, 'peer');
assert.equal(managerPeer.requires_grade_preview, false);

const managerDownward = classifyEvaluationRelation(relation({
  role_type: 'manager',
  eval_type: 'downward',
  evaluator_level: 'manager',
  target_level: 'staff',
}));
assert.equal(managerDownward.evaluation_scene, 'downward');
assert.equal(managerDownward.requires_grade_preview, true);
assert.equal(managerDownward.grade_scale, 100);

const leaderDownward = classifyEvaluationRelation(relation({
  role_type: 'main_leader',
  eval_type: 'downward',
  evaluator_level: 'main_leader',
  target_level: 'manager',
}));
assert.equal(leaderDownward.answer_mode, 'leader_totals');
assert.equal(leaderDownward.requires_grade_preview, false);

console.log('evaluation scene tests passed');
