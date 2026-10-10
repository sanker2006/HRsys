import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { UserModel, type UserRow } from '../model/user.js';

const originalFind = UserModel.findByEmployeeNo;
const originalPhone = UserModel.findPhoneConflict;
const originalCreate = UserModel.create;
let writes = 0;
let heartbeat = false;
const item = {
  name: 'Import regression', employee_no: 'IMPORT_TEST', department: 'Test', position: 'Test',
  level: 'staff', phone: '13810000004', id_card_tail: '1234', password: '', source_row: 8,
};

try {
  UserModel.findByEmployeeNo = async () => ({ id: 1 } as UserRow);
  UserModel.create = async data => {
    writes += 1;
    return data as UserRow;
  };
  const started = performance.now();
  const duplicates = await UserModel.batchCreate(Array.from({ length: 65 }, (_, index) => ({ ...item, source_row: index + 2 })));
  assert.equal(duplicates.success, 0);
  assert.equal(duplicates.errors.length, 65);
  assert.equal(writes, 0);
  assert.ok(performance.now() - started < 1000, 'Existing users must not incur 65 password hashes');

  UserModel.findByEmployeeNo = async () => undefined;
  UserModel.findPhoneConflict = async () => undefined;
  UserModel.create = async data => {
    writes += 1;
    assert.ok(heartbeat, 'Hashing must yield to other requests');
    assert.ok(bcrypt.compareSync('0004', data.password));
    assert.equal(bcrypt.getRounds(data.password), 12);
    return data as UserRow;
  };
  const heartbeatTimer = setTimeout(() => { heartbeat = true; }, 0);
  const created = await UserModel.batchCreate([item]);
  clearTimeout(heartbeatTimer);
  assert.equal(created.success, 1);
  assert.equal(created.errors.length, 0);

  UserModel.findPhoneConflict = async () => ({ name: 'Existing' } as UserRow);
  const conflict = await UserModel.batchCreate([item]);
  assert.equal(conflict.success, 0);
  assert.equal(conflict.errors[0]?.row, 8);
  assert.equal(writes, 1);
  console.log('User import performance regression tests passed');
} finally {
  UserModel.findByEmployeeNo = originalFind;
  UserModel.findPhoneConflict = originalPhone;
  UserModel.create = originalCreate;
}
