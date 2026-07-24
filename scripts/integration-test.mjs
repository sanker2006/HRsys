import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = resolve(root, 'backend');
const testDbName = `hrsys_test_${Date.now()}`;
const mysqlAdminUrl = process.env.MYSQL_ADMIN_URL || 'mysql://root:root@127.0.0.1:13306/mysql';
const testDatabaseUrl = new URL(mysqlAdminUrl);
testDatabaseUrl.pathname = `/${testDbName}`;
const databaseUrl = testDatabaseUrl.toString();
const port = Number(process.env.TEST_PORT || 43117);
const base = `http://127.0.0.1:${port}/api/v1`;

const adminPool = mysql.createPool({ uri: mysqlAdminUrl, connectionLimit: 1, multipleStatements: true });
await adminPool.query(`CREATE DATABASE \`${testDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
const testPool = mysql.createPool({ uri: databaseUrl, connectionLimit: 2 });

const server = spawn(process.execPath, ['dist/main.js'], {
  cwd: backendDir,
  env: {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: databaseUrl,
    CORS_ORIGINS: '*',
    NODE_ENV: 'test',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: 'admin', password: 'wrong' }),
      });
      if (res.status < 500) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`server did not start:\n${serverOutput}`);
}

async function request(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${method} ${path} returned non-json ${res.status}: ${text}`); }
  return { status: res.status, ...json };
}

async function ok(path, options) {
  const res = await request(path, options);
  assert.equal(res.code, 0, `${options?.method || 'GET'} ${path}: ${res.message}`);
  return res.data;
}

async function fail(path, options, expected) {
  const res = await request(path, options);
  assert.notEqual(res.code, 0, `${options?.method || 'GET'} ${path} should fail`);
  if (expected) assert.match(res.message, expected);
  return res;
}

async function uploadPersonalSummary(batchId, userId, token, content, fileName) {
  const form = new FormData();
  form.append('file', new Blob([content], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }), fileName);
  const res = await fetch(`${base}/personal-summary/admin/${batchId}/${userId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json();
  assert.equal(json.code, 0, `PUT personal summary: ${json.message}`);
  return json.data;
}

function user(name, no, dept, level, phone, tail, extra = {}) {
  return {
    name,
    employee_no: no,
    department: dept,
    position: level,
    level,
    phone,
    id_card_tail: tail,
    ...extra,
  };
}

function questionRow(name, no) {
  const row = {
    姓名: name,
    工号: no,
  };
  const performanceQuestions = [
    ['年度重点目标完成质量', 7.5],
    ['关键项目节点达成情况', 6.5],
    ['工作产出准确性与稳定性', 7],
    ['任务推进效率', 8],
    ['问题闭环与风险预警', 6],
    ['业务数据支撑与复盘', 7.5],
    ['制度流程执行情况', 6.5],
    ['跨岗位协作交付成效', 7],
    ['客户或内部服务响应质量', 7],
    ['持续改进成果', 7],
  ];
  const comprehensiveQuestions = [
    ['协作沟通', 6],
    ['责任意识', 5.5],
    ['学习改进', 6.5],
    ['主动担当', 6],
    ['价值观与纪律性', 6],
  ];
  performanceQuestions.forEach(([content, score], index) => {
    row[`业绩题${index + 1}`] = `${name}-${content}`;
    row[`业绩分值${index + 1}`] = score;
  });
  comprehensiveQuestions.forEach(([content, score], index) => {
    row[`综合题${index + 1}`] = `${name}-${content}`;
    row[`综合分值${index + 1}`] = score;
  });
  return row;
}

function performanceOnlyQuestionRow(name, no) {
  const row = { 姓名: name, 工号: no };
  for (let index = 0; index < 10; index++) {
    row[`业绩题${index + 1}`] = `${name}-业绩题${index + 1}`;
    row[`业绩分值${index + 1}`] = 10;
  }
  return row;
}

function fullScoreAnswers() {
  return [
    7.5, 6.5, 7, 8, 6, 7.5, 6.5, 7, 7, 7,
    6, 5.5, 6.5, 6, 6,
  ].map((score, index) => ({
    seq: index < 10 ? index + 1 : 100 + (index - 9),
    score,
  }));
}

function performanceOnlyAnswers() {
  return Array.from({ length: 10 }, (_, index) => ({ seq: index + 1, score: 10 }));
}

function peerAnswers(ratio = 0.9) {
  return [6, 5.5, 6.5, 6, 6].map((weight, index) => ({
    seq: 101 + index,
    score: Math.round(weight * ratio * 10) / 10,
  }));
}

function managerAnswers(total) {
  const ratio = total / 100;
  return fullScoreAnswers().map(answer => ({
    seq: answer.seq,
    score: Math.round(answer.score * ratio * 10) / 10,
  }));
}

function formatLocalDateTime(date) {
  const pad = value => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ' ' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join(':');
}

const h5Tokens = new Map();
async function h5Token(phone) {
  if (h5Tokens.has(phone)) return h5Tokens.get(phone);
  const login = await ok('/auth/h5-login', {
    method: 'POST',
    body: { phone, password: phone.slice(-4) },
  });
  let token = login.token;
  if (login.must_change_password) {
    const password = `Integration${phone.slice(-4)}A1`;
    const changed = await ok('/auth/change-password', {
      method: 'POST',
      token,
      body: { new_password: password, confirm_password: password },
    });
    token = changed.token;
  }
  h5Tokens.set(phone, token);
  return token;
}

async function previewAndGenerate(batchId, adminToken) {
  const preview = await ok(`/relation/generate/${batchId}/preview`, { method: 'POST', token: adminToken });
  const result = await ok(`/relation/generate/${batchId}`, {
    method: 'POST',
    token: adminToken,
    body: { preview_hash: preview.preview_hash },
  });
  return { preview, result };
}

async function main() {
  await waitForServer();

  const adminLogin = await ok('/auth/login', { method: 'POST', body: { account: 'admin', password: 'admin123' } });
  const adminToken = adminLogin.token;

  const users = [
    user('主领导', 'L001', '公司', 'main_leader', '13800000001', '0001'),
    user('分管A', 'D001', '公司', 'division_leader', '13800000002', '0002', { managed_departments: ['研发部'] }),
    user('研发主管', 'M001', '研发部', 'manager', '13800000003', '0003'),
    user('销售主管', 'M002', '销售部', 'manager', '13800000004', '0004'),
    user('研发员工1', 'S001', '研发部', 'staff', '13800000005', '0005'),
    user('研发员工2', 'S002', '研发部', 'staff', '13800000006', '0006'),
    user('研发员工3', 'S003', '研发部', 'staff', '13800000007', '0007'),
    user('销售员工1', 'S004', '销售部', 'staff', '13800000008', '0008'),
  ];
  for (const [name, sort_order] of [['公司', 0], ['研发部', 1], ['销售部', 2]]) {
    await ok('/department/', { method: 'POST', token: adminToken, body: { name, sort_order } });
  }
  for (const item of users) await ok('/user/', { method: 'POST', token: adminToken, body: item });
  const inactiveStaff = await ok('/user/', {
    method: 'POST',
    token: adminToken,
    body: user('inactive-staff', 'S999', '研发部', 'staff', '13800000019', '0019', { status: 'inactive' }),
  });
  assert.equal(inactiveStaff.status, 'inactive');
  const inactivePage = await ok('/user/?status=inactive&pageSize=100', { token: adminToken });
  assert.equal(inactivePage.list.some(u => u.employee_no === 'S999'), true);

  const paginationCreatedAt = '2026-01-01 00:00:00';
  const paginationUsers = Array.from({ length: 25 }, (_, index) => [
    `分页测试${index + 1}`,
    `PAG${String(index + 1).padStart(3, '0')}`,
    `1399000${String(index + 1).padStart(4, '0')}`,
  ]);
  for (const [name, employeeNo, phone] of paginationUsers) {
    await testPool.execute(
      `INSERT INTO app_user
        (name, employee_no, department, position, level, phone, id_card_tail, password, status, is_admin, created_at, updated_at)
       VALUES (?, ?, '研发部', '分页测试', 'staff', ?, '0000', 'not-used', 'active', 0, ?, ?)`,
      [name, employeeNo, phone, paginationCreatedAt, paginationCreatedAt]
    );
  }
  const paginationPages = await Promise.all([1, 2, 3].map(page =>
    ok(`/user/?keyword=PAG&page=${page}&pageSize=10`, { token: adminToken })
  ));
  const paginatedUsers = paginationPages.flatMap(result => result.list);
  assert.equal(paginationPages.every(result => result.total === 25), true);
  assert.equal(paginatedUsers.length, 25);
  assert.equal(new Set(paginatedUsers.map(user => user.id)).size, 25);
  assert.deepEqual(
    paginatedUsers.map(user => user.id),
    [...paginatedUsers.map(user => user.id)].sort((a, b) => b - a)
  );
  await testPool.execute("DELETE FROM app_user WHERE employee_no LIKE 'PAG%'");

  await fail('/auth/h5-login', {
    method: 'POST',
    body: { phone: '13800000019', password: '0019' },
  }, /停用/);
  await fail('/user/', {
    method: 'POST',
    token: adminToken,
    body: user('第二主领导', 'L002', '公司', 'main_leader', '13800000009', '0009'),
  }, /主要领导/);

  const now = new Date();
  const past = formatLocalDateTime(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const future = formatLocalDateTime(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const expired = formatLocalDateTime(new Date(now.getTime() - 60 * 60 * 1000));

  const batch = await ok('/batch/', {
    method: 'POST',
    token: adminToken,
    body: { name: 'V2规则集成测试批次', period: '2026', start_time: past, end_time: future, peer_cross_dept: 1 },
  });

  const badImport = await ok('/self-question/import', {
    method: 'POST',
    token: adminToken,
    body: { batch_id: batch.id, items: [{ 姓名: '不存在', 工号: 'NOPE', 业绩题1: 'x', 业绩分值1: 70, 综合题1: 'y', 综合分值1: 30 }] },
  });
  assert.equal(badImport.success, 0);
  assert.equal(badImport.failed, 1);
  assert.equal(badImport.errors[0].row, 2);

  const wrongTotal = questionRow('研发员工1', 'S001');
  wrongTotal.业绩分值10 = 6.9;
  const wrongTotalImport = await ok('/self-question/import', {
    method: 'POST',
    token: adminToken,
    body: { batch_id: batch.id, items: [wrongTotal] },
  });
  assert.equal(wrongTotalImport.success, 0);
  assert.equal(wrongTotalImport.failed, 1);
  assert.match(wrongTotalImport.errors[0].message, /业绩评价分值合计/);

  const missingQuestionGenerate = await fail(`/relation/generate/${batch.id}/preview`, { method: 'POST', token: adminToken }, /未录入题目/);
  assert(missingQuestionGenerate.data.missing_questions.length >= 6);
  assert.equal(missingQuestionGenerate.data.missing_questions.some(u => u.employee_no === 'S999'), false);
  const emptyRelationPage = await ok(`/relation/?batch_id=${batch.id}&pageSize=500`, { token: adminToken });
  assert.equal(emptyRelationPage.total, 0);

  const importRows = users
    .filter(u => ['manager', 'staff'].includes(u.level))
    .map(u => questionRow(u.name, u.employee_no));
  const importResult = await ok('/self-question/import', {
    method: 'POST',
    token: adminToken,
    body: { batch_id: batch.id, items: importRows },
  });
  assert.equal(importResult.success, 6);
  assert.equal(importResult.failed, 0);

  const { result: gen } = await previewAndGenerate(batch.id, adminToken);
  assert.equal(gen.self, 6);
  assert.equal(gen.peer, 8);
  assert.equal(gen.upward, 4);
  assert.equal(gen.downward, 14);
  await ok(`/batch/${batch.id}/start`, { method: 'POST', token: adminToken });

  const relationPage = await ok(`/relation/?batch_id=${batch.id}&pageSize=500`, { token: adminToken });
  const relations = relationPage.list;
  assert.equal(relations.filter(r => r.eval_type === 'self' && ['main_leader', 'division_leader'].includes(r.evaluator_level)).length, 0);
  assert.equal(relations.filter(r => r.evaluator_name === '分管A' && r.target_department === '销售部').length, 0);
  assert.equal(relations.filter(r => r.evaluator_name === '主领导' && r.eval_type === 'downward').length, 6);

  assert(relations.some(r => r.eval_type === 'upward' && r.evaluator_level === 'staff' && r.target_level === 'manager' && r.evaluator_department === r.target_department), 'staff to own manager upward relation exists');
  assert.equal(relations.some(r => r.eval_type === 'upward' && r.evaluator_level === 'staff' && r.target_level === 'manager' && r.evaluator_department !== r.target_department), false);

  const staff1Token = await h5Token('13800000005', '0005');
  const staff2Token = await h5Token('13800000006', '0006');
  const staff3Token = await h5Token('13800000007', '0007');
  const staff4Token = await h5Token('13800000008', '0008');
  const managerAToken = await h5Token('13800000003', '0003');
  const managerBToken = await h5Token('13800000004', '0004');
  const divisionToken = await h5Token('13800000002', '0002');
  const mainToken = await h5Token('13800000001', '0001');

  const staff1Relations = await ok(`/relation/my?batch_id=${batch.id}`, { token: staff1Token });
  const peerToStaff2 = staff1Relations.list.find(r => r.eval_type === 'peer' && r.target_name === '研发员工2');
  assert(peerToStaff2, 'staff peer relation exists');
  const upwardToOwnManager = staff1Relations.list.find(r => r.evaluation_scene === 'upward' && r.target_level === 'manager' && r.target_department === r.evaluator_department);
  assert(upwardToOwnManager, 'staff upward relation to own manager exists');

  const summaryBytes = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('[Content_Types].xml word/document.xml integration summary'),
  ]);
  const summaryName = '研发员工2-个人总结.docx';
  const uploadedSummary = await uploadPersonalSummary(
    batch.id, peerToStaff2.target_id, adminToken, summaryBytes, summaryName
  );
  assert.equal(uploadedSummary.original_name, summaryName);
  assert.equal(Number(uploadedSummary.file_size), summaryBytes.length);
  const summaryPage = await ok(`/personal-summary/admin/${batch.id}?upload_status=uploaded`, { token: adminToken });
  assert(summaryPage.list.some(row => row.user_id === peerToStaff2.target_id && row.has_summary));
  const peerDetail = await ok(`/answer/relation/${peerToStaff2.id}`, { token: staff1Token });
  assert.equal(peerDetail.personal_summary.original_name, summaryName);
  await fail(`/personal-summary/relation/${peerToStaff2.id}/download`, { token: staff2Token }, /无权/);
  const summaryDownload = await fetch(`${base}/personal-summary/relation/${peerToStaff2.id}/download`, {
    headers: { Authorization: `Bearer ${staff1Token}` },
  });
  assert.equal(summaryDownload.status, 200);
  assert.match(summaryDownload.headers.get('content-type') || '', /wordprocessingml/);
  assert.equal(summaryDownload.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await summaryDownload.arrayBuffer()), summaryBytes);

  await ok('/answer/detail', {
    method: 'POST',
    token: staff1Token,
    body: { relation_id: peerToStaff2.id, answers: peerAnswers(), draft: false },
  });
  await ok('/answer/detail', {
    method: 'POST',
    token: staff1Token,
    body: { relation_id: upwardToOwnManager.id, answers: peerAnswers(0.85), draft: false },
  });
  await fail('/answer/total', {
    method: 'POST',
    token: staff1Token,
    body: { relation_id: peerToStaff2.id, score: 30, draft: false },
  }, /不支持总分评价/);

  const expiredBatch = await ok('/batch/', {
    method: 'POST',
    token: adminToken,
    body: { name: '已过期批次规则测试', period: '2026', start_time: past, end_time: expired, peer_cross_dept: 0 },
  });
  assert.equal(expiredBatch.status, 'closed');
  await fail(`/batch/${expiredBatch.id}/start`, { method: 'POST', token: adminToken }, /已结束|结束时间/);

  const managerARels = await ok(`/relation/my?batch_id=${batch.id}`, { token: managerAToken });
  const mgrToS1 = managerARels.list.find(r => r.eval_type === 'downward' && r.target_name === '研发员工1');
  const lockedOverview = await ok(`/answer/downward/${batch.id}`, { token: managerAToken });
  const lockedS1 = lockedOverview.list.find(r => r.target_name === '研发员工1');
  assert.equal(lockedS1.can_submit, false);
  assert.match(lockedS1.blocked_reason, /自评/);

  await fail('/answer/detail', {
    method: 'POST',
    token: managerAToken,
    body: { relation_id: mgrToS1.id, answers: managerAnswers(90), draft: false },
  }, /自评/);

  for (const [token, name] of [
    [staff1Token, '研发员工1'],
    [staff2Token, '研发员工2'],
    [staff3Token, '研发员工3'],
    [staff4Token, '销售员工1'],
  ]) {
    const my = await ok(`/relation/my?batch_id=${batch.id}`, { token });
    const self = my.list.find(r => r.eval_type === 'self' && r.target_name === name);
    await ok('/answer/self', { method: 'POST', token, body: { relation_id: self.id, answers: fullScoreAnswers(), draft: false } });
  }

  const s1 = managerARels.list.find(r => r.eval_type === 'downward' && r.target_name === '研发员工1');
  const s2 = managerARels.list.find(r => r.eval_type === 'downward' && r.target_name === '研发员工2');
  const s3 = managerARels.list.find(r => r.eval_type === 'downward' && r.target_name === '研发员工3');
  const unlockedOverview = await ok(`/answer/downward/${batch.id}`, { token: managerAToken });
  const unlockedS1 = unlockedOverview.list.find(r => r.target_name === '研发员工1');
  assert.equal(unlockedS1.can_submit, true);
  assert.equal(unlockedOverview.quota.high, 0);
  await fail('/answer/total', {
    method: 'POST',
    token: managerAToken,
    body: { relation_id: s1.id, score: 90, draft: false },
  }, /不支持总分评价/);
  await ok('/answer/detail', { method: 'POST', token: managerAToken, body: { relation_id: s1.id, answers: managerAnswers(90), draft: true } });
  await ok('/answer/detail', { method: 'POST', token: managerAToken, body: { relation_id: s2.id, answers: managerAnswers(88), draft: true } });
  const draftOnlyOverview = await ok(`/answer/downward/${batch.id}`, { token: managerAToken });
  assert.equal(draftOnlyOverview.quota.high, 0);
  await ok('/answer/detail', { method: 'POST', token: managerAToken, body: { relation_id: s1.id, answers: managerAnswers(90), draft: false } });
  const afterSingleSubmit = await ok(`/answer/downward/${batch.id}`, { token: managerAToken });
  assert.equal(afterSingleSubmit.quota.high, 1);
  assert.equal(afterSingleSubmit.list.find(r => r.target_name === '研发员工1').status, 'completed');
  const earlyDivisionRels = await ok(`/relation/my?batch_id=${batch.id}`, { token: divisionToken });
  const earlyDivToManager = earlyDivisionRels.list.find(r => r.target_level === 'manager' && r.target_department === s1.target_department);
  const earlyDivToStaff = earlyDivisionRels.list.find(r => r.target_id === s1.target_id);
  await fail('/answer/detail', {
    method: 'POST',
    token: divisionToken,
    body: { relation_id: earlyDivToManager.id, answers: fullScoreAnswers(), draft: false },
  });
  await fail('/answer/total', {
    method: 'POST',
    token: divisionToken,
    body: { relation_id: earlyDivToStaff.id, score: 28.5, draft: false },
  });
  await fail('/answer/detail', {
    method: 'POST',
    token: managerAToken,
    body: { relation_id: s2.id, answers: managerAnswers(88), draft: false },
  }, /分档名额|分档比例/);
  await ok('/answer/detail', { method: 'POST', token: managerAToken, body: { relation_id: s2.id, answers: managerAnswers(75), draft: false } });
  await ok('/answer/detail', { method: 'POST', token: managerAToken, body: { relation_id: s3.id, answers: managerAnswers(65), draft: false } });

  const managerBRels = await ok(`/relation/my?batch_id=${batch.id}`, { token: managerBToken });
  const bToS4 = managerBRels.list.find(r => r.eval_type === 'downward' && r.target_name === '销售员工1');
  await ok('/answer/detail', { method: 'POST', token: managerBToken, body: { relation_id: bToS4.id, answers: managerAnswers(65), draft: false } });
  const bToManagerA = managerBRels.list.find(r => r.eval_type === 'peer' && r.target_name === '研发主管');
  assert(bToManagerA, 'cross-department manager peer relation exists');
  await ok('/answer/detail', {
    method: 'POST',
    token: managerBToken,
    body: { relation_id: bToManagerA.id, answers: peerAnswers(0.8), draft: false },
  });

  for (const [token, managerName] of [[managerAToken, '研发主管'], [managerBToken, '销售主管']]) {
    const my = await ok(`/relation/my?batch_id=${batch.id}`, { token });
    const self = my.list.find(r => r.eval_type === 'self' && r.target_name === managerName);
    await ok('/answer/self', { method: 'POST', token, body: { relation_id: self.id, answers: fullScoreAnswers(), draft: false } });
  }

  const divisionRels = await ok(`/relation/my?batch_id=${batch.id}`, { token: divisionToken });
  assert.equal(divisionRels.list.some(r => r.target_department === '销售部'), false);
  const divToManager = divisionRels.list.find(r => r.target_name === '研发主管');
  const divToStaff = divisionRels.list.find(r => r.target_name === '研发员工1');
  await ok('/answer/detail', { method: 'POST', token: divisionToken, body: { relation_id: divToManager.id, answers: fullScoreAnswers(), draft: false } });
  await ok('/answer/total', { method: 'POST', token: divisionToken, body: { relation_id: divToStaff.id, score: 28.5, draft: false } });
  await fail('/answer/total', { method: 'POST', token: divisionToken, body: { relation_id: divToStaff.id, score: 31, draft: false } }, /0~30/);
  await fail('/answer/import', {
    method: 'POST',
    token: divisionToken,
    body: { answers: [{ relation_id: divToStaff.id, score: 28.55, draft: false }] },
  }, /1 位小数/);

  const mainRels = await ok(`/relation/my?batch_id=${batch.id}`, { token: mainToken });
  assert.equal(mainRels.list.filter(r => r.eval_type === 'downward').length, 6);

  const adminProgress = await ok(`/answer/admin/progress/${batch.id}`, { token: adminToken });
  for (const section of [adminProgress.self, adminProgress.peer, adminProgress.downward]) {
    assert.equal(section.list.every(row => Number.isInteger(row.evaluator_id) && Number.isInteger(row.target_id)), true);
  }
  assert.equal(adminProgress.self.stats.completed, 6);
  assert(adminProgress.downward.stats.completed >= 6);

  const unchangedImport = await ok('/self-question/import', {
    method: 'POST',
    token: adminToken,
    body: { batch_id: batch.id, items: [questionRow('研发员工1', 'S001')] },
  });
  assert.equal(unchangedImport.success, 0);
  assert.equal(unchangedImport.unchanged, 1);

  const lockedQuestion = questionRow('研发员工1', 'S001');
  lockedQuestion.综合题1 = '试图修改已经产生答案的题目';
  const lockedImport = await ok('/self-question/import', {
    method: 'POST',
    token: adminToken,
    body: { batch_id: batch.id, items: [lockedQuestion] },
  });
  assert.equal(lockedImport.success, 0);
  assert.equal(lockedImport.locked, 1);
  assert.equal(lockedImport.failed, 1);

  const identityOnlyImport = await ok('/self-question/import', {
    method: 'POST',
    token: adminToken,
    body: { batch_id: batch.id, items: [{ 姓名: '研发员工1', 工号: 'S001' }] },
  });
  assert.equal(identityOnlyImport.skipped_no_questions, 1);
  assert.equal(identityOnlyImport.failed, 0);

  await fail(`/self-question/${batch.id}`, { method: 'DELETE', token: adminToken }, /草稿批次|评价答案/);
  await fail(`/relation/${bToManagerA.id}`, { method: 'DELETE', token: adminToken }, /不能删除/);

  const [oldRelationSnapshot] = await testPool.query(
    'SELECT id, evaluator_id, target_id, eval_type, status FROM relation WHERE batch_id = ? ORDER BY id',
    [batch.id]
  );
  const [oldAnswerSnapshot] = await testPool.query(
    `SELECT a.id, a.relation_id, a.question_seq, a.score, a.is_total, a.is_draft
       FROM answer a JOIN relation r ON r.id = a.relation_id
      WHERE r.batch_id = ? ORDER BY a.id`,
    [batch.id]
  );
  const [oldQuestionSnapshot] = await testPool.query(
    'SELECT * FROM self_question WHERE batch_id = ? ORDER BY id',
    [batch.id]
  );
  const statisticsBeforeAddition = await ok(`/answer/admin/statistics/${batch.id}`, { token: adminToken });
  const managerScoreBefore = statisticsBeforeAddition.rows.find(row => row.employee_no === 'M001').comprehensive_manager_peer_score;

  const historicalBatch = await ok('/batch/', {
    method: 'POST',
    token: adminToken,
    body: { name: '历史参与人员快照测试', period: '2026', start_time: past, end_time: future, peer_cross_dept: 0 },
  });
  await ok('/self-question/import', {
    method: 'POST', token: adminToken, body: { batch_id: historicalBatch.id, items: importRows },
  });
  await previewAndGenerate(historicalBatch.id, adminToken);
  await ok(`/batch/${historicalBatch.id}/close`, { method: 'POST', token: adminToken });
  await fail(`/relation/generate/${historicalBatch.id}/preview`, { method: 'POST', token: adminToken }, /结束|过期/);

  await ok('/department/', { method: 'POST', token: adminToken, body: { name: '运营部', sort_order: 3 } });
  const newManager = await ok('/user/', {
    method: 'POST', token: adminToken,
    body: user('运营主管', 'M003', '运营部', 'manager', '13800000010', '0010'),
  });
  const newStaff1 = await ok('/user/', {
    method: 'POST', token: adminToken,
    body: user('运营员工1', 'S005', '运营部', 'staff', '13800000011', '0011'),
  });
  const newStaff2 = await ok('/user/', {
    method: 'POST', token: adminToken,
    body: user('运营员工2', 'S006', '运营部', 'staff', '13800000012', '0012'),
  });
  const incrementalQuestions = await ok('/self-question/import', {
    method: 'POST',
    token: adminToken,
    body: {
      batch_id: batch.id,
      items: [
        questionRow('运营主管', 'M003'),
        questionRow('运营员工1', 'S005'),
        questionRow('运营员工2', 'S006'),
      ],
    },
  });
  assert.equal(incrementalQuestions.success, 3);

  const stalePreview = await ok(`/relation/generate/${batch.id}/preview`, { method: 'POST', token: adminToken });
  assert.equal(stalePreview.new_participants.length, 3);
  assert(stalePreview.new_relations.total > 0);
  assert(stalePreview.existing_evaluators_with_new_tasks.some(item => item.employee_no === 'L001'));
  assert(stalePreview.score_affected_users.some(item => item.employee_no === 'M001'));

  await ok('/department/', { method: 'POST', token: adminToken, body: { name: '临时部门', sort_order: 99 } });
  await ok(`/user/${newStaff2.id}`, {
    method: 'PUT', token: adminToken, body: { department: '临时部门' },
  });
  await fail(`/relation/generate/${batch.id}`, {
    method: 'POST', token: adminToken, body: { preview_hash: stalePreview.preview_hash },
  }, /发生变化|重新预览/);
  await ok(`/user/${newStaff2.id}`, {
    method: 'PUT', token: adminToken, body: { department: '运营部' },
  });

  const incrementalPreview = await ok(`/relation/generate/${batch.id}/preview`, { method: 'POST', token: adminToken });
  const concurrentGenerate = await Promise.all([
    request(`/relation/generate/${batch.id}`, {
      method: 'POST', token: adminToken, body: { preview_hash: incrementalPreview.preview_hash },
    }),
    request(`/relation/generate/${batch.id}`, {
      method: 'POST', token: adminToken, body: { preview_hash: incrementalPreview.preview_hash },
    }),
  ]);
  assert.equal(concurrentGenerate.filter(result => result.code === 0).length, 1);
  assert.equal(concurrentGenerate.filter(result => result.code !== 0).length, 1);

  const oldRelationIds = new Set(oldRelationSnapshot.map(row => row.id));
  const oldAnswerIds = new Set(oldAnswerSnapshot.map(row => row.id));
  const oldQuestionIds = new Set(oldQuestionSnapshot.map(row => row.id));
  const [relationsAfterAddition] = await testPool.query(
    'SELECT id, evaluator_id, target_id, eval_type, status FROM relation WHERE batch_id = ? ORDER BY id',
    [batch.id]
  );
  const [answersAfterAddition] = await testPool.query(
    `SELECT a.id, a.relation_id, a.question_seq, a.score, a.is_total, a.is_draft
       FROM answer a JOIN relation r ON r.id = a.relation_id
      WHERE r.batch_id = ? ORDER BY a.id`,
    [batch.id]
  );
  const [questionsAfterAddition] = await testPool.query(
    'SELECT * FROM self_question WHERE batch_id = ? ORDER BY id',
    [batch.id]
  );
  assert.deepEqual(relationsAfterAddition.filter(row => oldRelationIds.has(row.id)), oldRelationSnapshot);
  assert.deepEqual(answersAfterAddition.filter(row => oldAnswerIds.has(row.id)), oldAnswerSnapshot);
  assert.deepEqual(questionsAfterAddition.filter(row => oldQuestionIds.has(row.id)), oldQuestionSnapshot);

  const repeatedPreview = await ok(`/relation/generate/${batch.id}/preview`, { method: 'POST', token: adminToken });
  assert.equal(repeatedPreview.new_relations.total, 0);
  const repeatedGenerate = await ok(`/relation/generate/${batch.id}`, {
    method: 'POST', token: adminToken, body: { preview_hash: repeatedPreview.preview_hash },
  });
  assert.equal(repeatedGenerate.total, 0);
  const [duplicateRelations] = await testPool.query(
    `SELECT batch_id, evaluator_id, target_id, eval_type, COUNT(*) AS total
       FROM relation WHERE batch_id = ?
      GROUP BY batch_id, evaluator_id, target_id, eval_type
     HAVING COUNT(*) > 1`,
    [batch.id]
  );
  assert.equal(duplicateRelations.length, 0);
  const [generationLogs] = await testPool.query(
    `SELECT id, detail FROM log
      WHERE user_id = ? AND action = 'relation.incremental_generate' AND detail LIKE ?`,
    [adminLogin.user.id, `%\"batch_id\":${batch.id}%`]
  );
  assert(generationLogs.length >= 2, 'incremental generation is written to the audit log');

  const statisticsAfterGeneration = await ok(`/answer/admin/statistics/${batch.id}`, { token: adminToken });
  assert.equal(
    statisticsAfterGeneration.rows.find(row => row.employee_no === 'M001').comprehensive_manager_peer_score,
    managerScoreBefore
  );
  assert(statisticsAfterGeneration.rows.some(row => row.employee_no === 'M003'));

  const newManagerToken = await h5Token('13800000010', '0010');
  const newManagerRelations = await ok(`/relation/my?batch_id=${batch.id}`, { token: newManagerToken });
  const newManagerToOldManager = newManagerRelations.list.find(
    relation => relation.eval_type === 'peer' && relation.target_name === '研发主管'
  );
  assert(newManagerToOldManager, 'new manager can evaluate an existing manager according to the full matrix');
  await ok('/answer/detail', {
    method: 'POST',
    token: newManagerToken,
    body: { relation_id: newManagerToOldManager.id, answers: peerAnswers(0.6), draft: false },
  });
  const statisticsAfterNewScore = await ok(`/answer/admin/statistics/${batch.id}`, { token: adminToken });
  assert.notEqual(
    statisticsAfterNewScore.rows.find(row => row.employee_no === 'M001').comprehensive_manager_peer_score,
    managerScoreBefore
  );

  const activeQuestionParticipants = statisticsAfterNewScore.rows.map(row => row.employee_no);
  assert(activeQuestionParticipants.includes(newManager.employee_no));
  assert(activeQuestionParticipants.includes(newStaff1.employee_no));
  const historicalStatistics = await ok(`/answer/admin/statistics/${historicalBatch.id}`, { token: adminToken });
  assert.equal(historicalStatistics.rows.some(row => row.employee_no === 'M003'), false);

  const expiringBatch = await ok('/batch/', {
    method: 'POST',
    token: adminToken,
    body: { name: '提交过期拦截测试批次', period: '2026', start_time: past, end_time: future, peer_cross_dept: 0 },
  });
  await ok('/self-question/import', {
    method: 'POST',
    token: adminToken,
    body: {
      batch_id: expiringBatch.id,
      items: [
        ...importRows,
        questionRow('运营主管', 'M003'),
        questionRow('运营员工1', 'S005'),
        questionRow('运营员工2', 'S006'),
      ],
    },
  });
  await previewAndGenerate(expiringBatch.id, adminToken);
  await ok(`/batch/${expiringBatch.id}/start`, { method: 'POST', token: adminToken });
  const expiringRelations = await ok(`/relation/my?batch_id=${expiringBatch.id}`, { token: staff1Token });
  const expiredSelf = expiringRelations.list.find(r => r.eval_type === 'self' && r.target_name === '研发员工1');
  await ok(`/batch/${expiringBatch.id}`, {
    method: 'PUT',
    token: adminToken,
    body: { end_time: expired },
  });
  await fail('/answer/self', {
    method: 'POST',
    token: staff1Token,
    body: { relation_id: expiredSelf.id, answers: fullScoreAnswers(), draft: false },
  }, /已结束|结束时间/);

  await ok('/department/', { method: 'POST', token: adminToken, body: { name: '客户部', sort_order: 4 } });
  const multiDepartmentStaff = await ok('/user/', {
    method: 'POST', token: adminToken,
    body: user('客户员工1', 'S007', '客户部', 'staff', '13800000014', '0014'),
  });
  const updatedManager = await ok(`/user/${newManager.id}`, {
    method: 'PUT', token: adminToken,
    body: { managed_departments: ['运营部', '客户部'] },
  });
  assert.deepEqual(updatedManager.managed_departments, ['客户部', '运营部']);
  await fail('/user/', {
    method: 'POST', token: adminToken,
    body: user('冲突主管', 'M005', '临时部门', 'manager', '13800000015', '0015', { managed_departments: ['客户部'] }),
  }, /客户部.*运营主管/);

  const flexibleImport = await ok('/self-question/import', {
    method: 'POST', token: adminToken,
    body: {
      batch_id: batch.id,
      items: [
        performanceOnlyQuestionRow('运营主管', 'M003'),
        { ...questionRow('客户员工1', 'S007'), ' 题目状态 ': '未录入' },
      ],
    },
  });
  assert.equal(flexibleImport.success, 2);
  const flexibleQuestions = await ok(`/self-question/${batch.id}`, { token: adminToken });
  const managerQuestions = flexibleQuestions.find(row => row.employee_no === 'M003');
  assert.equal(managerQuestions.score_mode, 'performance_only_100_0');
  assert.equal(managerQuestions.performance_total, 100);
  assert.equal(managerQuestions.comprehensive_total, 0);

  const flexiblePreview = await ok(`/relation/generate/${batch.id}/preview`, { method: 'POST', token: adminToken });
  assert(flexiblePreview.inapplicable_pending_relations > 0);
  const flexibleGeneration = await ok(`/relation/generate/${batch.id}`, {
    method: 'POST', token: adminToken, body: { preview_hash: flexiblePreview.preview_hash },
  });
  assert.equal(flexibleGeneration.removed_inapplicable, flexiblePreview.inapplicable_pending_relations);

  const multiStaffToken = await h5Token('13800000014', '0014');
  const multiStaffRelations = await ok(`/relation/my?batch_id=${batch.id}`, { token: multiStaffToken });
  assert.equal(multiStaffRelations.list.some(row => row.evaluation_scene === 'upward' && row.target_id === newManager.id), false);
  const managerRelationsAfterScope = await ok(`/relation/my?batch_id=${batch.id}`, { token: newManagerToken });
  assert(
    managerRelationsAfterScope.list.some(row => row.eval_type === 'downward' && row.target_id === multiDepartmentStaff.id),
    'manager evaluates staff in the second managed department'
  );

  const managerSelf = managerRelationsAfterScope.list.find(row => row.eval_type === 'self');
  const managerSelfDetail = await ok(`/answer/relation/${managerSelf.id}`, { token: newManagerToken });
  assert.equal(managerSelfDetail.performance_questions.length, 10);
  assert.equal(managerSelfDetail.comprehensive_questions.length, 0);

  for (const [token, employeeNo] of [
    [await h5Token('13800000011', '0011'), 'S005'],
    [await h5Token('13800000012', '0012'), 'S006'],
    [multiStaffToken, 'S007'],
  ]) {
    const my = await ok(`/relation/my?batch_id=${batch.id}`, { token });
    const self = my.list.find(row => row.eval_type === 'self' && row.evaluator_id === row.target_id);
    assert(self, `${employeeNo} self relation exists`);
    await ok('/answer/self', { method: 'POST', token, body: { relation_id: self.id, answers: fullScoreAnswers(), draft: false } });
  }
  await ok('/answer/self', {
    method: 'POST', token: newManagerToken,
    body: { relation_id: managerSelf.id, answers: performanceOnlyAnswers(), draft: false },
  });

  const refreshedManagerRelations = await ok(`/relation/my?batch_id=${batch.id}`, { token: newManagerToken });
  const managedStaffScores = new Map([['运营员工1', 90], ['运营员工2', 75], ['客户员工1', 65]]);
  for (const relation of refreshedManagerRelations.list.filter(row => row.eval_type === 'downward' && row.target_level === 'staff')) {
    await ok('/answer/detail', {
      method: 'POST', token: newManagerToken,
      body: { relation_id: relation.id, answers: managerAnswers(managedStaffScores.get(relation.target_name)), draft: false },
    });
  }
  const mainRelationsAfterScope = await ok(`/relation/my?batch_id=${batch.id}`, { token: mainToken });
  const mainToPerformanceOnlyManager = mainRelationsAfterScope.list.find(row => row.eval_type === 'downward' && row.target_id === newManager.id);
  await ok('/answer/detail', {
    method: 'POST', token: mainToken,
    body: { relation_id: mainToPerformanceOnlyManager.id, answers: performanceOnlyAnswers(), draft: false },
  });
  const flexibleStatistics = await ok(`/answer/admin/statistics/${batch.id}`, { token: adminToken });
  const flexibleManagerStatistics = flexibleStatistics.rows.find(row => row.employee_no === 'M003');
  assert.equal(flexibleManagerStatistics.final_score, 100);
  assert.equal(flexibleManagerStatistics.comprehensive_score, null);
  assert.equal(flexibleManagerStatistics.missing_items.some(item => item.startsWith('综合')), false);

  const summaryOnlyManager = await ok('/user/', {
    method: 'POST',
    token: adminToken,
    body: user('总结测试主管', 'M004', '临时部门', 'manager', '13800000013', '0013'),
  });
  const activeSummaryRoster = await ok(`/personal-summary/admin/${batch.id}?pageSize=100`, { token: adminToken });
  assert(
    activeSummaryRoster.list.some(row => row.user_id === summaryOnlyManager.id),
    'active manager without questions or relations is included in the open-batch summary roster'
  );
  const closedSummaryRoster = await ok(`/personal-summary/admin/${historicalBatch.id}?pageSize=100`, { token: adminToken });
  assert.equal(
    closedSummaryRoster.list.some(row => row.user_id === summaryOnlyManager.id),
    false,
    'manager added later is not included in a closed historical batch'
  );

  const pressureTokens = [staff1Token, staff2Token, staff3Token, staff4Token, managerAToken, managerBToken, divisionToken, mainToken];
  const started = performance.now();
  const totalRequests = 300;
  const concurrency = 30;
  let okCount = 0;
  let maxLatency = 0;
  const latencies = [];
  let cursor = 0;
  async function worker() {
    while (cursor < totalRequests) {
      const index = cursor++;
      const token = pressureTokens[index % pressureTokens.length];
      const t0 = performance.now();
      const res = await request(`/relation/my?batch_id=${batch.id}`, { token });
      const ms = performance.now() - t0;
      latencies.push(ms);
      maxLatency = Math.max(maxLatency, ms);
      if (res.code === 0) okCount++;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsed = performance.now() - started;
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)];

  assert.equal(okCount, totalRequests);

  const writeStarted = performance.now();
  const writeRequests = 80;
  const writeConcurrency = 10;
  let writeOk = 0;
  const writeLatencies = [];
  let writeCursor = 0;
  async function writeWorker() {
    while (writeCursor < writeRequests) {
      const index = writeCursor++;
      const t0 = performance.now();
      const res = await request('/answer/detail', {
        method: 'POST',
        token: staff1Token,
        body: {
          relation_id: peerToStaff2.id,
          draft: true,
          answers: peerAnswers(0.7 + (index % 3) * 0.1),
        },
      });
      writeLatencies.push(performance.now() - t0);
      if (res.code === 0) writeOk++;
    }
  }
  await Promise.all(Array.from({ length: writeConcurrency }, writeWorker));
  const writeElapsed = performance.now() - writeStarted;
  writeLatencies.sort((a, b) => a - b);
  const writeP95 = writeLatencies[Math.floor(writeLatencies.length * 0.95)];
  assert.equal(writeOk, writeRequests);

  console.log(JSON.stringify({
    passed: true,
    database: testDbName,
    assertions: {
      users: users.length,
      relations: relations.length,
      selfCompleted: adminProgress.self.stats.completed,
      downwardCompleted: adminProgress.downward.stats.completed,
    },
    pressure: {
      totalRequests,
      concurrency,
      elapsedMs: Math.round(elapsed),
      rps: Math.round((totalRequests / elapsed) * 1000),
      p95Ms: Math.round(p95),
      maxLatencyMs: Math.round(maxLatency),
      writeTotalRequests: writeRequests,
      writeConcurrency,
      writeRps: Math.round((writeRequests / writeElapsed) * 1000),
      writeP95Ms: Math.round(writeP95),
    },
  }, null, 2));
}

main().finally(async () => {
  server.kill();
  await sleep(200);
  await testPool.end();
  await adminPool.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
  await adminPool.end();
}).catch(err => {
  server.kill();
  console.error(err);
  process.exit(1);
});
