import { chromium } from 'playwright';

async function main() {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext();
  const api = ctx.request as any;

  // 汤猛: 17365800273 / 0273, 互评relation_id=145 (→钱七, pending)
  const lr = await api.post('http://localhost:3000/api/v1/auth/h5-login', { data: { phone: '17365800273', idCardTail: '0273' } });
  const t = (await lr.json())?.data?.token;

  const p = await ctx.newPage();
  await p.goto('http://localhost:5174/');
  await p.waitForTimeout(2000);
  await p.evaluate((tok: string) => localStorage.setItem('h5_token', tok), t);
  await p.waitForTimeout(500);
  await p.goto('http://localhost:5174/eval-form/145');
  await p.waitForTimeout(10000);

  // 详细检查stepper状态
  const stepperInfo = await p.evaluate(() => {
    const s = document.querySelector('van-stepper') as any;
    if (!s) return 'no element';
    const sr = s.shadowRoot;
    if (!sr) return 'no shadowRoot';
    const plus = sr.querySelector('.van-stepper__plus');
    const minus = sr.querySelector('.van-stepper__minus');
    const input = sr.querySelector('input');
    return {
      hasShadow: true,
      plusFound: !!plus,
      minusFound: !!minus,
      inputFound: !!input,
      inputVal: input?.value,
      stepperW: s.offsetWidth,
      stepperH: s.offsetHeight,
      srHTML: sr.innerHTML?.substring(0, 300)
    };
  });
  console.log('stepperInfo:', JSON.stringify(stepperInfo, null, 2));

  const txt = await p.textContent('body');
  console.log('页面文本:', txt.substring(0, 300));

  await p.screenshot({ path: 'stepper_debug.png' });

  // API验证
  const detailR = await api.get('http://localhost:3000/api/v1/answer/relation/145', { headers: { Authorization: 'Bearer ' + t } });
  const detailD = await detailR.json();
  console.log('Relation145详情:', JSON.stringify(detailD));

  await p.close();
  await b.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
