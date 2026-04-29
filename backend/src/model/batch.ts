import { getDb, saveDb } from '../db/index.js';
import { queryAll, queryOne } from '../db/query.js';

export interface BatchRow {
  id: number;
  name: string;
  period: string;
  start_time: string;
  end_time: string;
  status: 'draft' | 'active' | 'closed';
  peer_cross_dept: number;
  created_at: string;
  updated_at: string;
}

export const BatchModel = {
  findById(id: number): BatchRow | undefined {
    return queryOne<BatchRow>('SELECT * FROM batch WHERE id = ?', [id]);
  },

  findAll(filters?: { status?: string; keyword?: string }): BatchRow[] {
    let sql = 'SELECT * FROM batch WHERE 1=1';
    const params: any[] = [];
    if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
    if (filters?.keyword) { sql += ' AND name LIKE ?'; params.push(`%${filters.keyword}%`); }
    sql += ' ORDER BY created_at DESC';
    return queryAll<BatchRow>(sql, params);
  },

  count(filters?: { status?: string }): number {
    let sql = 'SELECT COUNT(*) as total FROM batch WHERE 1=1';
    const params: any[] = [];
    if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
    const row = queryOne<{ total: number }>(sql, params);
    return row?.total ?? 0;
  },

  create(data: {
    name: string; period?: string; start_time: string; end_time: string;
    peer_cross_dept?: number;
  }): BatchRow {
    const db = getDb();
    db.run(
      `INSERT INTO batch (name, period, start_time, end_time, peer_cross_dept, status) VALUES (?, ?, ?, ?, ?, 'draft')`,
      [data.name, data.period ?? '', data.start_time, data.end_time, data.peer_cross_dept ?? 0]
    );
    saveDb();
    const batch = queryOne<BatchRow>('SELECT * FROM batch ORDER BY id DESC LIMIT 1');
    if (!batch) throw new Error('创建批次失败');
    return batch;
  },

  update(id: number, data: Partial<{
    name: string; period: string; start_time: string; end_time: string;
    status: string; peer_cross_dept: number;
  }>): void {
    const fields: string[] = [];
    const params: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.period !== undefined) { fields.push('period = ?'); params.push(data.period); }
    if (data.start_time !== undefined) { fields.push('start_time = ?'); params.push(data.start_time); }
    if (data.end_time !== undefined) { fields.push('end_time = ?'); params.push(data.end_time); }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.peer_cross_dept !== undefined) { fields.push('peer_cross_dept = ?'); params.push(data.peer_cross_dept); }
    if (fields.length === 0) return;
    fields.push("updated_at = datetime('now')");
    params.push(id);
    getDb().run(`UPDATE batch SET ${fields.join(', ')} WHERE id = ?`, params);
    saveDb();
  },

  delete(id: number): void {
    getDb().run('DELETE FROM batch WHERE id = ?', [id]);
    saveDb();
  },

  // 获取批次的参与人数
  getParticipantCount(batchId: number): number {
    const row = queryOne<{ total: number }>(
      `SELECT COUNT(DISTINCT evaluator_id) as total FROM relation WHERE batch_id = ?`,
      [batchId]
    );
    return row?.total ?? 0;
  },

  // 获取批次的已完成评价数
  getCompletedCount(batchId: number): number {
    const row = queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM relation WHERE batch_id = ? AND status = 'completed'`,
      [batchId]
    );
    return row?.total ?? 0;
  },
};
