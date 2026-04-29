import { config } from './config/index.js';
import { initDb } from './db/index.js';
import app from './app.js';

async function main() {
  await initDb();
  app.listen(config.port, () => {
    console.log(`\n  HR-360 V2.0 后端服务已启动`);
    console.log(`  地址: http://localhost:${config.port}`);
    console.log(`  环境: ${config.isProduction ? 'production' : 'development'}\n`);
  });
}

main().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
