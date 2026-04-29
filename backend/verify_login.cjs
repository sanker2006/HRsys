const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve) => {
    const options = { hostname: 'localhost', port: 3000, path, method, headers: { 'Content-Type': 'application/json' } };
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(options, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve({ s: res.statusCode, b: JSON.parse(d) }); }
        catch(e) { resolve({ s: res.statusCode, b: d }); }
      });
    });
    r.on('error', e => resolve({ s: 0, b: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  // Admin login
  const a = await req('POST', '/api/v1/auth/login', { account: 'admin', password: 'admin123' });
  console.log('Admin:', a.s, JSON.stringify(a.b));

  // H5 login tests
  const h1 = await req('POST', '/api/v1/auth/h5-login', { phone: '13800138001', idCardTail: '1234' });
  console.log('H5 张三丰(1234):', h1.s, JSON.stringify(h1.b));
  
  const h2 = await req('POST', '/api/v1/auth/h5-login', { phone: '13800138002', idCardTail: '5678' });
  console.log('H5 李四(5678):', h2.s, JSON.stringify(h2.b));
  
  // Check user routes
  const token = a.b?.data?.token;
  const u1 = await req('GET', '/api/v1/users?pageSize=5', null, token);
  console.log('GET /users:', u1.s, JSON.stringify(u1.b));
  const u2 = await req('GET', '/api/v1/user?pageSize=5', null, token);
  console.log('GET /user:', u2.s, JSON.stringify(u2.b));
  
  // Check what routes exist
  const batchId = a.b?.data?.user?.id;
  console.log('\nBatch create:');
  const bc = await req('POST', '/api/v1/batch', { name: 'TestBatch', period: 'Q2', start_time: '2026-04-20', end_time: '2026-05-20' }, token);
  console.log('Create:', bc.s, JSON.stringify(bc.b));
  const bid = bc.b?.data?.id;
  
  if (bid) {
    console.log('\nGenerate relations:');
    const gr = await req('POST', '/api/v1/relation/generate', { batch_id: bid }, token);
    console.log('Generate:', gr.s, JSON.stringify(gr.b));
    
    const rl = await req('GET', '/api/v1/relation?batch_id=' + bid, null, token);
    console.log('Relations:', rl.s, 'total=' + rl.b?.data?.total);
    
    // Self question import test
    console.log('\nSelf question import (with validation check):');
    const sq = await req('POST', '/api/v1/self-question/import/' + bid, null, token);
    console.log('Import:', sq.s, JSON.stringify(sq.b));
  }
})();
