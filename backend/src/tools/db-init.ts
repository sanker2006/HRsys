import { initDb } from '../db/index.js';

await initDb();
console.log(JSON.stringify({
  ok: true,
  driver: process.env.DB_DRIVER || (process.env.DATABASE_URL ? 'postgres' : 'sqljs'),
}, null, 2));
