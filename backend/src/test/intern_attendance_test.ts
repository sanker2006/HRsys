import mysql from 'mysql2/promise';

const port = 31991;
const suffix = String(Date.now()).slice(-8);
const activePhone = `139${suffix}`;
const inactivePhone = `138${suffix}`;
const testDbName = `hrsys_intern_test_${Date.now()}`;
const mysqlAdminUrl = process.env.MYSQL_ADMIN_URL || 'mysql://root:root@127.0.0.1:13306/mysql';
process.env.PORT = String(port);
process.env.DATABASE_URL = `mysql://hrsys:hrsys@127.0.0.1:13306/${testDbName}`;

type ApiResult = { code: number; message?: string; data?: any; [key: string]: any };

const { closeDb, initDb } = await import('../db/index.js');
const app = (await import('../app.js')).default;

const adminPool = mysql.createPool({ uri: mysqlAdminUrl, connectionLimit: 1, multipleStatements: true });
await adminPool.query(`CREATE DATABASE \`${testDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await adminPool.query(`GRANT ALL PRIVILEGES ON \`${testDbName}\`.* TO 'hrsys'@'%'`);

await initDb();
const server = app.listen(port);
const base = `http://127.0.0.1:${port}/api/v1`;

async function request(path: string, options: { token?: string; method?: string; body?: any } = {}): Promise<ApiResult> {
  const res = await fetch(`${base}${path}`, {
    method: options.method || (options.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return await res.json() as ApiResult;
}

async function rawRequest(path: string, token?: string): Promise<Response> {
  return fetch(`${base}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function todayMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

try {
  const adminLogin = await request('/auth/login', { body: { account: 'admin', password: 'admin123' } });
  assert(adminLogin.code === 0 && adminLogin.data?.token, 'admin login failed');
  const adminToken = adminLogin.data.token;

  const createIntern = await request('/admin/interns', {
    token: adminToken,
    body: {
      intern_no: `IT${suffix}`,
      name: '测试实习生',
      phone: activePhone,
      id_card_tail: '1234',
      department: '测试部',
      position: '实习生',
      mentor: '管理员',
      start_date: `${todayMonth()}-01`,
      end_date: `${todayMonth()}-28`,
      status: 'active',
    },
  });
  assert(createIntern.code === 0, `create intern failed: ${createIntern.message}`);
  const internId = createIntern.data.id;

  const createInactiveIntern = await request('/admin/interns', {
    token: adminToken,
    body: {
      intern_no: `IX${suffix}`,
      name: '停用实习生',
      phone: inactivePhone,
      id_card_tail: '5678',
      department: '测试部',
      position: '实习生',
      mentor: '管理员',
      start_date: `${todayMonth()}-01`,
      end_date: `${todayMonth()}-28`,
      status: 'inactive',
    },
  });
  assert(createInactiveIntern.code === 0, `create inactive intern failed: ${createInactiveIntern.message}`);
  const inactiveLogin = await request('/intern-auth/login', { body: { phone: inactivePhone, idCardTail: '5678' } });
  assert(inactiveLogin.code !== 0, 'inactive intern should not login');

  const employeeLogin = await request('/auth/h5-login', { body: { phone: activePhone, idCardTail: '1234' } });
  assert(employeeLogin.code !== 0, 'intern account should not login to employee h5');

  const adminAsIntern = await request('/intern-auth/login', { body: { phone: '00000000000', idCardTail: '0000' } });
  assert(adminAsIntern.code !== 0, 'admin account should not login to intern h5');

  const internLogin = await request('/intern-auth/login', { body: { phone: activePhone, idCardTail: '1234' } });
  assert(internLogin.code === 0 && internLogin.data?.intern_token, 'intern login failed');
  const internToken = internLogin.data.intern_token;

  const noEvidence = await request('/intern/attendance/punch', { token: internToken, body: {} });
  assert(noEvidence.code !== 0, 'punch without gps/photo should fail');

  const largePhoto = `data:image/jpeg;base64,${Buffer.alloc(11 * 1024, 1).toString('base64')}`;
  const largePhotoPunch = await request('/intern/attendance/punch', { token: internToken, body: { photoBase64: largePhoto } });
  assert(largePhotoPunch.code !== 0, 'photo larger than 10KB should fail');

  const smallPhoto = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')}`;
  const photoPunch = await request('/intern/attendance/punch', { token: internToken, body: { photoBase64: smallPhoto } });
  assert(photoPunch.code === 0, `photo punch failed: ${photoPunch.message}`);
  const gpsPunch = await request('/intern/attendance/punch', {
    token: internToken,
    body: { latitude: 31.2304, longitude: 121.4737, accuracy: 12.5 },
  });
  assert(gpsPunch.code === 0, `gps punch failed: ${gpsPunch.message}`);

  let monthStats = await request(`/intern/attendance/month?month=${todayMonth()}`, { token: internToken });
  let day = monthStats.data.rows[0].days.find((item: any) => item.date === todayDate());
  assert(day.valid_count >= 2 && day.status === 'present', 'two valid punches should be present');

  const records = await request(`/admin/intern-attendance/records?month=${todayMonth()}`, { token: adminToken });
  assert(records.code === 0 && records.data.length >= 2, 'admin records should include punches');

  const reject = await request('/admin/intern-attendance/adjustments', {
    token: adminToken,
    body: { intern_id: internId, record_id: records.data[0].id, target_date: todayDate(), action: 'reject', reason: 'test reject' },
  });
  assert(reject.code === 0, `reject failed: ${reject.message}`);

  monthStats = await request(`/intern/attendance/month?month=${todayMonth()}`, { token: internToken });
  day = monthStats.data.rows[0].days.find((item: any) => item.date === todayDate());
  assert(day.valid_count === 1 && day.status === 'absent', 'rejected record should not count as valid punch');

  const makeup = await request('/admin/intern-attendance/adjustments', {
    token: adminToken,
    body: { intern_id: internId, target_date: todayDate(), action: 'makeup', reason: 'test makeup' },
  });
  assert(makeup.code === 0, `makeup failed: ${makeup.message}`);

  monthStats = await request(`/intern/attendance/month?month=${todayMonth()}`, { token: internToken });
  day = monthStats.data.rows[0].days.find((item: any) => item.date === todayDate());
  assert(day.valid_count === 2 && day.status === 'present', 'makeup should restore present status');

  const yearStats = await request(`/admin/intern-attendance/year-statistics?year=${todayMonth().slice(0, 4)}`, { token: adminToken });
  assert(yearStats.code === 0, `year statistics failed: ${yearStats.message}`);
  assert(yearStats.data.months.length === 12, 'year statistics should include 12 months');
  assert(yearStats.data.rows.some((row: any) => row.intern.id === internId), 'year statistics should include active intern row');

  const monthCalendarExport = await rawRequest(`/admin/intern-attendance/calendar-export?month=${todayMonth()}`, adminToken);
  assert(monthCalendarExport.ok, 'month calendar export should return 200');
  assert((monthCalendarExport.headers.get('content-type') || '').includes('spreadsheetml'), 'month calendar export should be xlsx');
  assert((await monthCalendarExport.arrayBuffer()).byteLength > 1000, 'month calendar export should not be empty');

  const yearExport = await rawRequest(`/admin/intern-attendance/year-export?year=${todayMonth().slice(0, 4)}`, adminToken);
  assert(yearExport.ok, 'year export should return 200');
  assert((yearExport.headers.get('content-type') || '').includes('spreadsheetml'), 'year export should be xlsx');
  assert((await yearExport.arrayBuffer()).byteLength > 1000, 'year export should not be empty');

  console.log('intern attendance integration test passed');
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await closeDb();
  await adminPool.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
  await adminPool.end();
}
