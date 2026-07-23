import mysql from 'mysql2/promise';
import ExcelJS from 'exceljs';

const port = 31991;
const suffix = String(Date.now()).slice(-8);
const activePhone = `139${suffix}`;
const inactivePhone = `138${suffix}`;
const testDbName = `hrsys_intern_test_${Date.now()}`;
const mysqlAdminUrl = process.env.MYSQL_ADMIN_URL || 'mysql://root:root@127.0.0.1:13306/mysql';
const testDatabaseUrl = new URL(mysqlAdminUrl);
testDatabaseUrl.pathname = `/${testDbName}`;
process.env.PORT = String(port);
process.env.DATABASE_URL = testDatabaseUrl.toString();

type ApiResult = { code: number; message?: string; data?: any; [key: string]: any };

const { closeDb, initDb } = await import('../db/index.js');
const app = (await import('../app.js')).default;

const adminPool = mysql.createPool({ uri: mysqlAdminUrl, connectionLimit: 1, multipleStatements: true });
await adminPool.query(`CREATE DATABASE \`${testDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

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

function monthEnd() {
  const [year, month] = todayMonth().split('-').map(Number);
  return `${todayMonth()}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
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
      end_date: monthEnd(),
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
      end_date: monthEnd(),
      status: 'inactive',
    },
  });
  assert(createInactiveIntern.code === 0, `create inactive intern failed: ${createInactiveIntern.message}`);
  const inactiveLogin = await request('/intern-auth/login', { body: { phone: inactivePhone, idCardTail: '5678' } });
  assert(inactiveLogin.code !== 0, 'inactive intern should not login');

  const employeeLogin = await request('/auth/h5-login', { body: { phone: activePhone, password: '1234' } });
  assert(employeeLogin.code !== 0, 'intern account should not login to employee h5');

  const adminAsIntern = await request('/intern-auth/login', { body: { phone: '00000000000', idCardTail: '0000' } });
  assert(adminAsIntern.code !== 0, 'admin account should not login to intern h5');

  const internLogin = await request('/intern-auth/login', { body: { phone: activePhone, idCardTail: '1234' } });
  assert(internLogin.code === 0 && internLogin.data?.intern_token, 'intern login failed');
  const internToken = internLogin.data.intern_token;

  const noEvidence = await request('/intern/attendance/punch', { token: internToken, body: {} });
  assert(noEvidence.code !== 0, 'punch without gps/photo should fail');
  const nullGps = await request('/intern/attendance/punch', { token: internToken, body: { latitude: null, longitude: null } });
  assert(nullGps.code !== 0, 'null coordinates must not be treated as valid GPS');

  const largePhoto = `data:image/jpeg;base64,${Buffer.alloc(11 * 1024, 1).toString('base64')}`;
  const largePhotoPunch = await request('/intern/attendance/punch', { token: internToken, body: { photoBase64: largePhoto } });
  assert(largePhotoPunch.code !== 0, 'photo larger than 10KB should fail');

  const smallPhoto = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')}`;
  const photoPunch = await request('/intern/attendance/punch', { token: internToken, body: { photoBase64: smallPhoto } });
  assert(photoPunch.code === 0, `photo punch failed: ${photoPunch.message}`);
  assert(photoPunch.data?.has_photo === true, 'photo punch response should expose has_photo');
  assert(photoPunch.data?.evidence_type === 'photo', 'photo-only punch should not be labeled as GPS');
  assert(photoPunch.data?.photo_data === undefined, 'photo punch response should not expose photo_data');
  const gpsPunch = await request('/intern/attendance/punch', {
    token: internToken,
    body: { latitude: 31.2304, longitude: 121.4737, accuracy: 12.5 },
  });
  assert(gpsPunch.code === 0, `gps punch failed: ${gpsPunch.message}`);

  let monthStats = await request(`/intern/attendance/month?month=${todayMonth()}`, { token: internToken });
  let day = monthStats.data.rows[0].days.find((item: any) => item.date === todayDate());
  assert(day.valid_count >= 2 && day.status === 'present', 'two valid punches should be present');

  const records = await request(`/admin/intern-attendance/records?month=${todayMonth()}&page=1&pageSize=20`, { token: adminToken });
  assert(records.code === 0 && records.data.list.length >= 2, 'admin records should include paginated punches');
  assert(records.data.total >= 2 && records.data.range.start === `${todayMonth()}-01`, 'records should return total and normalized range');
  const photoRecord = records.data.list.find((row: any) => row.has_photo);
  const gpsOnlyRecord = records.data.list.find((row: any) => !row.has_photo);
  assert(photoRecord, 'admin records should identify photo punch');
  assert(gpsOnlyRecord, 'admin records should identify gps-only punch');
  assert(photoRecord.photo_data === undefined, 'admin records list should not expose photo_data');

  const unauthPhoto = await rawRequest(`/admin/intern-attendance/records/${photoRecord.id}/photo`);
  assert(unauthPhoto.status === 401, 'photo endpoint should require admin auth');

  const internPhoto = await rawRequest(`/admin/intern-attendance/records/${photoRecord.id}/photo`, internToken);
  assert(internPhoto.status === 403 || internPhoto.status === 401, 'photo endpoint should reject intern token');

  const photoResponse = await rawRequest(`/admin/intern-attendance/records/${photoRecord.id}/photo`, adminToken);
  assert(photoResponse.ok, 'admin photo endpoint should return 200');
  assert((photoResponse.headers.get('content-type') || '').includes('image/jpeg'), 'photo endpoint should return image mime');
  assert((photoResponse.headers.get('cache-control') || '').includes('no-store'), 'photo endpoint should disable cache');
  assert((await photoResponse.arrayBuffer()).byteLength === 4, 'photo endpoint should return original photo bytes');

  const noPhotoResponse = await rawRequest(`/admin/intern-attendance/records/${gpsOnlyRecord.id}/photo`, adminToken);
  assert(noPhotoResponse.status === 404, 'photo endpoint should return 404 for record without photo');

  const reject = await request('/admin/intern-attendance/adjustments', {
    token: adminToken,
    body: { intern_id: internId, record_id: photoRecord.id, target_date: todayDate(), action: 'reject', reason: 'test reject' },
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

  const restore = await request('/admin/intern-attendance/adjustments', {
    token: adminToken,
    body: { intern_id: internId, record_id: photoRecord.id, target_date: todayDate(), action: 'restore', reason: 'test restore' },
  });
  assert(restore.code === 0, `restore failed: ${restore.message}`);

  await adminPool.query(`UPDATE \`${testDbName}\`.intern_attendance_record SET punch_time = ? WHERE id = ?`, [`${todayDate()} 08:31:25`, photoRecord.id]);
  await adminPool.query(`UPDATE \`${testDbName}\`.intern_attendance_record SET punch_time = ? WHERE id = ?`, [`${todayDate()} 17:42:09`, gpsOnlyRecord.id]);

  const customStats = await request(
    `/admin/intern-attendance/statistics?start_date=${todayMonth()}-01&end_date=${monthEnd()}&keyword=${encodeURIComponent('测试实习生')}`,
    { token: adminToken }
  );
  assert(customStats.code === 0, `custom statistics failed: ${customStats.message}`);
  assert(customStats.data.range.mode === 'custom' && customStats.data.rows.length === 1, 'custom statistics should normalize range and keyword');
  const adminDay = customStats.data.rows[0].days.find((item: any) => item.date === todayDate());
  assert(adminDay.status === 'present' && adminDay.valid_count === 3, 'two restored punches plus makeup should be present');
  assert(customStats.data.rows[0].summary.absent_days === 0, 'zero-record days must not count as absence');
  assert(customStats.data.rows[0].summary.unrecorded_days > 0, 'zero-record days should be reported separately');

  const reversedRange = await request('/admin/intern-attendance/statistics?start_date=2026-07-10&end_date=2026-07-01', { token: adminToken });
  assert(reversedRange.code !== 0, 'reversed custom range should fail');
  const oversizedRange = await request('/admin/intern-attendance/statistics?start_date=2025-01-01&end_date=2026-01-02', { token: adminToken });
  assert(oversizedRange.code !== 0, 'custom range over 366 days should fail');

  const yearStats = await request(`/intern/attendance/year?year=${todayMonth().slice(0, 4)}`, { token: internToken });
  assert(yearStats.code === 0 && yearStats.data.months.length === 12, 'intern H5 year statistics should remain available');

  const exportResponse = await rawRequest(`/admin/intern-attendance/export?month=${todayMonth()}&keyword=${encodeURIComponent('测试实习生')}`, adminToken);
  assert(exportResponse.ok, 'attendance export should return 200');
  assert((exportResponse.headers.get('content-type') || '').includes('spreadsheetml'), 'attendance export should be xlsx');
  const exportBuffer = Buffer.from(await exportResponse.arrayBuffer());
  assert(exportBuffer.byteLength > 1000, 'attendance export should not be empty');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exportBuffer);
  const summarySheet = workbook.getWorksheet('出勤统计');
  const recordSheet = workbook.getWorksheet('原始打卡记录');
  assert(summarySheet && recordSheet, 'export should contain summary and raw record sheets');
  assert(summarySheet.views[0]?.xSplit === 6 && summarySheet.views[0]?.ySplit === 1, 'summary sheet should freeze header and first six columns');
  assert(!!summarySheet.autoFilter && !!recordSheet.autoFilter, 'both export sheets should enable filters');
  const expectedDayColumns = Number(monthEnd().slice(8));
  assert(summarySheet.columnCount === 6 + expectedDayColumns, 'summary sheet should include one column per selected day');
  const summaryRow = summarySheet.getRow(2);
  assert(summaryRow.getCell(2).value === createIntern.data.intern_no, 'summary sheet should contain filtered intern');
  assert(Number(summaryRow.getCell(5).value) === 1 && Number(summaryRow.getCell(6).value) === 0, 'summary totals should match daily status');
  const dayColumn = 6 + Number(todayDate().slice(8));
  const dayText = String(summaryRow.getCell(dayColumn).value || '');
  assert(dayText.includes('08:31:25') && dayText.includes('17:42:09') && dayText.includes('补卡×1'), 'daily cell should show earliest, latest and makeup');
  assert(recordSheet.rowCount >= 3, 'raw record sheet should contain both original punches');

  console.log('intern attendance integration test passed');
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await closeDb();
  await adminPool.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
  await adminPool.end();
}
