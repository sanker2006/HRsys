import assert from 'node:assert/strict';

if (process.env.ALLOW_AUTH_INTEGRATION_TEST !== 'true') {
  throw new Error('仅允许在隔离数据库中设置 ALLOW_AUTH_INTEGRATION_TEST=true 后执行');
}

const baseUrl = process.env.AUTH_TEST_BASE_URL || 'http://127.0.0.1:3010/api/v1';

async function request(
  path: string,
  options: { token?: string; method?: string; body?: unknown } = {}
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || (options.body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json() as any;
  return { status: response.status, payload };
}

const adminLogin = await request('/auth/login', {
  body: { account: 'admin', password: 'admin123' },
});
assert.equal(adminLogin.payload.code, 0);
const adminToken = adminLogin.payload.data.token;

const suffix = String(Date.now()).slice(-5);
const department = `认证测试部${suffix}`;
const departmentCreated = await request('/department/', {
  token: adminToken,
  body: { name: department, sort_order: 999 },
});
assert.equal(departmentCreated.payload.code, 0);

async function createUser(phone: string, employeeNo: string) {
  const result = await request('/user/', {
    token: adminToken,
    body: {
      name: `认证测试${employeeNo}`,
      employee_no: employeeNo,
      department,
      position: '测试岗位',
      level: 'staff',
      phone,
      id_card_tail: '9999',
      status: 'active',
    },
  });
  assert.equal(result.payload.code, 0, result.payload.message);
  return result.payload.data;
}

const limitedPhone = `138100${suffix}`.slice(0, 11);
const primaryPhone = `139100${suffix}`.slice(0, 11);
const changedPhone = `137100${suffix}`.slice(0, 11);
await createUser(limitedPhone, `LIMIT${suffix}`);
const primaryUser = await createUser(primaryPhone, `AUTH${suffix}`);

for (let attempt = 1; attempt <= 5; attempt += 1) {
  const failed = await request('/auth/h5-login', {
    body: { phone: limitedPhone, password: 'wrong-password' },
  });
  assert.equal(failed.payload.message, attempt === 5 ? '手机号或密码错误' : '手机号或密码错误');
  assert.equal(failed.status, attempt === 5 ? 429 : 401);
}
const locked = await request('/auth/h5-login', {
  body: { phone: limitedPhone, password: limitedPhone.slice(-4) },
});
assert.equal(locked.status, 429);

const initialLogin = await request('/auth/h5-login', {
  body: { phone: primaryPhone, password: primaryPhone.slice(-4) },
});
assert.equal(initialLogin.payload.code, 0);
assert.equal(initialLogin.payload.data.must_change_password, true);
const changeToken = initialLogin.payload.data.token;

const blockedBusiness = await request('/batch/?status=active', { token: changeToken });
assert.equal(blockedBusiness.status, 401);

const weakPassword = await request('/auth/change-password', {
  token: changeToken,
  body: { new_password: '12345678', confirm_password: '12345678' },
});
assert.notEqual(weakPassword.payload.code, 0);

const changed = await request('/auth/change-password', {
  token: changeToken,
  body: { new_password: 'NewPass123', confirm_password: 'NewPass123' },
});
assert.equal(changed.payload.code, 0, changed.payload.message);
assert.equal(changed.payload.data.must_change_password, false);
const fullToken = changed.payload.data.token;

const expiredChangeToken = await request('/auth/me', { token: changeToken });
assert.equal(expiredChangeToken.status, 401);
const me = await request('/auth/me', { token: fullToken });
assert.equal(me.payload.code, 0);
assert.equal(Object.hasOwn(me.payload.data, 'id_card_tail'), false);
assert.equal(Object.hasOwn(me.payload.data, 'password_version'), false);

const reset = await request(`/user/${primaryUser.id}/reset-password`, {
  token: adminToken,
  method: 'POST',
});
assert.equal(reset.payload.code, 0);
assert.equal((await request('/auth/me', { token: fullToken })).status, 401);

const tailUpdated = await request(`/user/${primaryUser.id}`, {
  token: adminToken,
  method: 'PUT',
  body: { id_card_tail: '1234' },
});
assert.equal(tailUpdated.payload.code, 0);
const loginAfterTailEdit = await request('/auth/h5-login', {
  body: { phone: primaryPhone, password: primaryPhone.slice(-4) },
});
assert.equal(loginAfterTailEdit.payload.code, 0);
assert.equal(loginAfterTailEdit.payload.data.must_change_password, true);

const changedAgain = await request('/auth/change-password', {
  token: loginAfterTailEdit.payload.data.token,
  body: { new_password: 'AnotherPass123', confirm_password: 'AnotherPass123' },
});
assert.equal(changedAgain.payload.code, 0);
const tokenBeforePhoneEdit = changedAgain.payload.data.token;

const phoneUpdated = await request(`/user/${primaryUser.id}`, {
  token: adminToken,
  method: 'PUT',
  body: { phone: changedPhone },
});
assert.equal(phoneUpdated.payload.code, 0, phoneUpdated.payload.message);
assert.equal((await request('/auth/me', { token: tokenBeforePhoneEdit })).status, 401);
const customPasswordPreserved = await request('/auth/h5-login', {
  body: { phone: changedPhone, password: 'AnotherPass123' },
});
assert.equal(customPasswordPreserved.payload.code, 0);
assert.equal(customPasswordPreserved.payload.data.must_change_password, false);

const duplicatePhone = await request('/user/', {
  token: adminToken,
  body: {
    name: '手机号重复测试',
    employee_no: `DUP${suffix}`,
    department,
    position: '测试岗位',
    level: 'staff',
    phone: changedPhone,
    id_card_tail: '5678',
    status: 'active',
  },
});
assert.notEqual(duplicatePhone.payload.code, 0);

console.log('H5 auth integration tests passed');
