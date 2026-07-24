import assert from 'node:assert/strict';
import {
  normalizeManagerGradePolicy,
  resolveManagerGradePolicy,
  validateManagerGradePolicy,
} from '../service/managerGradePolicy.js';

const publicWindow = normalizeManagerGradePolicy({
  mode: 'custom',
  constraints: [
    { grades: ['A'], min: 2, max: 2 },
    { grades: ['B'], min: 2, max: 2 },
    { grades: ['C', 'D'], min: 6, max: 6 },
    { grades: ['E'], min: 0, max: 0 },
  ],
}, 10);
assert.equal(publicWindow.mode, 'custom');
assert.deepEqual(publicWindow.constraints.map(item => item.key), ['A', 'B', 'CD', 'E']);
assert.deepEqual(validateManagerGradePolicy(publicWindow, 10), { ok: true });

const unrestricted = normalizeManagerGradePolicy({ mode: 'unrestricted', constraints: [] }, 1);
assert.deepEqual(unrestricted.constraints, []);
assert.deepEqual(validateManagerGradePolicy(unrestricted, 1), { ok: true });

assert.throws(
  () => normalizeManagerGradePolicy({
    mode: 'custom',
    constraints: [{ grades: ['A'], min: 2, max: 1 }],
  }, 6),
  /最少人数不能大于最多人数/
);
assert.throws(
  () => normalizeManagerGradePolicy({
    mode: 'custom',
    constraints: [
      { grades: ['A'], min: 2, max: 2 },
      { grades: ['B'], min: 2, max: 2 },
    ],
  }, 3),
  /不存在可行/
);
assert.throws(
  () => normalizeManagerGradePolicy({
    mode: 'custom',
    constraints: [
      { grades: ['A', 'B'], min: 1, max: 2 },
      { grades: ['B', 'C'], min: 1, max: 2 },
    ],
  }, 4),
  /B级不能同时属于多个约束/
);

const defaultResolved = await resolveManagerGradePolicy(
  { queryOne: async () => undefined },
  1,
  '测试部',
  4
);
assert.deepEqual(defaultResolved.constraints.map(item => item.key), ['AB', 'CD', 'E']);

const customResolved = await resolveManagerGradePolicy(
  {
    queryOne: async () => ({
      id: 1,
      batch_id: 1,
      department: '测试部',
      target_count: 4,
      mode: 'custom' as const,
      constraints_json: JSON.stringify([
        { grades: ['A', 'B'], min: 1, max: 1 },
        { grades: ['C', 'D'], min: 2, max: 2 },
        { grades: ['E'], min: 1, max: 1 },
      ]),
      created_by: 1,
      created_at: '',
      updated_at: '',
    }),
  },
  1,
  '测试部',
  4
);
assert.deepEqual(customResolved.constraints.map(item => item.key), ['AB', 'CD', 'E']);

await assert.rejects(
  resolveManagerGradePolicy(
    {
      queryOne: async () => ({
        id: 1,
        batch_id: 1,
        department: '测试部',
        target_count: 4,
        mode: 'unrestricted' as const,
        constraints_json: '[]',
        created_by: 1,
        created_at: '',
        updated_at: '',
      }),
    },
    1,
    '测试部',
    5
  ),
  (error: any) => error?.status === 409 && /人数已由 4 人变为 5 人/.test(error.message)
);

console.log('manager grade policy tests passed');
