import assert from 'node:assert/strict';
import { effectiveManagedDepartments } from '../model/user.js';

assert.deepEqual(effectiveManagedDepartments({
  level: 'manager',
  department: '综合部',
  managed_departments: ['综合部', '人才服务部', '综合部'],
}), ['综合部', '人才服务部']);

assert.deepEqual(effectiveManagedDepartments({
  level: 'manager',
  department: '综合部',
  managed_departments: [],
}), ['综合部']);

assert.deepEqual(effectiveManagedDepartments({
  level: 'division_leader',
  department: '领导层',
  managed_departments: ['综合部'],
}), ['综合部']);

assert.deepEqual(effectiveManagedDepartments({
  level: 'staff',
  department: '综合部',
  managed_departments: ['人才服务部'],
}), []);

console.log('managed department tests passed');
