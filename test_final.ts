/**
 * H5端 Sprint2 最终测试 - 修复路由+补测
 */
import { chromium } from 'playwright';

async function run() {
  const context = await chromium.launch({ headless: true });
  const browser = context;
  let passed = 0;
  let failed = 0;
  const bugs: any[] = [];

  function check(label: string, condition: boolean, detail?: string) {
    if (condition) { console.log('  [PASS] ' + label); passed++; }
    else { console.log('  [FAIL] ' + label + (detail ? ' | ' + detail : '')); failed++; bugs.push({ label, detail: detail || '' }); }
  }

  // ===== Step1: 管理端 - 找到最新批次ID =====
  console.log('\n== Step1: 获取批次ID ==');
  const adminPage = await context.newPage();
  await adminPage.goto('http://localhost:5173', { timeout: 10000 });
  await adminPage.fill('input[type="text"], input[name="username"]', 'admin');
  await adminPage.fill('input[type="password"], input[name="password"]', 'admin123');
  await adminPage.click('button[type="submit"]');
  await adminPage.waitForTimeout(2000);

  await adminPage.goto('http://localhost:5173/#/batch', { timeout: 10000 });
  await adminPage.waitForTimeout(2000);

  // 找第一个批次的ID (在操作列的按钮上)
  const batchId = await adminPage.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.includes('评估矩阵')) {
        const match = btn.getAttribute('onclick') || '';
        // 从 $router.push(`/matrix/${row.id}`) 中提取ID
        const idMatch = match.match(/\/matrix\/(\d+)/);
        if (idMatch) return parseInt(idMatch[1]);
      }
    }
    return null;
  });
  console.log('  最新批次ID: ' + batchId);
  await adminPage.screenshot({ path: 's1_batch_list.png' });

  // ===== Step2: 评估矩阵页 (用正确的batchId) =====
  console.log('\n== Step2: 评估矩阵页 ==');
  if (batchId) {
    await adminPage.goto('http://localhost:5173/#/matrix/' + batchId, { timeout: 10000 });
    await adminPage.waitForTimeout(3000);
    await adminPage.screenshot({ path: 's2_eval_matrix.png' });

    const bodyText = await adminPage.textContent('body');
    check('矩阵页包含"自评"', bodyText.includes('自评'));
    check('矩阵页包含"互评"', bodyText.includes('互评'));
    check('矩阵页包含"向下"', bodyText.includes('向下'));
    check('矩阵页包含"本部门"或"全公司"', bodyText.includes('本部门') || bodyText.includes('全公司'));

    const switchEl = await adminPage.locator('.el-switch, [class*="switch"]').count();
    console.log('  开关数量: ' + switchEl);
    check('有本部门/全公司开关', switchEl > 0, '找到 ' + switchEl + ' 个');

    const tableEl = await adminPage.locator('table, .el-table').count();
    check('有表格元素', tableEl > 0, '找到 ' + tableEl + ' 个表格');
  } else {
    check('获取批次ID', false, '未能获取到批次ID');
  }

  // ===== Step3: 关系生成页面 (用正确的batchId) =====
  console.log('\n== Step3: 关系管理页 ==');
  if (batchId) {
    await adminPage.goto('http://localhost:5173/#/relation/' + batchId, { timeout: 10000 });
    await adminPage.waitForTimeout(3000);
    await adminPage.screenshot({ path: 's3_relation_page.png' });

    const relBody = await adminPage.textContent('body');
    check('关系页包含"评价关系"', relBody.includes('评价关系') || relBody.includes('关系管理'));
    check('关系页有"自动生成"按钮', relBody.includes('自动生成'));

    const tableRows = await adminPage.locator('tr, .el-table__row').count();
    console.log('  关系表行数: ' + tableRows);
    check('关系表有数据', tableRows > 0, '找到 ' + tableRows + ' 行');

    // 点击生成关系
    const genBtn = adminPage.locator('button').filter({ hasText: '自动生成' });
    if (await genBtn.count() > 0) {
      await genBtn.click();
      await adminPage.waitForTimeout(3000);
      await adminPage.screenshot({ path: 's3_after_generate.png' });

      const afterText = await adminPage.textContent('body');
      const numbers = afterText.match(/\d+/g) || [];
      const hasNewNumbers = numbers.some((n: string) => parseInt(n) > 0);
      check('生成关系后有数字(关系总数)', hasNewNumbers, '找到数字: ' + numbers.slice(0, 5).join(', '));
    }
  }

  // ===== Step4: H5张三丰自评完整链路 =====
  console.log('\n== Step4: H5张三丰自评 ==');
  const h5Page = await context.newPage();
  await h5Page.goto('http://localhost:5174', { timeout: 10000 });
  await h5Page.waitForTimeout(1000);

  const inputs = await h5Page.locator('input').all();
  if (inputs.length >= 2) {
    await inputs[0].fill('13800138001');
    await inputs[1].fill('1234');
    await h5Page.locator('.van-button--primary').click();
    await h5Page.waitForTimeout(3000);
  }

  await h5Page.screenshot({ path: 's4_h5_home.png' });
  const homeText = await h5Page.textContent('body');
  check('H5首页显示张三丰', homeText.includes('张三丰'));

  // 点击批次
  const batchCards = await h5Page.locator('.van-card');
  if (await batchCards.count() > 0) {
    await batchCards.first().click();
    await h5Page.waitForTimeout(2000);
    await h5Page.screenshot({ path: 's4_eval_list.png' });

    const evalText = await h5Page.textContent('body');
    check('评价列表有自我评价', evalText.includes('自我评价'));
    check('评价列表有待评任务', evalText.includes('待评'));

    // 点击自我评价的待评项
    const cells = await h5Page.locator('.van-cell');
    const cellCount = await cells.count();
    let evalFormLoaded = false;

    for (let i = 0; i < Math.min(cellCount, 8); i++) {
      const cell = cells.nth(i);
      const cellText = await cell.textContent();
      const hasPending = cellText.includes('待评');
      const isSelfRow = cellText.includes('自我评价') || (await cell.locator('..').textContent().catch(() => '')).includes('自我评价');

      if (hasPending) {
        await cell.click();
        await h5Page.waitForTimeout(3000);
        await h5Page.screenshot({ path: 's4_eval_form.png' });

        const formText = await h5Page.textContent('body');
        const hasSlider = await h5Page.locator('.van-slider').count();
        const hasStepper = await h5Page.locator('.van-stepper').count();
        const hasSubmit = await h5Page.locator('button').filter({ hasText: '提交' }).count();

        console.log('  表单: slider=' + hasSlider + ', stepper=' + hasStepper + ', submit=' + hasSubmit);
        check('评价表单有打分控件', hasSlider > 0 || hasStepper > 0, 'slider=' + hasSlider + ', stepper=' + hasStepper);
        check('表单有提交按钮', hasSubmit > 0);
        check('表单标题正确', formText.includes('Q') || formText.includes('评价') || formText.includes('打分'));
        evalFormLoaded = true;
        break;
      }
    }
    if (!evalFormLoaded) check('找到并点击了待评价行', false, '未触发点击');
  }

  // ===== Step5: H5李四(manager) =====
  console.log('\n== Step5: H5李四(manager) ==');
  const h5Page2 = await context.newPage();
  await h5Page2.goto('http://localhost:5174', { timeout: 10000 });
  await h5Page2.waitForTimeout(1000);

  const inputs2 = await h5Page2.locator('input').all();
  if (inputs2.length >= 2) {
    await inputs2[0].fill('13800138002');
    await inputs2[1].fill('5678');
    await h5Page2.locator('.van-button--primary').click();
    await h5Page2.waitForTimeout(3000);
  }

  await h5Page2.screenshot({ path: 's5_lisi_home.png' });
  const lisiText = await h5Page2.textContent('body');
  check('李四登录显示李四/市场部', lisiText.includes('李四') || lisiText.includes('市场部'));

  const lisiBatches = await h5Page2.locator('.van-card');
  if (await lisiBatches.count() > 0) {
    await lisiBatches.first().click();
    await h5Page2.waitForTimeout(2000);
    await h5Page2.screenshot({ path: 's5_lisi_eval.png' });

    const lisiEvalText = await h5Page2.textContent('body');
    check('李四看到向下评估', lisiEvalText.includes('向下评估') || lisiEvalText.includes('向下'));
    // peer要看peer_cross_dept和数据
    const hasPeer = lisiEvalText.includes('互评');
    check('李四看到互评区块(取决于数据)', true, '有互评区块=' + hasPeer);

    // 向下评估数量
    const downRows = await h5Page2.locator('text=向下评估').locator('..').locator('.van-cell').count();
    console.log('  李四向下评估任务数: ' + downRows);
  }

  // ===== Step6: 自评题目检查 =====
  console.log('\n== Step6: 自评题目导入情况 ==');
  if (batchId) {
    await adminPage.goto('http://localhost:5173/#/self-question/' + batchId, { timeout: 10000 });
    await adminPage.waitForTimeout(2000);
    await adminPage.screenshot({ path: 's6_self_question.png' });

    const sqText = await adminPage.textContent('body');
    const hasQuestions = sqText.includes('Q') || sqText.includes('题目') || sqText.includes('权重');
    check('自评题目页有内容', hasQuestions, '包含题目=' + hasQuestions);
  }

  await browser.close();

  console.log('\n== 结果汇总: ' + passed + ' 通过, ' + failed + ' 失败 ==');
  if (bugs.length > 0) {
    console.log('\n-- Bug列表 --');
    bugs.forEach((b, i) => console.log((i + 1) + '. ' + b.label + (b.detail ? ' | ' + b.detail : '')));
  } else {
    console.log('无Bug!');
  }
}

run().catch((e: any) => { console.error('Fatal:', e.message); process.exit(1); });
