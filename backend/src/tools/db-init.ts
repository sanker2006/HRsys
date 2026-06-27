import { closeDb, initDb } from '../db/index.js';

await initDb();
try {
  console.log(JSON.stringify({
    ok: true,
    driver: 'mysql',
    databaseUrl: process.env.DATABASE_URL || 'mysql://hrsys:hrsys@127.0.0.1:13306/hrsys',
  }, null, 2));
} finally {
  await closeDb();
}
