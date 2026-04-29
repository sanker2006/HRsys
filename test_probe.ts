import { chromium } from 'playwright';
async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const api = ctx.request as any;

  const loginR = await api.post('http://localhost:3000/api/v1/auth/h5-login', {
    data: { phone: '13800138001', idCardTail: '1234' }
  });
  const loginD = await loginR.json();
  const token = loginD?.data?.token;
  console.log('Login:', JSON.stringify(loginD));

  if (token) {
    const h = { 'Authorization': 'Bearer ' + token };
    const relsR = await api.get('http://localhost:3000/api/v1/relation/my?batch_id=15', { headers: h });
    const relsD = await relsR.json();
    console.log('Relations:', JSON.stringify(relsD).substring(0, 500));

    // 也试试 self-question
    const sqR = await api.get('http://localhost:3000/api/v1/self-question/15/me', { headers: h });
    const sqD = await sqR.json();
    console.log('SelfQ:', JSON.stringify(sqD).substring(0, 500));
  }

  await browser.close();
}
run().catch(e => console.error(e.message));
