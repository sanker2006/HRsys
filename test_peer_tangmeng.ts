import { chromium } from 'playwright';

async function main() {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext();
  const api = ctx.request as any;

  // 汤猛: 17365800273 / 0273, relation_id=144 (peer → 测试用户, pending)
  const lr = await api.post('http://localhost:3000/api/v1/auth/h5-login', { data: { phone: '17365800273', idCardTail: '0273' } });
  const t = (await lr.json())?.data?.token;
  console.log('Token:', t ? 'OK' : 'FAIL');
  if (!t) { await b.close(); return; }

  // 查看关系列表
  const relsR = await api.get('http://localhost:3000/api/v1/relation/my?batch_id=15', { headers: { Authorization: 'Bearer ' + t } });
  const relsD = await relsR.json();
  const rels = relsD?.data?.list || [];
  console.log('汤猛关系:', rels.filter((r: any) => r.eval_type === 'peer').map((r: any) => ({ id: r.id, target: r.target_name, status: r.status })));

  // 查看relation详情
  const detailR = await api.get('http://localhost:3000/api/v1/answer/relation/144', { headers: { Authorization: 'Bearer ' + t } });
  const detailD = await detailR.json();
  console.log('Relation144详情:', JSON.stringify(detailD).substring(0, 400));

  // UI测试
  const p = await ctx.newPage();
  await p.goto('http://localhost:5174/');
  await p.waitForTimeout(2000);
  await p.evaluate((tok: string) => localStorage.setItem('h5_token', tok), t);
  await p.waitForTimeout(500);
  await p.goto('http://localhost:5174/eval-form/144');
  await p.waitForTimeout(10000);

  const txt = await p.textContent('body');
  console.log('页面文本:', txt.substring(0, 400));

  const vanSteppers = await p.locator('van-stepper').count();
  const totalForms = await p.locator('.total-form').count();
  const loading = await p.locator('.van-loading').count();
  console.log('van-stepper:', vanSteppers, '| total-form:', totalForms, '| loading遮罩:', loading);

  // 截图
  await p.screenshot({ path: 'tangmeng_peer_eval.png' });

  // 尝试点击+号按钮
  if (vanSteppers > 0) {
    // 先获取stepper在shadow DOM里的按钮位置
    const btnPos = await p.evaluate(() => {
      const s = document.querySelector('van-stepper') as any;
      if (!s) return null;
      // Vant stepper minus在左边，plus在右边
      const plusBtn = s.shadowRoot?.querySelector('.van-stepper__plus') ||
                      document.querySelector('van-stepper .van-stepper__plus');
      if (!plusBtn) return null;
      const rect = plusBtn.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    console.log('Plus按钮位置:', JSON.stringify(btnPos));

    if (btnPos) {
      // 点击+号5次
      for (let i = 0; i < 5; i++) {
        await p.mouse.click(btnPos.x, btnPos.y);
        await p.waitForTimeout(200);
      }
      const scoreText = await p.locator('.total-num').first().textContent();
      console.log('点击+5后分值显示:', scoreText);
    } else {
      // shadow DOM穿透失败，用鼠标相对坐标点击
      const stepperBox = await p.locator('van-stepper').first().boundingBox();
      if (stepperBox) {
        console.log('stepper box:', JSON.stringify(stepperBox));
        // 点击右侧1/4处（+号区域）
        await p.mouse.click(stepperBox.x + stepperBox.width * 0.85, stepperBox.y + stepperBox.height / 2);
        await p.waitForTimeout(200);
        await p.mouse.click(stepperBox.x + stepperBox.width * 0.85, stepperBox.y + stepperBox.height / 2);
        await p.waitForTimeout(200);
        const scoreText = await p.locator('.total-num').first().textContent();
        console.log('点击+2后分值显示:', scoreText);
      }
    }

    await p.screenshot({ path: 'tangmeng_peer_after_click.png' });
  }

  // 直接API提交验证
  const submitR = await api.post('http://localhost:3000/api/v1/answer/total', {
    data: { relation_id: 144, score: 85, draft: false }
  }, { headers: { Authorization: 'Bearer ' + t } });
  const submitD = await submitR.json();
  console.log('API提交结果:', JSON.stringify(submitD));

  // 验证状态变化
  const relsR2 = await api.get('http://localhost:3000/api/v1/relation/my?batch_id=15', { headers: { Authorization: 'Bearer ' + t } });
  const relsD2 = await relsR2.json();
  const rel144 = (relsD2?.data?.list || []).find((r: any) => r.id === 144);
  console.log('提交后rel144:', JSON.stringify(rel144));

  await p.close();
  await b.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
