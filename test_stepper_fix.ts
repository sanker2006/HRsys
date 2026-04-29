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

  // 检查van-stepper实际内容
  const before = await p.evaluate(() => {
    const s = document.querySelector('van-stepper');
    return {
      tag: s?.tagName,
      html: s?.innerHTML,
      w: s?.offsetWidth,
      h: s?.offsetHeight,
      // Vant 4 uses open shadow DOM
      shadowHTML: (s as any)?.shadowRoot?.innerHTML?.substring(0, 300) || 'no shadow'
    };
  });
  console.log('Before stepper state:', JSON.stringify(before, null, 2));

  // 尝试用Vant的方式：触发plus按钮的click事件
  const clickResult = await p.evaluate(() => {
    const s = document.querySelector('van-stepper') as any;
    if (!s) return 'no stepper';
    const sr = s.shadowRoot;
    if (!sr) return 'no shadowRoot';

    const plus = sr.querySelector('.van-stepper__plus');
    if (!plus) return 'no plus btn, children: ' + sr.innerHTML?.substring(0, 200);
    (plus as HTMLElement).click();
    return 'clicked plus, html now: ' + sr.innerHTML?.substring(0, 200);
  });
  console.log('Click result:', clickResult);

  await p.waitForTimeout(500);
  const scoreText = await p.locator('.total-num').textContent().catch(() => 'N/A');
  console.log('分值显示:', scoreText);

  // 如果shadow DOM存在但不可点击，尝试直接操作数据
  const setScore = await p.evaluate(() => {
    // 找到Vue实例
    const app = document.querySelector('#app')?.__vue_app__;
    if (!app) return 'no vue app';
    // 尝试找eval-form组件实例
    const instances = Array.from((app as any)._instance?.root?.proxy || []);
    return 'vue instances: ' + instances.length;
  });
  console.log('Vue access:', setScore);

  await p.screenshot({ path: 'stepper_click_result.png' });

  // 最终：直接API提交验证功能可用性
  const submitR = await api.post('http://localhost:3000/api/v1/answer/total', {
    data: { relation_id: 145, score: 88, draft: false }
  }, { headers: { Authorization: 'Bearer ' + t } });
  const submitD = await submitR.json();
  console.log('直接API提交:', JSON.stringify(submitD));

  // 再测一次 - 用新页面直接提交，不用UI
  // 把分值设高然后提交
  await p.goto('http://localhost:5174/eval-form/145');
  await p.waitForTimeout(10000);

  // 找所有可点击的button
  const allBtns = await p.evaluate(() => {
    const btns = document.querySelectorAll('button, .van-button, [class*="btn"]');
    return Array.from(btns).map(b => b.className + ' text:' + b.textContent?.trim());
  });
  console.log('页面按钮:', allBtns);

  // 尝试直接用 submitTotal API
  // 实际上，因为van-stepper UI坏了，只能通过API打分
  // 这是确定的BUG：van-stepper在headless/chromium环境下无法交互

  await p.close();
  await b.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
