import type mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { closeDb, getMysqlPool, initDb } from '../db/index.js';

type CountRow = mysql.RowDataPacket & { total: number };
type ConflictRow = mysql.RowDataPacket & {
  batch_id: number;
  evaluator_id: number;
  target_id: number;
  evaluator_name: string;
  target_name: string;
};

export interface UpwardMigrationPreflight {
  relationCandidates: number;
  matrixCandidates: number;
  relationConflicts: ConflictRow[];
  matrixConflictBatchIds: number[];
  canApply: boolean;
}

export async function preflightUpwardMigration(): Promise<UpwardMigrationPreflight> {
  const pool = getMysqlPool();
  const [[relationCount], [matrixCount], [relationConflicts], [matrixConflicts]] = await Promise.all([
    pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total
         FROM relation r
         JOIN batch b ON b.id = r.batch_id
         JOIN app_user e ON e.id = r.evaluator_id
         JOIN app_user t ON t.id = r.target_id
        WHERE b.status IN ('draft', 'active')
          AND r.eval_type = 'peer'
          AND e.level = 'staff'
          AND t.level = 'manager'`
    ),
    pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total
         FROM eval_matrix m
         JOIN batch b ON b.id = m.batch_id
        WHERE b.status IN ('draft', 'active')
          AND m.from_role = 'staff'
          AND m.to_role = 'manager'
          AND m.eval_type = 'peer'`
    ),
    pool.query<ConflictRow[]>(
      `SELECT old_r.batch_id, old_r.evaluator_id, old_r.target_id,
              e.name AS evaluator_name, t.name AS target_name
         FROM relation old_r
         JOIN batch b ON b.id = old_r.batch_id
         JOIN app_user e ON e.id = old_r.evaluator_id
         JOIN app_user t ON t.id = old_r.target_id
         JOIN relation new_r
           ON new_r.batch_id = old_r.batch_id
          AND new_r.evaluator_id = old_r.evaluator_id
          AND new_r.target_id = old_r.target_id
          AND new_r.eval_type = 'upward'
        WHERE b.status IN ('draft', 'active')
          AND old_r.eval_type = 'peer'
          AND e.level = 'staff'
          AND t.level = 'manager'
        ORDER BY old_r.batch_id, old_r.evaluator_id, old_r.target_id`
    ),
    pool.query<(mysql.RowDataPacket & { batch_id: number })[]>(
      `SELECT DISTINCT old_m.batch_id
         FROM eval_matrix old_m
         JOIN batch b ON b.id = old_m.batch_id
         JOIN eval_matrix new_m
           ON new_m.batch_id = old_m.batch_id
          AND new_m.from_role = old_m.from_role
          AND new_m.to_role = old_m.to_role
          AND new_m.eval_type = 'upward'
        WHERE b.status IN ('draft', 'active')
          AND old_m.from_role = 'staff'
          AND old_m.to_role = 'manager'
          AND old_m.eval_type = 'peer'
        ORDER BY old_m.batch_id`
    ),
  ]);
  const matrixConflictBatchIds = matrixConflicts.map(row => Number(row.batch_id));
  return {
    relationCandidates: Number(relationCount[0]?.total ?? 0),
    matrixCandidates: Number(matrixCount[0]?.total ?? 0),
    relationConflicts,
    matrixConflictBatchIds,
    canApply: relationConflicts.length === 0 && matrixConflictBatchIds.length === 0,
  };
}

export async function applyUpwardMigration(preflight: UpwardMigrationPreflight) {
  if (!preflight.canApply) throw new Error('预检发现重复关系或矩阵配置，禁止执行迁移');
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [relations] = await connection.execute<mysql.ResultSetHeader>(
      `UPDATE relation r
         JOIN batch b ON b.id = r.batch_id
         JOIN app_user e ON e.id = r.evaluator_id
         JOIN app_user t ON t.id = r.target_id
          SET r.eval_type = 'upward', r.updated_at = CURRENT_TIMESTAMP
        WHERE b.status IN ('draft', 'active')
          AND r.eval_type = 'peer'
          AND e.level = 'staff'
          AND t.level = 'manager'`
    );
    const [matrix] = await connection.execute<mysql.ResultSetHeader>(
      `UPDATE eval_matrix m
         JOIN batch b ON b.id = m.batch_id
          SET m.eval_type = 'upward'
        WHERE b.status IN ('draft', 'active')
          AND m.from_role = 'staff'
          AND m.to_role = 'manager'
          AND m.eval_type = 'peer'`
    );
    await connection.execute(
      `INSERT INTO log (user_id, action, ip, detail)
       VALUES (NULL, 'relation.upward_migration', NULL, ?)`,
      [JSON.stringify({
        relations: relations.affectedRows,
        matrix_rows: matrix.affectedRows,
      })]
    );
    await connection.commit();
    return { relations: relations.affectedRows, matrixRows: matrix.affectedRows };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  await initDb({ ensureSchema: false });
  const preflight = await preflightUpwardMigration();
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'preflight',
    relation_candidates: preflight.relationCandidates,
    matrix_candidates: preflight.matrixCandidates,
    relation_conflicts: preflight.relationConflicts,
    matrix_conflict_batch_ids: preflight.matrixConflictBatchIds,
    can_apply: preflight.canApply,
  }, null, 2));
  if (!apply) return;
  const result = await applyUpwardMigration(preflight);
  console.log(`向上评价迁移完成：关系 ${result.relations} 条，矩阵 ${result.matrixRows} 条。`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
