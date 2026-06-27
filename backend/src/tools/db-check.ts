import { closeDb, initDb } from '../db/index.js';
import { queryOne } from '../db/query.js';

const tables = [
  'department',
  'app_user',
  'division_leader_department',
  'batch',
  'eval_matrix',
  'relation',
  'self_question',
  'answer',
  'log',
  'intern_user',
  'intern_attendance_record',
  'intern_attendance_adjustment',
];

await initDb();

try {
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const row = await queryOne<{ total: number }>(`SELECT COUNT(*) as total FROM ${table}`);
    counts[table] = Number(row?.total ?? 0);
  }

  const activeBatch = await queryOne<{ id: number; name: string; status: string }>(
    "SELECT id, name, status FROM batch WHERE status = 'active' ORDER BY id DESC LIMIT 1"
  );
  const staffManagerPeer = activeBatch
    ? Number((await queryOne<{ total: number }>(
        `SELECT COUNT(*) as total
         FROM relation r
         JOIN app_user e ON e.id = r.evaluator_id
         JOIN app_user t ON t.id = r.target_id
         WHERE r.batch_id = ? AND r.eval_type = 'peer' AND e.level = 'staff' AND t.level = 'manager'`,
        [activeBatch.id]
      ))?.total ?? 0)
    : 0;

  const activeInterns = Number((await queryOne<{ total: number }>(
    "SELECT COUNT(*) as total FROM intern_user WHERE status = 'active'"
  ))?.total ?? 0);

  console.log(JSON.stringify({
    ok: true,
    driver: 'mysql',
    counts,
    activeBatch,
    staffManagerPeer,
    activeInterns,
  }, null, 2));
} finally {
  await closeDb();
}
