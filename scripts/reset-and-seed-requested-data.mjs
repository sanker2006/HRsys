const base = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api/v1';

async function request(path, { method = 'GET', token, body, allowFail = false } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!allowFail && json.code !== 0) throw new Error(`${method} ${path}: ${json.message}`);
  return json;
}

function formatLocalDateTime(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function talentQuestionRow(name, employeeNo) {
  const row = { 姓名: name, 工号: employeeNo };
  [
    [`${name}人才服务重点任务达成情况`, 18],
    [`${name}招聘配置与人才供给质量`, 17.5],
    [`${name}员工服务响应与闭环质量`, 17],
    [`${name}人才数据分析与改进落地`, 17.5],
  ].forEach(([content, score], index) => {
    row[`业绩题${index + 1}`] = content;
    row[`业绩分值${index + 1}`] = score;
  });
  addComprehensive(row, name);
  return row;
}

function generalQuestionRow(name, employeeNo) {
  const row = { 姓名: name, 工号: employeeNo };
  [
    [`${name}综合事务统筹与执行质量`, 25],
    [`${name}行政支持与流程保障成效`, 22.5],
    [`${name}跨部门协调与问题闭环`, 22.5],
  ].forEach(([content, score], index) => {
    row[`业绩题${index + 1}`] = content;
    row[`业绩分值${index + 1}`] = score;
  });
  addComprehensive(row, name);
  return row;
}

function addComprehensive(row, name) {
  [
    [`${name}协作沟通`, 6],
    [`${name}责任意识`, 5.5],
    [`${name}学习改进`, 6.5],
    [`${name}主动担当`, 6],
    [`${name}纪律性与价值观`, 6],
  ].forEach(([content, score], index) => {
    row[`综合题${index + 1}`] = content;
    row[`综合分值${index + 1}`] = score;
  });
}

async function login() {
  const res = await request('/auth/login', {
    method: 'POST',
    body: { account: process.env.ADMIN_ACCOUNT || 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' },
  });
  return res.data.token;
}

async function cleanup(token) {
  const batches = (await request('/batch/', { token })).data || [];
  for (const batch of batches) {
    if (batch.status === 'active') {
      await request(`/batch/${batch.id}/close`, { method: 'POST', token, allowFail: true });
    }
    await request(`/batch/${batch.id}`, { method: 'DELETE', token, allowFail: true });
  }

  const users = (await request('/user/?pageSize=500', { token })).data?.list || [];
  for (const user of users) {
    if (!user.is_admin) await request(`/user/${user.id}`, { method: 'DELETE', token, allowFail: true });
  }

  const departments = (await request('/department/', { token })).data?.list || [];
  for (const department of departments) {
    await request(`/department/${department.id}`, { method: 'DELETE', token, allowFail: true });
  }
}

async function ensureDepartment(token, name, sort_order) {
  const res = await request('/department/', {
    method: 'POST',
    token,
    body: { name, sort_order },
    allowFail: true,
  });
  if (res.code !== 0 && !/存在/.test(res.message)) throw new Error(`department ${name}: ${res.message}`);
}

async function createUser(token, data) {
  const res = await request('/user/', { method: 'POST', token, body: data });
  return res.data;
}

async function main() {
  const token = await login();
  await cleanup(token);
  await ensureDepartment(token, '公司', 0);
  await ensureDepartment(token, '人才综合服务部', 1);
  await ensureDepartment(token, '综合部', 2);

  const users = [
    {
      name: '李飞',
      employee_no: 'LF001',
      department: '公司',
      position: '主要领导',
      level: 'main_leader',
      phone: '13810000001',
      id_card_tail: '0001',
    },
    {
      name: '李佳玮',
      employee_no: 'LJW001',
      department: '公司',
      position: '分管领导',
      level: 'division_leader',
      phone: '13810000002',
      id_card_tail: '0002',
      managed_departments: ['人才综合服务部'],
    },
    {
      name: '蔡昕霖',
      employee_no: 'CXL001',
      department: '人才综合服务部',
      position: '部门负责人',
      level: 'manager',
      phone: '13810000003',
      id_card_tail: '0003',
    },
    {
      name: '汤猛',
      employee_no: 'TM001',
      department: '人才综合服务部',
      position: '员工',
      level: 'staff',
      phone: '13810000004',
      id_card_tail: '0004',
    },
    {
      name: '童云',
      employee_no: 'TY001',
      department: '人才综合服务部',
      position: '员工',
      level: 'staff',
      phone: '13810000005',
      id_card_tail: '0005',
    },
    {
      name: '俞建华',
      employee_no: 'YJH001',
      department: '人才综合服务部',
      position: '员工',
      level: 'staff',
      phone: '13810000006',
      id_card_tail: '0006',
    },
    {
      name: '傅敏娜',
      employee_no: 'FMN001',
      department: '综合部',
      position: '部门负责人',
      level: 'manager',
      phone: '13810000007',
      id_card_tail: '0007',
    },
    {
      name: '林晓',
      employee_no: 'LX001',
      department: '综合部',
      position: '员工',
      level: 'staff',
      phone: '13810000008',
      id_card_tail: '0008',
    },
    {
      name: '胡伟',
      employee_no: 'HW001',
      department: '综合部',
      position: '员工',
      level: 'staff',
      phone: '13810000009',
      id_card_tail: '0009',
    },
  ];
  for (const user of users) await createUser(token, user);

  const now = new Date();
  const batch = (await request('/batch/', {
    method: 'POST',
    token,
    body: {
      name: '2026年Q2评比活动',
      period: '2026年Q2',
      start_time: formatLocalDateTime(new Date(now.getTime() - 60 * 60 * 1000)),
      end_time: formatLocalDateTime(new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)),
      peer_cross_dept: 0,
    },
  })).data;

  const questionItems = [
    talentQuestionRow('蔡昕霖', 'CXL001'),
    talentQuestionRow('汤猛', 'TM001'),
    talentQuestionRow('童云', 'TY001'),
    talentQuestionRow('俞建华', 'YJH001'),
    generalQuestionRow('傅敏娜', 'FMN001'),
    generalQuestionRow('林晓', 'LX001'),
    generalQuestionRow('胡伟', 'HW001'),
  ];
  const imported = (await request('/self-question/import', {
    method: 'POST',
    token,
    body: { batch_id: batch.id, items: questionItems },
  })).data;
  const generated = (await request(`/relation/generate/${batch.id}`, { method: 'POST', token })).data;
  await request(`/batch/${batch.id}/start`, { method: 'POST', token });

  const relations = (await request(`/relation/?batch_id=${batch.id}&pageSize=500`, { token })).data.list || [];
  const questions = (await request(`/self-question/${batch.id}`, { token })).data || [];

  console.log(JSON.stringify({
    batch_id: batch.id,
    batch_name: batch.name,
    imported,
    generated,
    relation_counts: {
      total: relations.length,
      self: relations.filter(r => r.eval_type === 'self').length,
      peer: relations.filter(r => r.eval_type === 'peer').length,
      downward: relations.filter(r => r.eval_type === 'downward').length,
    },
    question_rows: questions.length,
    h5_accounts: users.map(user => ({
      name: user.name,
      role: user.level,
      phone: user.phone,
      id_card_tail: user.id_card_tail,
    })),
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
