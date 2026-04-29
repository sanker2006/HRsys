import { chromium } from 'playwright';

async function main() {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext();
  const api = ctx.request as any;

  const lr = await api.post('http://localhost:3000/api/v1/auth/h5-login', { data: { phone: '17365800273', idCardTail: '0273' } });
  const t = (await lr.json())?.data?.token;

  const p = await ctx.newPage();
  await p.goto('http://localhost:5174/');
  await p.waitForTimeout(2000);
  await p.evaluate((tok: string) => localStorage.setItem('h5_token', tok), t);
  await p.waitForTimeout(500);
  await p.goto('http://localhost:5174/eval-form/145');
  await p.waitForTimeout(10000);

  // 深度检查van-stepper
  const deepInfo = await p.evaluate(() => {
    const s = document.querySelector('van-stepper') as any;
    if (!s) return 'no element';
    const styles = window.getComputedStyle(s);
    return {
      display: styles.display,
      visibility: styles.visibility,
      opacity: styles.opacity,
      width: styles.width,
      height: styles.height,
      position: styles.position,
      offsetW: s.offsetWidth,
      offsetH: s.offsetHeight,
      clientW: s.clientWidth,
      clientH: s.clientHeight,
      boundingW: s.getBoundingClientRect().width,
      boundingH: s.getBoundingClientRect().height,
      childCount: s.children.length,
      innerHTML: s.innerHTML?.substring(0, 200)
    };
  });
  console.log('stepper styles:', JSON.stringify(deepInfo, null, 2));

  // 查shadowRoot
  const shadowCheck = await p.evaluate(() => {
    const s = document.querySelector('van-stepper');
    return {
      hasSR: !!(s as any)?.shadowRoot,
      srHTML: (s as any)?.shadowRoot?.innerHTML?.substring(0, 300) || 'none',
      children: Array.from(s?.children || []).map(c => c.tagName + '.' + c.className)
    };
  });
  console.log('shadowCheck:', JSON.stringify(shadowCheck, null, 2));

  // 截图
  await p.screenshot({ path: 'stepper_deep.png', fullPage: true });

  // 尝试直接用playwright定位input
  const inputs = await p.locator('van-stepper input').count();
  console.log('van-stepper input count:', inputs);
  const allInputs = await p.locator('input').count();
  console.log('all input count:', allInputs);

  // 直接API提交验证互评打分功能
  const submitR = await api.post('http://localhost:3000/api/v1/answer/total', {
    data: { relation_id: 145, score: 88, draft: false }
  }, { headers: { Authorization: 'Bearer ' + t } });
  const submitD = await submitR.json();
  console.log('API提交结果:', JSON.stringify(submitD));

  // 验证状态
  const relsR = await api.get('http://localhost:3000/api/v1/relation/my?batch_id=15', { headers: { Authorization: 'Bearer ' + t } });
  const relsD = await relsR.json();
  const rel145 = (relsD?.data?.list || []).find((r: any) => r.id === 145);
  console.log('提交后rel145状态:', rel145?.status);

  await p.close();
  await b.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
