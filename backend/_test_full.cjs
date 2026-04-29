const http = require('http');

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ hostname: 'localhost', port: 3000, path, method, headers }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  let token = '';
  let userId = 0;
  let passed = 0, failed = 0;
  const results = [];

  function check(label, res, expectCode, expectMessage) {
    const ok = res.code === expectCode && (!expectMessage || res.message === expectMessage);
    if (ok) { passed++; results.push(`✅ ${label}`); }
    else { failed++; results.push(`❌ ${label}: got code=${res.code} msg="${res.message}"`); }
  }

  // 1. Admin login
  const loginRes = await request('POST', '/api/v1/auth/login', { account: 'admin', password: 'admin123' });
  check('Admin login', loginRes, 0, '登录成功');
  token = loginRes.data?.token;

  // 2. Auth me
  const meRes = await request('GET', '/api/v1/auth/me', null, token);
  check('Auth me', meRes, 0, 'ok');

  // 3. Unauthorized access (no token)
  const noAuth = await request('GET', '/api/v1/user', null, null);
  check('No token → 401', noAuth, -1, '未登录或 token 已过期');

  // 4. Create user
  const createUser = await request('POST', '/api/v1/user', {
    name: '张三', employee_no: 'EMP001', department: '技术部',
    position: '前端开发', level: 'staff', phone: '13800138001', id_card_tail: '1234'
  }, token);
  check('Create user 张三', createUser, 0, '创建成功');
  userId = createUser.data?.id;

  // 5. Create duplicate employee_no
  const dupUser = await request('POST', '/api/v1/user', {
    name: '李四', employee_no: 'EMP001', department: '技术部',
    position: '后端开发', level: 'staff', phone: '13800138002', id_card_tail: '5678'
  }, token);
  check('Duplicate EMP001 → error', dupUser, -1);

  // 6. Create another user
  const create2 = await request('POST', '/api/v1/user', {
    name: '李四', employee_no: 'EMP002', department: '市场部',
    position: '市场经理', level: 'manager', phone: '13800138002', id_card_tail: '5678'
  }, token);
  check('Create user 李四', create2, 0, '创建成功');

  // 7. Create user missing fields
  const badCreate = await request('POST', '/api/v1/user', {
    name: '王五', employee_no: 'EMP003'
  }, token);
  check('Create missing fields → error', badCreate, -1, '缺少必填字段');

  // 8. Get user list
  const list = await request('GET', '/api/v1/user?page=1&pageSize=10', null, token);
  check('User list', list, 0, 'ok');
  console.log('   List total:', list.data?.total, 'items:', list.data?.list?.length);

  // 9. Filter by department
  const filterDept = await request('GET', '/api/v1/user?department=' + encodeURIComponent('技术部'), null, token);
  check('Filter by dept=技术部', filterDept, 0, 'ok');
  console.log('   技术部 count:', filterDept.data?.total);

  // 10. Filter by keyword
  const filterKw = await request('GET', '/api/v1/user?keyword=' + encodeURIComponent('张'), null, token);
  check('Filter keyword=张', filterKw, 0, 'ok');
  console.log('   keyword=张 count:', filterKw.data?.total);

  // 11. Get departments
  const depts = await request('GET', '/api/v1/user/departments', null, token);
  check('Get departments', depts, 0, 'ok');
  console.log('   Departments:', depts.data);

  // 12. Update user
  const updateRes = await request('PUT', `/api/v1/user/${userId}`, { position: '高级前端开发' }, token);
  check('Update user', updateRes, 0, '更新成功');

  // 13. Delete user
  const delRes = await request('DELETE', `/api/v1/user/${userId}`, null, token);
  check('Delete user', delRes, 0, '删除成功');

  // 14. Delete admin should fail
  const delAdmin = await request('DELETE', '/api/v1/user/1', null, token);
  check('Delete admin → error', delAdmin, -1, '不能删除管理员');

  // 15. Batch import
  const importRes = await request('POST', '/api/v1/user/import', {
    users: [
      { '姓名': '王五', '工号': 'EMP003', '部门': '人事部', '岗位': 'HR专员', '角色层级': 'staff', '手机号': '13800138003', '身份证号码后四位': '9012' },
      { '姓名': '赵六', '工号': 'EMP004', '部门': '技术部', '岗位': '后端开发', '角色层级': 'staff', '手机号': '13800138004', '身份证号码后四位': '3456' },
    ]
  }, token);
  check('Batch import 2 users', importRes, 0);
  console.log('   Import result:', JSON.stringify(importRes.data));

  // 16. H5 login (should fail - no such user)
  const h5Fail = await request('POST', '/api/v1/auth/h5-login', { phone: '13800138001', idCardTail: '0000' });
  check('H5 login wrong credentials', h5Fail, -1, '手机号或身份证后四位错误');

  // 17. H5 login with correct credentials (张三 was deleted, test with EMP003 王五)
  const h5Ok = await request('POST', '/api/v1/auth/h5-login', { phone: '13800138003', idCardTail: '9012' });
  check('H5 login 王五', h5Ok, 0, '登录成功');

  // Summary
  console.log('\n========== TEST RESULTS ==========');
  results.forEach(r => console.log(r));
  console.log(`\nTotal: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
}

run().catch(console.error);
