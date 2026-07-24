import assert from 'node:assert/strict';
import type { RelationRow } from '../model/relation.js';
import {
  findRevokeConsumers,
  validateEvaluationDependenciesFromRelations,
} from '../service/evaluationDependencies.js';

function relation(id: number, overrides: Partial<RelationRow>): RelationRow {
  return {
    id,
    batch_id: 1,
    evaluator_id: 1,
    target_id: 2,
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

const staffSelf = relation(1, {
  evaluator_id: 20,
  target_id: 20,
  eval_type: 'self',
  status: 'completed',
});
const incomingPeer = relation(2, {
  evaluator_id: 21,
  target_id: 20,
  eval_type: 'peer',
  status: 'completed',
});
const managerDown = relation(3, {
  evaluator_id: 10,
  target_id: 20,
  role_type: 'manager',
  eval_type: 'downward',
  evaluator_level: 'manager',
  status: 'pending',
});
assert.deepEqual(
  validateEvaluationDependenciesFromRelations(managerDown, [staffSelf, incomingPeer, managerDown]),
  { ok: true }
);
assert.equal(
  validateEvaluationDependenciesFromRelations(managerDown, [
    staffSelf,
    { ...incomingPeer, status: 'draft' },
    managerDown,
  ]).ok,
  false
);
assert.deepEqual(
  validateEvaluationDependenciesFromRelations(managerDown, [staffSelf, managerDown]),
  { ok: true }
);

const leaderToStaff = relation(4, {
  evaluator_id: 30,
  target_id: 20,
  role_type: 'main_leader',
  eval_type: 'downward',
  evaluator_level: 'main_leader',
  status: 'pending',
});
const managerOther = relation(5, {
  evaluator_id: 10,
  target_id: 22,
  role_type: 'manager',
  eval_type: 'downward',
  evaluator_level: 'manager',
  status: 'completed',
});
assert.deepEqual(
  validateEvaluationDependenciesFromRelations(
    leaderToStaff,
    [staffSelf, incomingPeer, { ...managerDown, status: 'completed' }, managerOther, leaderToStaff]
  ),
  { ok: true }
);
assert.equal(
  validateEvaluationDependenciesFromRelations(
    leaderToStaff,
    [staffSelf, incomingPeer, { ...managerDown, status: 'completed' }, { ...managerOther, status: 'draft' }, leaderToStaff]
  ).ok,
  false
);

const managerSelf = relation(6, {
  evaluator_id: 10,
  target_id: 10,
  role_type: 'manager',
  eval_type: 'self',
  evaluator_level: 'manager',
  target_level: 'manager',
  status: 'completed',
});
const managerPeer = relation(7, {
  evaluator_id: 11,
  target_id: 10,
  role_type: 'manager',
  eval_type: 'peer',
  evaluator_level: 'manager',
  target_level: 'manager',
  status: 'completed',
});
const leaderToManager = relation(8, {
  evaluator_id: 30,
  target_id: 10,
  role_type: 'main_leader',
  eval_type: 'downward',
  evaluator_level: 'main_leader',
  target_level: 'manager',
});
const upward = relation(9, {
  evaluator_id: 20,
  target_id: 10,
  role_type: 'staff',
  eval_type: 'upward',
  evaluator_level: 'staff',
  target_level: 'manager',
  status: 'completed',
});
assert.deepEqual(
  validateEvaluationDependenciesFromRelations(
    leaderToManager,
    [managerSelf, managerPeer, upward, { ...managerDown, status: 'completed' }, managerOther, leaderToManager]
  ),
  { ok: true }
);
assert.equal(
  validateEvaluationDependenciesFromRelations(
    leaderToManager,
    [managerSelf, { ...managerPeer, status: 'draft' }, { ...managerDown, status: 'completed' }, leaderToManager]
  ).ok,
  false
);
assert.equal(
  validateEvaluationDependenciesFromRelations(
    leaderToManager,
    [managerSelf, managerPeer, { ...upward, status: 'draft' }, { ...managerDown, status: 'completed' }, leaderToManager]
  ).ok,
  false
);

const revokeConsumers = await findRevokeConsumers(
  { queryAll: async () => [upward, { ...leaderToManager, status: 'completed' }] },
  upward
);
assert.deepEqual(revokeConsumers.map(row => row.id), [leaderToManager.id]);

console.log('evaluation dependency tests passed');
