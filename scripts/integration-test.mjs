import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = resolve(root, 'backend');
const dbPath = resolve(root, 'data', `hrsys-test-${Date.now()}.db`);
const port = 4017;
const base = `http://127.0.0.1:${port}/api/v1`;

mkdirSync(dirname(dbPath), { recursive: true });
if (existsSync(dbPath)) rmSync(dbPath);

const server = spawn(process.execPath, ['dist/main.js'], {
  cwd: backendDir,
  env: {
    ...process.env,
    PORT: String(port),
    DB_PATH: dbPath,
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

function fullScoreAnswers() {
  return [
    7.5, 6.5, 7, 8, 6, 7.5, 6.5, 7, 7, 7,
    6, 5.5, 6.5, 6, 6,
  ].map((score, index) => ({
    seq: index < 10 ? index + 1 : 100 + (index - 9),
    score,
  }));
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

async function h5Token(phone, tail) {
  const data = await ok('/auth/h5-login', { method: 'POST', body: { phone, idCardTail: tail } });
  return data.token;
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
    body: { name: 'V2规则集成测试批次', period: '2026', start_time: past, end_time: future, peer_cross_dept: 0 },
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

  const gen = await ok(`/relation/generate/${batch.id}`, { method: 'POST', token: adminToken });
  assert.equal(gen.self, 6);
  assert.equal(gen.peer, 6);
  assert.equal(gen.downward, 14);
  await ok(`/batch/${batch.id}/start`, { method: 'POST', token: adminToken });

  const relationPage = await ok(`/relation/?batch_id=${batch.id}&pageSize=500`, { token: adminToken });
  const relations = relationPage.list;
  assert.equal(relations.filter(r => r.eval_type === 'self' && ['main_leader', 'division_leader'].includes(r.evaluator_level)).length, 0);
  assert.equal(relations.filter(r => r.evaluator_name === '分管A' && r.target_department === '销售部').length, 0);
  assert.equal(relations.filter(r => r.evaluator_name === '主领导' && r.eval_type === 'downward').length, 6);

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
  await ok('/answer/detail', {
    method: 'POST',
    token: staff1Token,
    body: { relation_id: peerToStaff2.id, answers: peerAnswers(), draft: false },
  });

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
  await ok('/answer/detail', { method: 'POST', token: managerAToken, body: { relation_id: s1.id, answers: managerAnswers(90), draft: true } });
  await ok('/answer/detail', { method: 'POST', token: managerAToken, body: { relation_id: s2.id, answers: managerAnswers(88), draft: true } });
  const draftOnlyOverview = await ok(`/answer/downward/${batch.id}`, { token: managerAToken });
  assert.equal(draftOnlyOverview.quota.high, 0);
  await ok('/answer/detail', { method: 'POST', token: managerAToken, body: { relation_id: s1.id, answers: managerAnswers(90), draft: false } });
  const afterSingleSubmit = await ok(`/answer/downward/${batch.id}`, { token: managerAToken });
  assert.equal(afterSingleSubmit.quota.high, 1);
  assert.equal(afterSingleSubmit.list.find(r => r.target_name === '研发员工1').status, 'completed');
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

  const mainRels = await ok(`/relation/my?batch_id=${batch.id}`, { token: mainToken });
  assert.equal(mainRels.list.filter(r => r.eval_type === 'downward').length, 6);

  const adminProgress = await ok(`/answer/admin/progress/${batch.id}`, { token: adminToken });
  assert.equal(adminProgress.self.stats.completed, 6);
  assert(adminProgress.downward.stats.completed >= 6);

  const expiringBatch = await ok('/batch/', {
    method: 'POST',
    token: adminToken,
    body: { name: '提交过期拦截测试批次', period: '2026', start_time: past, end_time: future, peer_cross_dept: 0 },
  });
  await ok('/self-question/import', {
    method: 'POST',
    token: adminToken,
    body: { batch_id: expiringBatch.id, items: importRows },
  });
  await ok(`/relation/generate/${expiringBatch.id}`, { method: 'POST', token: adminToken });
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
    dbPath,
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
}).catch(err => {
  server.kill();
  console.error(err);
  process.exit(1);
});
