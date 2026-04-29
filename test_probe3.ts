import { chromium } from 'playwright';
async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const api = ctx.request as any;

  // 张三丰
  const r1 = await api.post('http://localhost:3000/api/v1/auth/h5-login', { data: { phone: '13800138001', idCardTail: '1234' } });
  const d1 = await r1.json();
  const token = d1?.data?.token;

  // 查关系状态
  const relsR = await api.get('http://localhost:3000/api/v1/relation/my?batch_id=15', { headers: { Authorization: 'Bearer ' + token } });
  const relsD = await relsR.json();
  const list: any[] = relsD?.data?.list || [];
  console.log('张三丰所有关系:');
  list.forEach((r: any) => console.log('  id=' + r.id + ' type=' + r.eval_type + ' status=' + r.status));

  // 李四
  const r2 = await api.post('http://localhost:3000/api/v1/auth/h5-login', { data: { phone: '13800138002', idCardTail: '5678' } });
  const d2 = await r2.json();
  const lisiToken = d2?.data?.token;

  const relsR2 = await api.get('http://localhost:3000/api/v1/relation/my?batch_id=15', { headers: { Authorization: 'Bearer ' + lisiToken } });
  const relsD2 = await relsR2.json();
  const list2: any[] = relsD2?.data?.list || [];
  console.log('\n李四所有关系:');
  list2.forEach((r: any) => console.log('  id=' + r.id + ' type=' + r.eval_type + ' status=' + r.status));

  // 检查answer表
  const ansR = await api.get('http://localhost:3000/api/v1/answer/progress/15', { headers: { Authorization: 'Bearer ' + token } });
  const ansD = await ansR.json();
  console.log('\n张三丰进度:', JSON.stringify(ansD));

  // 检查relation detail after submit
  const detailR = await api.get('http://localhost:3000/api/v1/answer/relation/142', { headers: { Authorization: 'Bearer ' + token } });
  const detailD = await detailR.json();
  console.log('\n关系142详情:', JSON.stringify(detailD?.data?.relation));

  await browser.close();
}
run().catch(e => console.error(e.message));
