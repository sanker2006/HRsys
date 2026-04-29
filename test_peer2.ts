import { chromium } from 'playwright';

async function main() {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext();
  const api = ctx.request as any;

  // 李四 - 互评 relation_id=18 (peer with 导入B)
  const lr = await api.post('http://localhost:3000/api/v1/auth/h5-login', { data: { phone: '13800138002', idCardTail: '5678' } });
  const t = (await lr.json())?.data?.token;
  console.log('Token:', t ? 'OK' : 'FAIL');

  // 先看关系详情
  const detailR = await api.get('http://localhost:3000/api/v1/answer/relation/18', { headers: { Authorization: 'Bearer ' + t } });
  const detailD = await detailR.json();
  console.log('互评详情:', JSON.stringify(detailD).substring(0, 500));

  // 打开表单
  const p = await ctx.newPage();
  await p.goto('http://localhost:5174/');
  await p.waitForTimeout(2000);
  await p.evaluate((tok: string) => localStorage.setItem('h5_token', tok), t);
  await p.waitForTimeout(500);
  await p.goto('http://localhost:5174/eval-form/18');
  await p.waitForTimeout(8000);

  const txt = await p.textContent('body');
  console.log('页面文本:', txt.substring(0, 300));

  const vanSteppers = await p.locator('van-stepper').count();
  const totalForms = await p.locator('.total-form').count();
  const selfForms = await p.locator('.self-form').count();
  console.log('van-stepper:', vanSteppers, '| total-form:', totalForms, '| self-form:', selfForms);

  // 尝试操作stepper
  if (vanSteppers > 0) {
    // 读取初始值
    const initVal = await p.evaluate(() => {
      const s = document.querySelector('van-stepper');
      return s?.shadowRoot?.querySelector('input')?.value ?? s?.querySelector('input')?.value ?? 'N/A';
    });
    console.log('初始分值:', initVal);

    // 点+号10次
    for (let i = 0; i < 10; i++) {
      await p.evaluate(() => {
        const plus = document.querySelector('van-stepper')?.shadowRoot?.querySelector('.van-stepper__plus') as HTMLElement;
        plus?.click();
      });
      await p.waitForTimeout(100);
    }

    const afterVal = await p.evaluate(() => {
      const s = document.querySelector('van-stepper');
      return s?.shadowRoot?.querySelector('input')?.value ?? s?.querySelector('input')?.value ?? 'N/A';
    });
    console.log('+10后分值:', afterVal);
    await p.screenshot({ path: 'peer_form_after.png' });

    // 提交
    const submitBtn = p.locator('.btn-submit');
    await submitBtn.click();
    await p.waitForTimeout(1000);
    const dialog = await p.locator('.van-dialog').count();
    if (dialog > 0) {
      await p.locator('.van-dialog__confirm').first().click();
      await p.waitForTimeout(3000);
    }
    await p.screenshot({ path: 'peer_submit_result.png' });
    const afterTxt = await p.textContent('body');
    console.log('提交后文本:', afterTxt.substring(0, 200));
  } else {
    await p.screenshot({ path: 'peer_form_no_stepper.png' });
  }

  await p.close();
  await b.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
