import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { analyzeExistingUsers, classifyPasswordState } from '../tools/migrate-h5-password-auth.js';
import { sign, verify } from '../utils/jwt.js';
import { nextH5LoginFailureState } from '../service/h5LoginGuard.js';

const initialHash = bcrypt.hashSync('0004', 4);
const customHash = bcrypt.hashSync('Secure123', 4);
assert.equal(classifyPasswordState({
  id: 1, name: '用户甲', employee_no: 'A1', phone: '13810000004',
  password: initialHash, is_admin: 0,
} as any), 1);
assert.equal(classifyPasswordState({
  id: 2, name: '用户乙', employee_no: 'A2', phone: '13810000005',
  password: customHash, is_admin: 0,
} as any), 0);

const invalidPreflight = analyzeExistingUsers([
  {
    id: 4, name: '手机号异常', employee_no: 'A4', phone: '123',
    password: customHash, is_admin: 0,
  } as any,
  {
    id: 5, name: '手机号重复甲', employee_no: 'A5', phone: '13810000006',
    password: customHash, is_admin: 0,
  } as any,
  {
    id: 6, name: '手机号重复乙', employee_no: 'A6', phone: '13810000006',
    password: customHash, is_admin: 0,
  } as any,
]);
assert.equal(invalidPreflight.canApply, false);
assert.equal(invalidPreflight.invalidPhones[0].employee_no, 'A4');
assert.equal(invalidPreflight.duplicatePhones[0].users.length, 2);

let failureState: { failureCount: number; windowExpired: boolean; currentlyLocked: boolean } | undefined;
for (let attempt = 1; attempt <= 5; attempt += 1) {
  const next = nextH5LoginFailureState(failureState);
  assert.equal(next.failureCount, attempt);
  assert.equal(next.lockNow, attempt === 5);
  failureState = {
    failureCount: next.failureCount,
    windowExpired: false,
    currentlyLocked: next.lockNow,
  };
}
assert.equal(nextH5LoginFailureState({
  failureCount: 5,
  windowExpired: true,
  currentlyLocked: false,
}).failureCount, 1);
assert.equal(classifyPasswordState({
  id: 3, name: '管理员', employee_no: 'admin', phone: '00000000000',
  password: initialHash, is_admin: 1,
} as any), 0);

const token = sign({ userId: 1, isAdmin: 0, scope: 'password_change', passwordVersion: 3 }, '15m');
const payload = verify(token);
assert.equal(payload?.scope, 'password_change');
assert.equal(payload?.passwordVersion, 3);
assert.ok((payload?.exp || 0) - (payload?.iat || 0) <= 15 * 60);

console.log('H5 auth contract tests passed');
