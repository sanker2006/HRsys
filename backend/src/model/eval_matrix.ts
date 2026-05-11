import { getDb, saveDb } from '../db/index.js';
import { queryAll, queryOne } from '../db/query.js';

export type MatrixRole = 'main_leader' | 'division_leader' | 'manager' | 'staff';

export interface EvalMatrixRow {
  id: number;
  batch_id: number;
  from_role: MatrixRole;
  to_role: MatrixRole | 'self';
  eval_type: 'self' | 'peer' | 'downward';
  enabled: number;
  created_at: string;
}

const DEFAULT_MATRIX: Omit<EvalMatrixRow, 'id' | 'batch_id' | 'created_at'>[] = [
  { from_role: 'main_leader',     to_role: 'manager', eval_type: 'downward', enabled: 1 },
  { from_role: 'main_leader',     to_role: 'staff',   eval_type: 'downward', enabled: 1 },
  { from_role: 'division_leader', to_role: 'manager', eval_type: 'downward', enabled: 1 },
  { from_role: 'division_leader', to_role: 'staff',   eval_type: 'downward', enabled: 1 },
  { from_role: 'manager',         to_role: 'manager', eval_type: 'peer',     enabled: 1 },
  { from_role: 'manager',         to_role: 'staff',   eval_type: 'downward', enabled: 1 },
  { from_role: 'manager',         to_role: 'self',    eval_type: 'self',     enabled: 1 },
  { from_role: 'staff',           to_role: 'staff',   eval_type: 'peer',     enabled: 1 },
  { from_role: 'staff',           to_role: 'manager', eval_type: 'peer',     enabled: 1 },
  { from_role: 'staff',           to_role: 'self',    eval_type: 'self',     enabled: 1 },
];

export const EvalMatrixModel = {
  findByBatchId(batchId: number): EvalMatrixRow[] {
    return queryAll<EvalMatrixRow>(
      'SELECT * FROM eval_matrix WHERE batch_id = ? ORDER BY from_role, to_role',
      [batchId]
    );
  },

  findByBatchAndRoles(batchId: number, fromRole: string, toRole: string): EvalMatrixRow | undefined {
    return queryOne<EvalMatrixRow>(
      'SELECT * FROM eval_matrix WHERE batch_id = ? AND from_role = ? AND to_role = ?',
      [batchId, fromRole, toRole]
    );
  },

  deleteByBatchId(batchId: number): void {
    getDb().run('DELETE FROM eval_matrix WHERE batch_id = ?', [batchId]);
    saveDb();
  },

  initDefaultMatrix(batchId: number): void {
    const db = getDb();
    for (const row of DEFAULT_MATRIX) {
      db.run(
        `INSERT INTO eval_matrix (batch_id, from_role, to_role, eval_type, enabled) VALUES (?, ?, ?, ?, ?)`,
        [batchId, row.from_role, row.to_role, row.eval_type, row.enabled]
      );
    }
    saveDb();
  },

  saveMatrix(batchId: number, rows: Array<{
    from_role: string; to_role: string; eval_type: string; enabled: number;
  }>): void {
    getDb().run('DELETE FROM eval_matrix WHERE batch_id = ?', [batchId]);
    const db = getDb();
    for (const row of rows) {
      db.run(
        `INSERT INTO eval_matrix (batch_id, from_role, to_role, eval_type, enabled) VALUES (?, ?, ?, ?, ?)`,
        [batchId, row.from_role, row.to_role, row.eval_type, row.enabled]
      );
    }
    saveDb();
  },

  findEnabledByBatchId(batchId: number): EvalMatrixRow[] {
    return queryAll<EvalMatrixRow>(
      'SELECT * FROM eval_matrix WHERE batch_id = ? AND enabled = 1',
      [batchId]
    );
  },
};
