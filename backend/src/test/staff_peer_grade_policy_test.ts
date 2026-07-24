import assert from 'node:assert/strict';
import {
  inspectStaffPeerRelationGroups,
  normalizeStaffPeerGradePolicy,
  resolveStaffPeerGradePolicy,
} from '../service/staffPeerGradePolicy.js';

const twelveStaffRelations = Array.from({ length: 12 }, (_, evaluatorIndex) => (
  Array.from({ length: 12 }, (_, targetIndex) => targetIndex)
    .filter(targetIndex => targetIndex !== evaluatorIndex)
    .map(targetIndex => ({ evaluator_id: evaluatorIndex + 1, target_id: targetIndex + 1 }))
)).flat();
assert.deepEqual(inspectStaffPeerRelationGroups(twelveStaffRelations), {
  ok: true,
  staffCount: 12,
  evaluatorCount: 12,
  targetCount: 11,
});
const inconsistentRelations = twelveStaffRelations.filter(row => !(
  row.evaluator_id === 1 && row.target_id === 2
));
assert.equal(inspectStaffPeerRelationGroups(inconsistentRelations).ok, false);
assert.match(inspectStaffPeerRelationGroups(inconsistentRelations).reason || '', /人数不一致/);

const defaultPolicy = normalizeStaffPeerGradePolicy({ mode: 'default' }, 11);
assert.deepEqual(defaultPolicy.constraints.map(item => item.key), ['A', 'B', 'C', 'D', 'E']);
assert.equal(defaultPolicy.constraints.find(item => item.key === 'A')?.max, 2);
assert.equal(defaultPolicy.constraints.find(item => item.key === 'D')?.min, 3);

const custom = normalizeStaffPeerGradePolicy({
  mode: 'custom',
  constraints: [
    { grades: ['A', 'B'], min: 2, max: 2 },
    { grades: ['C', 'D'], min: 7, max: 7 },
    { grades: ['E'], min: 2, max: 2 },
  ],
}, 11);
assert.deepEqual(custom.constraints.map(item => item.key), ['AB', 'CD', 'E']);

const unrestricted = normalizeStaffPeerGradePolicy({ mode: 'unrestricted' }, 3);
assert.deepEqual(unrestricted.constraints, []);

const resolvedDefault = await resolveStaffPeerGradePolicy(
  { queryOne: async () => undefined },
  4,
  '测试部',
  3
);
assert.deepEqual(resolvedDefault.constraints.map(item => item.key), ['A']);

const resolvedCustom = await resolveStaffPeerGradePolicy(
  {
    queryOne: async () => ({
      id: 1,
      batch_id: 4,
      department: '测试部',
      target_count: 3,
      mode: 'custom' as const,
      constraints_json: JSON.stringify([
        { grades: ['A'], min: 0, max: 1 },
        { grades: ['B', 'C', 'D', 'E'], min: 2, max: 3 },
      ]),
      created_by: 1,
      created_at: '',
      updated_at: '',
    }),
  },
  4,
  '测试部',
  3
);
assert.deepEqual(resolvedCustom.constraints.map(item => item.key), ['A', 'BCDE']);

await assert.rejects(
  resolveStaffPeerGradePolicy(
    {
      queryOne: async () => ({
        id: 1,
        batch_id: 4,
        department: '测试部',
        target_count: 3,
        mode: 'unrestricted' as const,
        constraints_json: '[]',
        created_by: 1,
        created_at: '',
        updated_at: '',
      }),
    },
    4,
    '测试部',
    4
  ),
  (error: any) => error?.status === 409 && /人数已由 3 人变为 4 人/.test(error.message)
);

console.log('staff peer grade policy tests passed');
