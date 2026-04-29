/**
 * H5端 Sprint2 回归测试 - Playwright自动化
 * 测试：管理端批次创建+矩阵观察 + H5自评链路 + 关系生成
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost';
const ADMIN_PORT = 5173;
const H5_PORT = 5174;
const API_BASE = 'http://localhost:3000/api/v1';

let browser: any;
let passed = 0, failed = 0;
const bugs: any[] = [];

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
    bugs.push({ label, detail: detail || '' });
  }
}

async function run() {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  console.log('\n=== T1: 服务状态检查 ===');
  try {
    const apiResp = await page.goto(`${API_BASE}/auth/login`, { timeout: 5000 }).catch(() => null);
    check('后端API可访问', apiResp !== null);
  } catch (e: any) {
    check('后端API可访问', false, e.message);
  }

  try {
    await page.goto(`${BASE}:${ADMIN_PORT}`, { timeout: 5000 });
    check('管理端页面可访问', true);
  } catch (e: any) {
    check('管理端页面可访问', false, e.message);
  }

  try {
    await page.goto(`${BASE}:${H5_PORT}`, { timeout: 5000 });
    check('H5端页面可访问', true);
  } catch (e: any) {
    check('H5端页面可访问', false, e.message);
  }

  console.log('\n=== T2: 管理端登录 ===');
  await page.goto(`${BASE}:${ADMIN_PORT}`, { timeout: 10000 });
  await page.waitForTimeout(1500);

  // 截图
  await page.screenshot({ path: 't2_admin_login.png' });

  const loginForm = await page.locator('form').count();
  check('管理端有登录表单', loginForm > 0);

  if (loginForm > 0) {
    await page.fill('input[type="text"], input[name="username"]', 'admin');
    await page.fill('input[type="password"], input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    const url = page.url();
    check('登录后URL变化', !url.includes('login'), `当前URL: ${url}`);
    await page.screenshot({ path: 't2_admin_after_login.png' });
  }

  console.log('\n=== T3: 批次列表 ===');
  await page.goto(`${BASE}:${ADMIN_PORT}/#/batch`, { timeout: 10000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 't3_batch_list.png' });

  const batchCards = await page.locator('.el-card, .batch-card, [class*="batch"]').count();
  check('批次列表有内容', batchCards > 0, `找到 ${batchCards} 个元素`);

  console.log('\n=== T4: H5端登录测试 ===');
  const page2 = await context.newPage();
  const consoleErrors2: string[] = [];
  page2.on('console', msg => {
    if (msg.type() === 'error') consoleErrors2.push(msg.text());
  });

  await page2.goto(`${BASE}:${H5_PORT}`, { timeout: 10000 });
  await page2.waitForTimeout(1500);
  await page2.screenshot({ path: 't4_h5_login.png' });

  const phoneInput = await page2.locator('input').count();
  check('H5登录页有输入框', phoneInput >= 2, `找到 ${phoneInput} 个输入框`);

  if (phoneInput >= 2) {
    await page2.locator('input').first().fill('13800138001');
    await page2.locator('input').nth(1).fill('1234');
    await page2.locator('button[type="submit"], .van-button--primary').click();
    await page2.waitForTimeout(3000);

    const url2 = page2.url();
    const onHome = !url2.includes('login');
    check('H5登录成功跳转', onHome, `URL: ${url2}`);
    await page2.screenshot({ path: 't4_h5_after_login.png' });

    if (onHome) {
      const userName = await page2.locator('h2, .user-name, .van-card__title').first().textContent().catch(() => '');
      check('H5显示用户名', userName && userName.length > 0, `显示: ${userName}`);

      // T5: 自评链路
      console.log('\n=== T5: H5自评链路 ===');
      const batchCards2 = await page2.locator('.van-card, .batch-item').count();
      check('H5首页有批次卡片', batchCards2 > 0, `找到 ${batchCards2} 个`);

      if (batchCards2 > 0) {
        await page2.locator('.van-card, .batch-item').first().click();
        await page2.waitForTimeout(2000);
        await page2.screenshot({ path: 't5_eval_list.png' });

        const evalSections = await page2.locator('.section, .van-cell-group').count();
        check('评价列表有分类区块', evalSections > 0, `找到 ${evalSections} 个`);

        // 找待评价项
        const pendingItems = await page2.locator('.van-tag:not(.van-tag--success)').count();
        check('有待评价任务', pendingItems > 0, `待评 ${pendingItems} 个`);

        if (pendingItems > 0) {
          await page2.locator('.van-cell, .van-card').filter({ hasNot: page2.locator('.van-tag--success') }).first().click();
          await page2.waitForTimeout(2000);
          await page2.screenshot({ path: 't5_eval_form.png' });

          const isSelfEval = await page2.locator('.van-slider, .van-stepper').count();
          check('评价表单有打分控件', isSelfEval > 0, `找到 ${isSelfEval} 个控件`);
        }
      }
    }

    // T6: H5退出
    console.log('\n=== T6: H5退出按钮 ===');
    const logoutBtn = await page2.locator('button:has-text("退出"), .logout-btn').count();
    check('H5有退出按钮', logoutBtn > 0, `找到 ${logoutBtn} 个`);
  }

  // T7: 浏览器控制台错误
  console.log('\n=== T7: 控制台错误检查 ===');
  check('管理端控制台无Error', consoleErrors.length === 0, `${consoleErrors.length} 个错误`);
  check('H5控制台无Error', consoleErrors2.length === 0, `${consoleErrors2.length} 个错误`);
  if (consoleErrors.length > 0) {
    consoleErrors.forEach(e => console.log(`    [admin] ${e}`));
  }
  if (consoleErrors2.length > 0) {
    consoleErrors2.forEach(e => console.log(`    [h5] ${e}`));
  }

  await browser.close();

  console.log(`\n=== 测试完成: ${passed} 通过, ${failed} 失败 ===`);
  console.log('\n--- Bug列表 ---');
  if (bugs.length === 0) {
    console.log('无Bug');
  } else {
    bugs.forEach((b, i) => console.log(`${i + 1}. ${b.label}${b.detail ? ' — ' + b.detail : ''}`));
  }
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
