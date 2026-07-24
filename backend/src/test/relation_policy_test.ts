import assert from 'node:assert/strict';
import { buildDesiredRelations, type GenerationUser } from '../service/generateRelations.js';

const users: GenerationUser[] = [
  { id: 1, name: '负责人', employee_no: 'M1', department: '甲部', position: '', level: 'manager', managed_departments: ['甲部', '乙部'] },
  { id: 2, name: '甲员工', employee_no: 'S1', department: '甲部', position: '', level: 'staff', managed_departments: [] },
  { id: 3, name: '乙员工', employee_no: 'S2', department: '乙部', position: '', level: 'staff', managed_departments: [] },
  { id: 4, name: '其他负责人', employee_no: 'M2', department: '丙部', position: '', level: 'manager', managed_departments: ['丙部'] },
];
const batch = { id: 9, peer_cross_dept: 1 } as any;

const standard = buildDesiredRelations(batch, [], users, new Map([
  [1, 'standard_70_30'], [2, 'standard_70_30'], [3, 'standard_70_30'], [4, 'standard_70_30'],
]));
assert(standard.some(row => row.evaluator_id === 1 && row.target_id === 2 && row.eval_type === 'downward'));
assert(standard.some(row => row.evaluator_id === 1 && row.target_id === 3 && row.eval_type === 'downward'));
assert(standard.some(row => row.evaluator_id === 2 && row.target_id === 1 && row.eval_type === 'upward'));
assert(standard.some(row => row.evaluator_id === 3 && row.target_id === 1 && row.eval_type === 'upward'));

const performanceOnly = buildDesiredRelations(batch, [], users, new Map([
  [1, 'performance_only_100_0'], [2, 'standard_70_30'], [3, 'standard_70_30'], [4, 'standard_70_30'],
]));
assert(!performanceOnly.some(row => row.target_id === 1 && row.eval_type === 'upward'));
assert(performanceOnly.some(row => row.evaluator_id === 1 && row.target_id === 1 && row.eval_type === 'self'));
assert(performanceOnly.some(row => row.evaluator_id === 1 && row.target_id === 2 && row.eval_type === 'downward'));

console.log('relation policy tests passed');
