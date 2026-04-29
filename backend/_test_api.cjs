const http = require('http');
const data = JSON.stringify({account:'admin', password:'admin123'});
const options = {hostname:'localhost',port:3000,path:'/api/v1/auth/login',method:'POST',headers:{'Content-Type':'application/json','Content-Length':data.length}};
const req = http.request(options, res => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    const json = JSON.parse(body);
    console.log('Login Response:', JSON.stringify(json, null, 2));
    
    // Test /auth/me with token
    if (json.data && json.data.token) {
      const data2 = '{}';
      const opt2 = {hostname:'localhost',port:3000,path:'/api/v1/auth/me',method:'GET',headers:{'Authorization':'Bearer '+json.data.token,'Content-Length':data2.length}};
      const req2 = http.request(opt2, res2 => {
        let b2 = '';
        res2.on('data', c => b2 += c);
        res2.on('end', () => console.log('Me Response:', JSON.stringify(JSON.parse(b2), null, 2)));
      });
      req2.end();
    }
  });
});
req.end(data);
