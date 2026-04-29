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
      res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch(e) { resolve({ raw: b }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  // Login first
  const login = await request('POST', '/api/v1/auth/login', { account: 'admin', password: 'admin123' });
  const token = login.data?.token;
  
  // Try create one user
  const res = await request('POST', '/api/v1/user', {
    name: '测试用户', employee_no: 'TEST001', department: '技术部',
    position: '开发', level: 'staff', phone: '13900000001', id_card_tail: '1234'
  }, token);
  
  console.log('Create result:', JSON.stringify(res, null, 2));
}

run().catch(console.error);
