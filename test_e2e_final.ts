/**
 * H5 Sprint2 E2E测试 - 最终版
 */
import { chromium } from 'playwright';

const ADMIN = 'http://localhost:5173';
const H5 = 'http://localhost:5174';
const BATCH_ID = 15;

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const api = ctx.request as any;

  let passed = 0, failed = 0;
  const bugs: any[] = [];

  function check(label: string, condition: boolean, detail?: string) {
    if (condition) { console.log('  [PASS] ' + label); passed++; }
    else { console.log('  [FAIL] ' + label + (detail ? ' | ' + detail : '')); failed++; bugs.push({ label, detail: detail || '' }); }
  }

  async function post(path: string, data: any, token?: string) {
    const h: any = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return api.post('http://localhost:3000/api/v1' + path, { data, headers: h });
  }
  async function get(path: string, token?: string) {
    const h: any = {};
    if (token) h['Authorization'] = 'Bearer ' + token;
    return api.get('http://localhost:3000/api/v1' + path, { headers: h });
  }

  // ===== T1: 管理端矩阵页 =====
  console.log('\n== T1: 管理端矩阵页 ======================');
  await page.goto(ADMIN, { timeout: 10000 });
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  // SPA需要等路由初始化，直接goto带hash的URL
  await page.goto(ADMIN + '/matrix/' + BATCH_ID, { timeout: 10000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 't1_matrix_3section.png' });

  const bodyText = await page.textContent('body');
  check('矩阵页有"自评"区块', bodyText.includes('自评'));
  check('矩阵页有"互评"区块', bodyText.includes('互评'));
  check('矩阵页有"向下"区块', bodyText.includes('向下'));
  check('矩阵页有本部门/全公司开关', bodyText.includes('本部门') || bodyText.includes('全公司'));
  const tables = await page.locator('table, .el-table').count();
  check('矩阵页有表格', tables > 0, '找到 ' + tables + ' 个');
  console.log('  文本片段: ' + bodyText.substring(0, 150));

  // ===== T2: 关系页 =====
  console.log('\n== T2: 关系管理页 ======================');
  await page.goto(ADMIN + '/relation/' + BATCH_ID, { timeout: 10000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 't2_relation_page.png' });
  const relText = await page.textContent('body');
  check('关系页有生成按钮', relText.includes('自动生成') || relText.includes('生成关系'));

  // ===== T3: H5自评链路 - 张三丰 =====
  console.log('\n== T3: H5自评链路 - 张三丰 ======================');
  const h5 = await ctx.newPage();
  await h5.goto(H5, { timeout: 10000 });
  await h5.waitForTimeout(2000); // 等待Vue App初始化
  await h5.fill('input[type="tel"]', '13800138001');
  await h5.fill('input[type="text"]', '1234');
  await h5.locator('button').last().click();
  await h5.waitForTimeout(3000);
  await h5.screenshot({ path: 't3_h5_login.png' });

  const homeText = await h5.textContent('body');
  check('H5登录成功', homeText.includes('张三') || homeText.includes('技术部') || homeText.includes('待评价'));
  console.log('  URL: ' + h5.url());

  const loginR = await post('/auth/h5-login', { phone: '13800138001', idCardTail: '1234' });
  const loginD = await loginR.json();
  const token = loginD?.data?.token;
  console.log('  Token:', token ? 'OK' : 'FAIL');
  check('API登录成功', !!token);

  // 关键：等页面完全加载后，注入token到localStorage
  await h5.waitForLoadState('networkidle');
  await h5.evaluate((t: string) => localStorage.setItem('h5_token', t), token);
  await h5.waitForTimeout(500);

  if (token) {
    // 获取关系列表（结构: { data: { list: [...] } }）
    const relsR = await get('/relation/my?batch_id=' + BATCH_ID, token);
    const relsD = await relsR.json();
    const relsList: any[] = relsD?.data?.list || [];
    // 自评已完成（relation_id=142），改为验证已完成状态+答案数据
    const selfCompleted = relsList.find((r: any) => r.eval_type === 'self' && r.status === 'completed');
    console.log('  关系总数:', relsList.length, '| completed自评:', selfCompleted ? 'id=' + selfCompleted.id : '无');
    check('张三丰自评已完成', !!selfCompleted, selfCompleted ? 'relation_id=' + selfCompleted.id : '无completed自评');

    if (selfCompleted) {
      const answersR = await get('/answer/relation/' + selfCompleted.id, token);
      const answersD = await answersR.json();
      const answerList: any[] = answersD?.data?.answers || [];
      const questionList: any[] = answersD?.data?.questions || [];
      const submittedAns = answerList.filter((a: any) => a.is_draft === 0);
      const totalAns = answerList.find((a: any) => a.is_total === 1);
      console.log('  已提交答案数:', submittedAns.length, '| 总分:', totalAns?.score);
      check('自评有已提交答案', submittedAns.length > 0, 'count=' + submittedAns.length);
      check('自评总分>0', !!(totalAns && totalAns.score > 0), '总分=' + totalAns?.score);
      check('自评题目数=分题答案数', submittedAns.filter((a: any) => !a.is_total).length === questionList.length,
        '分题=' + submittedAns.filter((a: any) => !a.is_total).length + ' 题目=' + questionList.length);
    }
  }

  // ===== T4: H5向下评估 - 李四 =====
  console.log('\n== T4: H5向下评估 - 李四 ======================');
  await h5.close();

  const lisiLoginR = await post('/auth/h5-login', { phone: '13800138002', idCardTail: '5678' });
  const lisiD = await lisiLoginR.json();
  const lisiToken = lisiD?.data?.token;
  console.log('  李四Token:', lisiToken ? 'OK' : 'FAIL');
  check('李四API登录成功', !!lisiToken);

  if (lisiToken) {
    const lisiRelsR = await get('/relation/my?batch_id=' + BATCH_ID, lisiToken);
    const lisiRelsD = await lisiRelsR.json();
    const lisiList: any[] = lisiRelsD?.data?.list || [];
    const downPending = lisiList.filter((r: any) => r.eval_type === 'downward' && r.status === 'pending');
    console.log('  向下评估pending:', downPending.length);
    check('李四有pending向下评估', downPending.length > 0, 'count=' + downPending.length);

    if (downPending.length > 0) {
      const downRel = downPending[0];
      console.log('  向下关系: id=' + downRel.id + ' target=' + downRel.target_name);

      const h5_2 = await ctx.newPage();
      await h5_2.goto('http://localhost:5174/', { timeout: 10000 });
      await h5_2.waitForTimeout(2000);
      await h5_2.evaluate((t: string) => localStorage.setItem('h5_token', t), lisiToken);
      await h5_2.waitForTimeout(500);
      await h5_2.goto('http://localhost:5174/eval-form/' + downRel.id, { timeout: 10000 });
      // 监听API响应，最多等30秒（考虑CORS预检+实际请求）
      const respPromise = h5_2.waitForResponse('**/answer/relation/' + downRel.id, { timeout: 30000 }).catch(() => null);
      // 等stepper或加载状态出现
      try { await h5_2.locator('.van-stepper, .van-loading, .van-cell').waitFor({ timeout: 15000 }); } catch {}
      await respPromise;
      await h5_2.waitForTimeout(3000);
      console.log('  向下评估URL:', h5_2.url());
      await h5_2.screenshot({ path: 't4_downward_form.png' });

      // 注意：van-stepper 是自定义元素（不是CSS类），选择器用标签名不用点号
      const steppers = await h5_2.locator('van-stepper').count();
      check('向下评估有stepper控件', steppers > 0, 'count=' + steppers);

      if (steppers > 0) {
        // 通过JS获取stepper的内部值（shadow DOM穿透）
        const val = await h5_2.evaluate(() => {
          const stepper = document.querySelector('van-stepper');
          if (!stepper) return '0';
          const input = stepper.shadowRoot?.querySelector('input') || stepper.querySelector('input');
          return input ? input.value : '0';
        });
        console.log('  初始分值:', val);
        const target = 80;
        const current = parseInt(val) || 0;
        const clicks = Math.max(0, target - current);
        for (let i = 0; i < Math.min(clicks, 100); i++) {
          await h5_2.evaluate(() => {
            const plus = document.querySelector('van-stepper')?.shadowRoot?.querySelector('.van-stepper__plus') ||
                         document.querySelector('van-stepper .van-stepper__plus');
            if (plus) (plus as HTMLElement).click();
          });
          await h5_2.waitForTimeout(50);
        }
        const finalVal = await h5_2.evaluate(() => {
          const input = document.querySelector('van-stepper')?.shadowRoot?.querySelector('input') ||
                         document.querySelector('van-stepper input');
          return input ? (input as HTMLInputElement).value : '0';
        });
        console.log('  调整后分值:', finalVal);
        await h5_2.screenshot({ path: 't4_downward_filled.png' });

        const subR = await post('/answer/total', {
          relation_id: downRel.id,
          score: parseInt(val) || 80,
          draft: false
        }, lisiToken);
        const subD = await subR.json();
        console.log('  提交结果: code=' + subD.code + ' msg=' + subD.message);
        check('向下评估提交成功', subD.code === 0 || subD.code === 200, 'code=' + subD.code);

        await h5_2.waitForTimeout(500);
        await h5_2.screenshot({ path: 't4_downward_done.png' });

        const lisiRelsR2 = await get('/relation/my?batch_id=' + BATCH_ID, lisiToken);
        const lisiRelsD2 = await lisiRelsR2.json();
        const submittedDown = (lisiRelsD2?.data?.list || []).find((r: any) => r.id === downRel.id && r.status === 'completed');
        check('提交后向下评估状态为submitted', !!submittedDown);
        await h5_2.close();
      } else {
        await h5_2.close();
      }
    }
  }

  await browser.close();

  // ===== 报告 =====
  console.log('\n\n========== 最终测试报告 ==========');
  console.log('通过: ' + passed + ' | 失败: ' + failed + ' | 总计: ' + (passed + failed));
  if (bugs.length > 0) {
    console.log('\nBug列表:');
    bugs.forEach((b: any, i: number) => {
      console.log('  B' + (i+1) + '. [' + b.label + '] ' + b.detail);
    });
  } else {
    console.log('\n无Bug!');
  }
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
