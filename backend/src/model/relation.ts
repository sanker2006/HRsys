import { execute, queryAll, queryOne, transaction } from '../db/query.js';

export interface RelationRow {
  id: number;
  batch_id: number;
  evaluator_id: number;
  target_id: number;
  role_type: 'main_leader' | 'division_leader' | 'leader' | 'manager' | 'staff';
  eval_type: 'self' | 'peer' | 'upward' | 'downward';
  status: 'pending' | 'draft' | 'completed';
  is_anonymous: number;
  created_at: string;
  updated_at: string;
  evaluator_name?: string;
  evaluator_employee_no?: string;
  evaluator_department?: string;
  evaluator_position?: string;
  evaluator_level?: string;
  target_name?: string;
  target_employee_no?: string;
  target_department?: string;
  target_position?: string;
  target_level?: string;
}

const REL_SELECT = `
  r.id, r.batch_id, r.evaluator_id, r.target_id, r.role_type, r.eval_type,
  r.status, r.is_anonymous, r.created_at, r.updated_at,
  e.name as evaluator_name, e.employee_no as evaluator_employee_no, e.department as evaluator_department,
  e.position as evaluator_position, e.level as evaluator_level,
  t.name as target_name, t.employee_no as target_employee_no, t.department as target_department,
  t.position as target_position, t.level as target_level
`;

function placeholders(values: unknown[]): string {
  return values.map(() => '?').join(',');
}

function evalTypeCondition(evalType: string): string {
  if (evalType === 'upward') {
    return "(r.eval_type = 'upward' OR (r.eval_type = 'peer' AND e.level = 'staff' AND t.level = 'manager'))";
  }
  if (evalType === 'peer') {
    return "(r.eval_type = 'peer' AND NOT (e.level = 'staff' AND t.level = 'manager'))";
  }
  return 'r.eval_type = ?';
}

export const RelationModel = {
  findById(id: number): Promise<RelationRow | undefined> {
    return queryOne<RelationRow>(
      `SELECT ${REL_SELECT} FROM relation r
       JOIN app_user e ON r.evaluator_id = e.id
       JOIN app_user t ON r.target_id = t.id
       WHERE r.id = ?`,
      [id]
    );
  },

  findByBatchId(batchId: number, filters?: {
    evaluator_id?: number; target_id?: number; eval_type?: string; status?: string;
  }): Promise<RelationRow[]> {
    let sql = `SELECT ${REL_SELECT} FROM relation r
               JOIN app_user e ON r.evaluator_id = e.id
               JOIN app_user t ON r.target_id = t.id
               WHERE r.batch_id = ?`;
    const params: any[] = [batchId];
    if (filters?.evaluator_id) { sql += ' AND r.evaluator_id = ?'; params.push(filters.evaluator_id); }
    if (filters?.target_id) { sql += ' AND r.target_id = ?'; params.push(filters.target_id); }
    if (filters?.eval_type) {
      sql += ` AND ${evalTypeCondition(filters.eval_type)}`;
      if (!['peer', 'upward'].includes(filters.eval_type)) params.push(filters.eval_type);
    }
    if (filters?.status) { sql += ' AND r.status = ?'; params.push(filters.status); }
    sql += ' ORDER BY r.evaluator_id, r.eval_type, t.name';
    return queryAll<RelationRow>(sql, params);
  },

  async findByBatchPage(batchId: number, filters: {
    evaluator_id?: number; target_id?: number; eval_type?: string; status?: string;
  } = {}, page = 1, pageSize = 100): Promise<{ list: RelationRow[]; total: number }> {
    const where: string[] = ['r.batch_id = ?'];
    const params: any[] = [batchId];
    if (filters.evaluator_id) { where.push('r.evaluator_id = ?'); params.push(filters.evaluator_id); }
    if (filters.target_id) { where.push('r.target_id = ?'); params.push(filters.target_id); }
    if (filters.eval_type) {
      where.push(evalTypeCondition(filters.eval_type));
      if (!['peer', 'upward'].includes(filters.eval_type)) params.push(filters.eval_type);
    }
    if (filters.status) { where.push('r.status = ?'); params.push(filters.status); }

    const whereSql = where.join(' AND ');
    const totalRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM relation r
       JOIN app_user e ON r.evaluator_id = e.id
       JOIN app_user t ON r.target_id = t.id
       WHERE ${whereSql}`,
      params
    );
    const offset = (page - 1) * pageSize;
    const list = await queryAll<RelationRow>(
      `SELECT ${REL_SELECT} FROM relation r
       JOIN app_user e ON r.evaluator_id = e.id
       JOIN app_user t ON r.target_id = t.id
       WHERE ${whereSql}
       ORDER BY r.evaluator_id, r.eval_type, t.name
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    return { list, total: Number(totalRow?.total ?? 0) };
  },

  findByEvaluator(batchId: number, evaluatorId: number): Promise<RelationRow[]> {
    return queryAll<RelationRow>(
      `SELECT ${REL_SELECT} FROM relation r
       JOIN app_user e ON r.evaluator_id = e.id
       JOIN app_user t ON r.target_id = t.id
       WHERE r.batch_id = ? AND r.evaluator_id = ?
       ORDER BY r.eval_type, t.name`,
      [batchId, evaluatorId]
    );
  },

  findEvaluationContextRelations(batchId: number, targetIds: number[]): Promise<RelationRow[]> {
    const ids = [...new Set(targetIds)].filter(Number.isFinite);
    if (ids.length === 0) return Promise.resolve([]);
    const marks = placeholders(ids);
    return queryAll<RelationRow>(
      `SELECT ${REL_SELECT} FROM relation r
       JOIN app_user e ON r.evaluator_id = e.id
       JOIN app_user t ON r.target_id = t.id
       WHERE r.batch_id = ?
         AND (
           (r.eval_type = 'self' AND r.evaluator_id = r.target_id AND r.target_id IN (${marks}))
           OR
           (r.eval_type = 'downward' AND e.level = 'manager' AND r.target_id IN (${marks}))
           OR
           (r.eval_type = 'peer' AND e.level = t.level AND r.target_id IN (${marks}))
         )
         AND r.status = 'completed'
       ORDER BY r.evaluator_id, r.eval_type, t.name, r.id`,
      [batchId, ...ids, ...ids, ...ids]
    );
  },

  async findIncomingPeerCompletion(
    batchId: number,
    targetIds: number[]
  ): Promise<Array<{ target_id: number; total: number; completed: number }>> {
    const ids = [...new Set(targetIds)].filter(Number.isFinite);
    if (ids.length === 0) return [];
    return queryAll<{ target_id: number; total: number; completed: number }>(
      `SELECT r.target_id,
              COUNT(*) AS total,
              SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) AS completed
         FROM relation r
         JOIN app_user e ON e.id = r.evaluator_id
         JOIN app_user t ON t.id = r.target_id
        WHERE r.batch_id = ?
          AND r.eval_type = 'peer'
          AND e.level = t.level
          AND r.target_id IN (${placeholders(ids)})
        GROUP BY r.target_id`,
      [batchId, ...ids]
    );
  },

  async findManagerStaffCompletion(
    batchId: number,
    managerIds: number[]
  ): Promise<Array<{ manager_id: number; total: number; completed: number }>> {
    const ids = [...new Set(managerIds)].filter(Number.isFinite);
    if (ids.length === 0) return [];
    return queryAll<{ manager_id: number; total: number; completed: number }>(
      `SELECT r.evaluator_id AS manager_id,
              COUNT(*) AS total,
              SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM relation r
       JOIN app_user t ON r.target_id = t.id
       WHERE r.batch_id = ?
         AND r.eval_type = 'downward'
         AND r.evaluator_id IN (${placeholders(ids)})
         AND t.level = 'staff'
       GROUP BY r.evaluator_id`,
      [batchId, ...ids]
    );
  },

  async count(batchId: number, filters?: { status?: string }): Promise<number> {
    let sql = 'SELECT COUNT(*) as total FROM relation WHERE batch_id = ?';
    const params: any[] = [batchId];
    if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
    const row = await queryOne<{ total: number }>(sql, params);
    return Number(row?.total ?? 0);
  },

  async create(data: {
    batch_id: number; evaluator_id: number; target_id: number;
    role_type: string; eval_type: string; status?: string;
  }): Promise<RelationRow> {
    await execute(
      `INSERT INTO relation (batch_id, evaluator_id, target_id, role_type, eval_type, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.batch_id, data.evaluator_id, data.target_id,
       data.role_type, data.eval_type, data.status ?? 'pending']
    );
    const row = await queryOne<RelationRow>('SELECT * FROM relation ORDER BY id DESC LIMIT 1');
    if (!row) throw new Error('创建关系失败');
    return row;
  },

  async batchCreate(relations: Array<{
    batch_id: number; evaluator_id: number; target_id: number;
    role_type: string; eval_type: string;
  }>): Promise<{ success: number; errors: Array<{ message: string }> }> {
    const errors: Array<{ message: string }> = [];
    let success = 0;
    await transaction(async tx => {
      for (const r of relations) {
        try {
          const existing = await tx.queryOne<{ id: number }>(
            'SELECT id FROM relation WHERE batch_id=? AND evaluator_id=? AND target_id=? AND eval_type=?',
            [r.batch_id, r.evaluator_id, r.target_id, r.eval_type]
          );
          if (existing) continue;
          await tx.execute(
            `INSERT INTO relation (batch_id, evaluator_id, target_id, role_type, eval_type) VALUES (?, ?, ?, ?, ?)`,
            [r.batch_id, r.evaluator_id, r.target_id, r.role_type, r.eval_type]
          );
          success++;
        } catch (err: any) {
          errors.push({ message: err.message });
        }
      }
    });
    return { success, errors };
  },

  updateStatus(id: number, status: string): Promise<void> {
    return execute("UPDATE relation SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
  },

  delete(id: number): Promise<void> {
    return execute('DELETE FROM relation WHERE id = ?', [id]);
  },

  async hasAnswers(id: number): Promise<boolean> {
    const row = await queryOne<{ total: number }>(
      'SELECT COUNT(*) as total FROM answer WHERE relation_id = ?',
      [id]
    );
    return Number(row?.total ?? 0) > 0;
  },

  async getStats(batchId: number): Promise<{
    total: number; completed: number; pending: number; draft: number;
  }> {
    const rows = await queryAll<{ status: string; total: number }>(
      'SELECT status, COUNT(*) as total FROM relation WHERE batch_id = ? GROUP BY status',
      [batchId]
    );
    const stats = { total: 0, completed: 0, pending: 0, draft: 0 };
    for (const row of rows) {
      const count = Number(row.total);
      stats.total += count;
      if (row.status === 'completed') stats.completed = count;
      else if (row.status === 'pending') stats.pending = count;
      else if (row.status === 'draft') stats.draft = count;
    }
    return stats;
  },
};
