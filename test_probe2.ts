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

  if (token) {
    const h = { 'Authorization': 'Bearer ' + token };
    // 获取自评关系
    const relsR = await api.get('http://localhost:3000/api/v1/relation/my?batch_id=15', { headers: h });
    const relsD = await relsR.json();
    const relsList: any[] = relsD?.data?.list || [];
    const pendingSelf = relsList.find((r: any) => r.eval_type === 'self' && r.status === 'pending');
    console.log('自评关系:', JSON.stringify(pendingSelf));

    if (pendingSelf) {
      const detailR = await api.get('http://localhost:3000/api/v1/answer/relation/' + pendingSelf.id, { headers: h });
      const detailD = await detailR.json();
      console.log('answer/relation响应:', JSON.stringify(detailD).substring(0, 600));
    }

    // 也试试用self-question接口
    const sqR = await api.get('http://localhost:3000/api/v1/self-question/15/me', { headers: h });
    const sqD = await sqR.json();
    console.log('self-question响应:', JSON.stringify(sqD));
  }

  await browser.close();
}
run().catch(e => console.error(e.message));
