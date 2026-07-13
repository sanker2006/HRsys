const base = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api/v1';

async function request(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`${method} ${path}: ${json.message}`);
  return json.data;
}

async function tryRequest(path, options) {
  try {
    return await request(path, options);
  } catch (err) {
    return { __error: err.message };
  }
}

function formatLocalDateTime(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function questionRow(name, no) {
  const row = { 姓名: name, 工号: no };
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

async function main() {
  const login = await request('/auth/login', {
    method: 'POST',
    body: { account: process.env.ADMIN_ACCOUNT || 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' },
  });
  const token = login.token;

  const existing = await request('/user/?pageSize=100', { token });
  const users = existing.list || [];

  async function ensureUser(data) {
    if (users.some(user => user.employee_no === data.employee_no)) return;
    const result = await tryRequest('/user/', { method: 'POST', token, body: data });
    if (result.__error && !/主要领导/.test(result.__error)) throw new Error(result.__error);
  }

  const demoUsers = [
    { name: 'V2主要领导', employee_no: 'V2L001', department: '公司', position: '主要领导', level: 'main_leader', phone: '13920000001', id_card_tail: '2001' },
    { name: 'V2分管领导', employee_no: 'V2D001', department: '公司', position: '分管领导', level: 'division_leader', phone: '13920000002', id_card_tail: '2002', managed_departments: ['研发部', '销售部'] },
    { name: 'V2研发主管', employee_no: 'V2M001', department: '研发部', position: '部门负责人', level: 'manager', phone: '13920000003', id_card_tail: '2003' },
    { name: 'V2销售主管', employee_no: 'V2M002', department: '销售部', position: '部门负责人', level: 'manager', phone: '13920000004', id_card_tail: '2004' },
    { name: 'V2研发员工1', employee_no: 'V2S001', department: '研发部', position: '工程师', level: 'staff', phone: '13920000005', id_card_tail: '2005' },
    { name: 'V2研发员工2', employee_no: 'V2S002', department: '研发部', position: '工程师', level: 'staff', phone: '13920000006', id_card_tail: '2006' },
    { name: 'V2销售员工1', employee_no: 'V2S003', department: '销售部', position: '销售', level: 'staff', phone: '13920000007', id_card_tail: '2007' },
    { name: 'V2销售员工2', employee_no: 'V2S004', department: '销售部', position: '销售', level: 'staff', phone: '13920000008', id_card_tail: '2008' },
  ];
  for (const user of demoUsers) await ensureUser(user);

  const now = new Date();
  const batch = await request('/batch/', {
    method: 'POST',
    token,
    body: {
      name: `V2新版题目可视化测试批次-${formatLocalDateTime(now).replace(/[: ]/g, '-')}`,
      period: '2026',
      start_time: formatLocalDateTime(new Date(now.getTime() - 60 * 60 * 1000)),
      end_time: formatLocalDateTime(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
      peer_cross_dept: 0,
    },
  });

  const refreshed = await request('/user/?pageSize=500', { token });
  const questionUsers = (refreshed.list || []).filter(user => ['manager', 'staff'].includes(user.level));
  const items = questionUsers.map(user => questionRow(user.name, user.employee_no));
  const imported = await request('/self-question/import', { method: 'POST', token, body: { batch_id: batch.id, items } });
  const preview = await request(`/relation/generate/${batch.id}/preview`, { method: 'POST', token });
  const generated = await request(`/relation/generate/${batch.id}`, {
    method: 'POST', token, body: { preview_hash: preview.preview_hash },
  });
  await request(`/batch/${batch.id}/start`, { method: 'POST', token });

  console.log(JSON.stringify({
    batch_id: batch.id,
    batch_name: batch.name,
    imported,
    generated,
    h5_accounts: demoUsers
      .filter(user => user.level !== 'main_leader')
      .map(user => ({ name: user.name, phone: user.phone, id_card_tail: user.id_card_tail })),
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
