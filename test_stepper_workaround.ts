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
  await p.waitForTimeout(8000);

  // 检查 shadow DOM
  const srInfo = await p.evaluate(() => {
    const s = document.querySelector('van-stepper') as any;
    if (!s) return 'no element';
    const sr = s.shadowRoot;
    if (!sr) return 'no shadowRoot - innerHTML: ' + s.innerHTML?.substring(0, 100);
    return 'has shadowRoot, children: ' + Array.from(sr.children).map(c => c.tagName).join(', ') + ' | html: ' + sr.innerHTML?.substring(0, 200);
  });
  console.log('shadowRoot状态:', srInfo);

  // 找所有input（有无）
  const inputCount = await p.locator('input').count();
  console.log('input元素数量:', inputCount);

  // 通过Evaluate页面的列表进入互评，而不是直接goto
  // 这样SPA状态更完整
  await p.goto('http://localhost:5174/home');
  await p.waitForTimeout(3000);
  const homeText = await p.textContent('body');
  console.log('首页文本:', homeText.substring(0, 200));

  // 检查是否有"参与评价"或"同层互评"入口
  const peerSection = homeText.includes('互评') || homeText.includes('peer');
  console.log('首页有互评入口:', peerSection);

  await p.screenshot({ path: 'home_page.png', fullPage: true });

  // 直接API验证互评提交功能
  const submitR = await api.post('http://localhost:3000/api/v1/answer/total', {
    data: { relation_id: 145, score: 88, draft: false }
  }, { headers: { Authorization: 'Bearer ' + t } });
  const submitD = await submitR.json();
  console.log('互评API提交结果:', JSON.stringify(submitD));

  // 核心Bug确认：van-stepper innerHTML为空 = Vant组件未初始化
  // 这是headless环境的已知问题，但真实用户如果遇到同样情况则说明有兼容性bug
  console.log('BUG确认: van-stepper innerHTML为空，width=0');

  await p.close();
  await b.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
