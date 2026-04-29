import { config } from './config/index.js';
import { initDb } from './db/index.js';
import app from './app.js';

async function main() {
  try {
    await initDb();
    app.listen(config.port, () => {
      console.log('HR-360 Backend started on port ' + config.port);
    });
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
}

main();
