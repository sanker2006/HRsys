import { chromium } from 'playwright';

async function main() {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext();
  const api = ctx.request as any;

  // 李四 - 互评 relation_id=18
  const lr = await api.post('http://localhost:3000/api/v1/auth/h5-login', { data: { phone: '13800138002', idCardTail: '5678' } });
  const t = (await lr.json())?.data?.token;

  const p = await ctx.newPage();
  await p.goto('http://localhost:5174/');
  await p.waitForTimeout(2000);
  await p.evaluate((tok: string) => localStorage.setItem('h5_token', tok), t);
  await p.waitForTimeout(500);
  await p.goto('http://localhost:5174/eval-form/18');
  await p.waitForTimeout(8000);

  const vanSteppers = await p.locator('van-stepper').count();
  console.log('van-stepper count:', vanSteppers);

  // 找到内部的input
  const hasShadow = await p.evaluate(() => {
    const s = document.querySelector('van-stepper');
    return !!(s?.shadowRoot);
  });
  console.log('有shadowRoot:', hasShadow);

  // 检查van-stepper的shadowRoot
  const shadowInfo = await p.evaluate(() => {
    const s = document.querySelector('van-stepper') as any;
    if (!s) return 'no element';
    if (s.shadowRoot) return 'has shadowRoot, input=' + (s.shadowRoot.querySelector('input')?.value ?? 'null');
    // try native traversal
    const allInput = s.querySelectorAll('input');
    if (allInput.length > 0) return 'no shadow, ' + allInput.length + ' inputs, val=' + allInput[0].value;
    return 'no shadow, no input, children=' + s.children.length;
  });
  console.log('shadowInfo:', shadowInfo);

  // 方法1：通过JS直接改v-model (模拟用户输入)
  await p.evaluate(() => {
    const s = document.querySelector('van-stepper') as any;
    if (s?.shadowRoot) {
      const input = s.shadowRoot.querySelector('input');
      if (input) {
        // 触发v-model更新
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        nativeInputValueSetter?.call(input, '85');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  await p.waitForTimeout(500);

  // 检查显示值
  const displayVal = await p.locator('.total-num').first().textContent();
  console.log('显示分值:', displayVal);

  // 方法2：用Playwright click on the plus button directly
  const stepperBox = await p.locator('van-stepper').first().boundingBox();
  console.log('stepper位置:', JSON.stringify(stepperBox));

  if (stepperBox) {
    // 点+号按钮（右侧）
    await p.mouse.click(stepperBox.x + stepperBox.width - 20, stepperBox.y + stepperBox.height / 2);
    await p.waitForTimeout(300);
    await p.mouse.click(stepperBox.x + stepperBox.width - 20, stepperBox.y + stepperBox.height / 2);
    await p.waitForTimeout(300);
    const valAfterClick = await p.locator('.total-num').first().textContent();
    console.log('点击+2次后分值:', valAfterClick);
  }

  await p.screenshot({ path: 'peer_stepper_test.png' });

  // 最终：直接通过API提交
  const submitR = await api.post('http://localhost:3000/api/v1/answer/total', {
    data: { relation_id: 18, score: 88, draft: false }
  }, { headers: { Authorization: 'Bearer ' + t } });
  const submitD = await submitR.json();
  console.log('提交结果:', JSON.stringify(submitD));

  // 验证状态
  const relsR2 = await api.get('http://localhost:3000/api/v1/relation/my?batch_id=7', { headers: { Authorization: 'Bearer ' + t } });
  const relsD2 = await relsR2.json();
  const rel18 = (relsD2?.data?.list || []).find((r: any) => r.id === 18);
  console.log('提交后relation18:', JSON.stringify(rel18));

  await p.close();
  await b.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
