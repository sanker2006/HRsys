/**
 * H5端 Sprint2 深度测试
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost';
let passed = 0;
let failed = 0;
const bugs: any[] = [];

async function run() {
  const context = await chromium.launch({ headless: true });
  let adminPage: any;
  let h5Page: any;

  function check(label: string, condition: boolean, detail?: string) {
    if (condition) { console.log('  ✅ ' + label); passed++; }
    else { console.log('  ❌ ' + label + (detail ? ' — ' + detail : '')); failed++; bugs.push({ label, detail: detail || '' }); }
  }

  // ===== DT1: 管理端评估矩阵3-Section布局 =====
  console.log('\n=== [DT1] 管理端评估矩阵 ===');
  adminPage = await context.newPage();
  const adminErrors: string[] = [];
  adminPage.on('console', (msg: any) => { if (msg.type() === 'error') adminErrors.push(msg.text()); });

  await adminPage.goto('http://localhost:5173', { timeout: 10000 });
  await adminPage.fill('input[type="text"], input[name="username"]', 'admin');
  await adminPage.fill('input[type="password"], input[name="password"]', 'admin123');
  await adminPage.click('button[type="submit"]');
  await adminPage.waitForTimeout(2000);
  await adminPage.screenshot({ path: 'dt1_admin_home.png' });

  // 导航到矩阵页面
  await adminPage.goto('http://localhost:5173/#/matrix', { timeout: 10000 });
  await adminPage.waitForTimeout(2500);
  await adminPage.screenshot({ path: 'dt1_eval_matrix.png' });

  const pageText = await adminPage.textContent('body');
  check('矩阵页包含"自评"字样', pageText.includes('自评'));
  check('矩阵页包含"互评"或"peer"字样', pageText.includes('互评') || pageText.includes('peer'));
  check('矩阵页包含"向下"或"downward"字样', pageText.includes('向下') || pageText.includes('downward'));

  const sections = await adminPage.locator('.section, .panel, [class*="section"], [class*="panel"]').count();
  console.log('  区块元素: ' + sections + ' 个');

  const switchEl = await adminPage.locator('.el-switch, .van-switch, [class*="switch"]').count();
  check('有本部门/全公司开关', switchEl > 0, '找到 ' + switchEl + ' 个');

  // ===== DT2: H5自评链路(张三丰) =====
  console.log('\n=== [DT2] H5自评链路(张三丰) ===');
  h5Page = await context.newPage();
  const h5Errors: string[] = [];
  h5Page.on('console', (msg: any) => { if (msg.type() === 'error') h5Errors.push(msg.text()); });

  await h5Page.goto('http://localhost:5174', { timeout: 10000 });
  await h5Page.waitForTimeout(1000);

  const inputs = await h5Page.locator('input').all();
  console.log('  H5登录页找到 ' + inputs.length + ' 个input');
  if (inputs.length >= 2) {
    await inputs[0].fill('13800138001');
    await inputs[1].fill('1234');
    await h5Page.locator('.van-button--primary, button[type="submit"]').click();
    await h5Page.waitForTimeout(3000);
  }

  await h5Page.screenshot({ path: 'dt2_h5_home.png' });
  const homeText = await h5Page.textContent('body');
  check('H5首页显示张三丰或批次信息', homeText.includes('张三丰') || homeText.includes('技术部') || homeText.includes('2026'));

  // 点击批次进入评价列表
  const batchCards = await h5Page.locator('.van-card');
  const batchCount2 = await batchCards.count();
  if (batchCount2 > 0) {
    await batchCards.first().click();
    await h5Page.waitForTimeout(2000);
    await h5Page.screenshot({ path: 'dt2_eval_list.png' });

    const evalListText = await h5Page.textContent('body');
    check('评价列表显示"自我评价"', evalListText.includes('自我评价'));
    check('评价列表显示"互评"', evalListText.includes('互评'));

    const pendingTag = h5Page.locator('.van-tag').filter({ hasText: '待评' });
    const pendingCount = await pendingTag.count();
    check('有待评价任务', pendingCount > 0, '待评: ' + pendingCount);

    // 点击第一个待评行
    const evalRows = h5Page.locator('.van-cell');
    const rowCount = await evalRows.count();
    console.log('  评价列表有 ' + rowCount + ' 行');

    let formFound = false;
    for (let i = 0; i < Math.min(rowCount, 8); i++) {
      const row = evalRows.nth(i);
      const hasPending = await row.locator('.van-tag').filter({ hasText: '待评' }).count();
      if (hasPending > 0) {
        await row.click();
        await h5Page.waitForTimeout(3000);
        await h5Page.screenshot({ path: 'dt2_eval_form.png' });
        formFound = true;

        const hasSlider = await h5Page.locator('.van-slider').count();
        const hasStepper = await h5Page.locator('.van-stepper').count();
        const hasContent = await h5Page.locator('.question-item, .van-cell, .van-field').count();
        const submitBtn = await h5Page.locator('button').filter({ hasText: '提交' }).count();

        console.log('  表单: slider=' + hasSlider + ', stepper=' + hasStepper + ', content=' + hasContent + ', submitBtn=' + submitBtn);
        check('评价表单有内容', hasContent > 0, '找到 ' + hasContent + ' 个元素');
        check('有提交按钮', submitBtn > 0, '找到 ' + submitBtn + ' 个');

        if (hasSlider > 0) {
          check('自评表单有Slider控件', true);
        } else if (hasStepper > 0) {
          check('互评/向下表单有Stepper控件', true);
        }
        break;
      }
    }
    if (!formFound) check('找到并点击了待评价行', false, '未找到待评价行');
  } else {
    check('H5首页有批次卡片', false, '找到 0 个');
  }

  // ===== DT3: 管理端关系生成 =====
  console.log('\n=== [DT3] 管理端关系生成 ===');
  await adminPage.goto('http://localhost:5173/#/relation', { timeout: 10000 });
  await adminPage.waitForTimeout(2000);
  await adminPage.screenshot({ path: 'dt3_relation_page.png' });

  const genBtn = await adminPage.locator('button').filter({ hasText: '生成' });
  const genBtnCount = await genBtn.count();
  console.log('  找到 ' + genBtnCount + ' 个生成按钮');

  if (genBtnCount > 0) {
    const batchSelect = adminPage.locator('.el-select').first();
    if (await batchSelect.count() > 0) {
      await batchSelect.click();
      await adminPage.waitForTimeout(500);
      const opts = adminPage.locator('.el-option');
      if (await opts.count() > 0) {
        await opts.first().click();
        await adminPage.waitForTimeout(500);
      }
    }
    await genBtn.first().click();
    await adminPage.waitForTimeout(3000);
    await adminPage.screenshot({ path: 'dt3_after_generate.png' });

    const resultText = await adminPage.textContent('body');
    const hasNumber = /\d+/.test(resultText);
    check('生成后页面有数字(关系数)', hasNumber);
  }

  // ===== DT4: 李四(manager)H5登录 =====
  console.log('\n=== [DT4] H5(李四-manager) ===');
  const h5Page2 = await context.newPage();
  await h5Page2.goto('http://localhost:5174', { timeout: 10000 });
  await h5Page2.waitForTimeout(1000);

  const inputs2 = await h5Page2.locator('input').all();
  if (inputs2.length >= 2) {
    await inputs2[0].fill('13800138002');
    await inputs2[1].fill('5678');
    await h5Page2.locator('.van-button--primary, button[type="submit"]').click();
    await h5Page2.waitForTimeout(3000);
  }

  await h5Page2.screenshot({ path: 'dt4_lisi_home.png' });
  const lisiText = await h5Page2.textContent('body');
  check('李四登录后显示李四或市场部', lisiText.includes('李四') || lisiText.includes('市场部'));

  const batchCards3 = await h5Page2.locator('.van-card');
  if (await batchCards3.count() > 0) {
    await batchCards3.first().click();
    await h5Page2.waitForTimeout(2000);
    await h5Page2.screenshot({ path: 'dt4_lisi_eval_list.png' });

    const lisiEvalText = await h5Page2.textContent('body');
    check('李四看到向下评估', lisiEvalText.includes('向下评估') || lisiEvalText.includes('向下'));
    check('李四看到同层互评', lisiEvalText.includes('互评'));
  }

  // ===== Bug分析总结 =====
  console.log('\n=== 控制台错误 ===');
  console.log('  管理端: ' + adminErrors.length + ' 个');
  adminErrors.forEach((e: string) => console.log('    ' + e));
  console.log('  H5: ' + h5Errors.length + ' 个');
  h5Errors.forEach((e: string) => console.log('    ' + e));

  if (adminErrors.length > 0) {
    bugs.push({ label: '管理端控制台Error', detail: adminErrors[0] });
  }

  await context.close();

  console.log('\n=== 深度测试完成: ' + passed + ' 通过, ' + failed + ' 失败 ===');
  console.log('\n--- Bug列表 ---');
  if (bugs.length === 0) {
    console.log('无Bug');
  } else {
    bugs.forEach((b: any, i: number) => console.log((i + 1) + '. ' + b.label + (b.detail ? ' — ' + b.detail : '')));
  }
}

run().catch((e: any) => { console.error('Fatal:', e.message); process.exit(1); });
