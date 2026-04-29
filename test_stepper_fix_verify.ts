import { chromium } from 'playwright';
import * as fs from 'fs';
import initSqlJs from 'sql.js';

async function resetRel145(): Promise<void> {
  const SQL = await initSqlJs();
  const dbBuf = fs.readFileSync('./backend/src/db/hr360.db');
  const db = new SQL.Database(dbBuf);
  db.run("UPDATE relation SET status='pending' WHERE id=145");
  db.run("DELETE FROM answer WHERE relation_id=145");
  fs.writeFileSync('./backend/src/db/hr360.db', db.export());
  db.close();
  console.log('relation 145 重置完成');
}

async function main() {
  // 1. 重置数据
  await resetRel145();

  // 2. 重启后端让新DB生效
  const { execSync: exec } = require('child_process');
  const pidResult = exec('netstat -ano | findstr ":3000.*LISTENING"', { encoding: 'utf8' });
  const pidMatch = pidResult.match(/LISTENING\s+(\d+)/);
  const oldPid = pidMatch ? parseInt(pidMatch[1]) : null;
  if (oldPid) {
    exec(`taskkill /PID ${oldPid} /F`, { stdio: 'ignore' });
    console.log('杀后端 PID:', oldPid);
  }
  await new Promise(r => setTimeout(r, 2000));
  exec('Start-Process -FilePath "D:\\HR开发\\hr-360\\backend\\node_modules\\.bin\\tsx.cmd" -ArgumentList "watch src/main.ts" -WorkingDirectory "D:\\HR开发\\hr-360\\backend" -WindowStyle Hidden', { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 6000));

  // 3. 登录获取 token
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext();

  const loginResp = await ctx.request.post('http://localhost:3000/api/v1/auth/h5-login', {
    data: { phone: '17365800273', idCardTail: '0273' }
  });
  const loginData = await loginResp.json();
  const token = loginData?.data?.token;
  console.log('登录成功, token:', token ? token.substring(0, 20) + '...' : '无');
  if (!token) { console.log('登录失败:', JSON.stringify(loginData)); await b.close(); return; }

  // 4. 先到首页，设置token，再导航到互评表单
  const p = await ctx.newPage();
  await p.goto('http://localhost:5174/', { timeout: 15000 });
  await p.waitForTimeout(3000);

  // 设置 token
  await p.evaluate((tok: string) => localStorage.setItem('h5_token', tok), token);
  await p.waitForTimeout(500);

  // 5. 直接去 eval-form/145（互评）
  await p.goto('http://localhost:5174/eval-form/145', { timeout: 15000 });
  await p.waitForTimeout(10000);

  // 6. 检查 Stepper
  const vanSteppers = await p.locator('van-stepper').count();
  const stepperW = await p.evaluate(() => (document.querySelector('van-stepper') as HTMLElement)?.offsetWidth ?? -1);
  const stepperH = await p.evaluate(() => (document.querySelector('van-stepper') as HTMLElement)?.offsetHeight ?? -1);
  const stepperShadow = await p.evaluate(() => {
    const s = document.querySelector('van-stepper') as any;
    return s?.shadowRoot ? '有shadowRoot, innerHTML=' + s.shadowRoot.innerHTML.substring(0, 200) : '无shadowRoot';
  });
  const pageText = await p.textContent('body');
  const totalNum = await p.locator('.total-num').textContent().catch(() => 'N/A');
  const evalInfo = await p.locator('.eval-info, .van-cell, [class*=info]').first().textContent().catch(() => 'N/A');

  console.log('van-stepper数量:', vanSteppers);
  console.log('stepper尺寸:', stepperW, 'x', stepperH);
  console.log('stepper shadowRoot:', stepperShadow);
  console.log('总分显示:', totalNum);
  console.log('评价信息:', evalInfo);
  console.log('页面文本片段:', pageText?.substring(0, 400));
  await p.screenshot({ path: 'peer_stepper_after_fix.png', fullPage: false });

  await p.close();
  await b.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
