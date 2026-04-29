import { chromium } from 'playwright';

async function main() {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext();
  const api = ctx.request as any;

  // 张三丰 - 找互评pending
  const lr = await api.post('http://localhost:3000/api/v1/auth/h5-login', { data: { phone: '13800138001', idCardTail: '1234' } });
  const t = (await lr.json())?.data?.token;
  const relsR = await api.get('http://localhost:3000/api/v1/relation/my?batch_id=15', { headers: { Authorization: 'Bearer ' + t } });
  const rels = (await relsR.json())?.data?.list || [];
  const peerPending = rels.filter((r: any) => r.eval_type === 'peer' && r.status === 'pending');
  const peerDone = rels.filter((r: any) => r.eval_type === 'peer');
  console.log('互评关系:', JSON.stringify(peerDone));

  if (peerPending.length > 0) {
    const rel = peerPending[0];
    console.log('测试互评 relation_id=' + rel.id);
    const p = await ctx.newPage();
    await p.goto('http://localhost:5174/');
    await p.waitForTimeout(2000);
    await p.evaluate((tok: string) => localStorage.setItem('h5_token', tok), t);
    await p.waitForTimeout(500);
    await p.goto('http://localhost:5174/eval-form/' + rel.id);
    await p.waitForTimeout(8000);
    const html = await p.locator('.eval-form-page').innerHTML().catch(() => 'N/A');
    console.log('HTML:', html.substring(0, 600));
    const txt = await p.textContent('body');
    console.log('页面文本:', txt.substring(0, 300));
    const vanSteppers = await p.locator('van-stepper').count();
    const totalForms = await p.locator('.total-form').count();
    const selfForms = await p.locator('.self-form').count();
    const loadingVisible = (await p.locator('.van-loading').count()) > 0;
    console.log('van-stepper:', vanSteppers, '| total-form:', totalForms, '| self-form:', selfForms, '| loading:', loadingVisible);
    await p.screenshot({ path: 'peer_eval_debug.png' });
    await p.close();
  } else {
    console.log('无pending互评，找已完成测试页面');
    if (peerDone.length > 0) {
      const rel = peerDone[0];
      console.log('已完成互评 relation_id=' + rel.id + ' status=' + rel.status);
      const p = await ctx.newPage();
      await p.goto('http://localhost:5174/');
      await p.waitForTimeout(2000);
      await p.evaluate((tok: string) => localStorage.setItem('h5_token', tok), t);
      await p.waitForTimeout(500);
      await p.goto('http://localhost:5174/eval-form/' + rel.id);
      await p.waitForTimeout(8000);
      const txt = await p.textContent('body');
      console.log('已完成互评页面:', txt.substring(0, 300));
      const vanSteppers = await p.locator('van-stepper').count();
      console.log('van-stepper:', vanSteppers);
      await p.screenshot({ path: 'peer_done_debug.png' });
      await p.close();
    }
  }

  await b.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
