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

function parseDateTime(value: string): Date | null {
  if (!value) return null;
  const normalized = value.trim().replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isExpired(batch: Pick<BatchRow, 'end_time' | 'status'>, now = new Date()): boolean {
  if (batch.status === 'closed') return true;
  const end = parseDateTime(batch.end_time);
  return !!end && now.getTime() >= end.getTime();
}

function hasStarted(batch: Pick<BatchRow, 'start_time'>, now = new Date()): boolean {
  const start = parseDateTime(batch.start_time);
  return !start || now.getTime() >= start.getTime();
}

function closeExpiredBatch(batch: BatchRow | undefined): BatchRow | undefined {
  if (!batch) return batch;
  if (batch.status !== 'closed' && isExpired(batch)) {
    getDb().run("UPDATE batch SET status = 'closed', updated_at = datetime('now') WHERE id = ?", [batch.id]);
    saveDb();
    return { ...batch, status: 'closed' };
  }
  return batch;
}

function closeAllExpired(): void {
  const rows = queryAll<BatchRow>("SELECT * FROM batch WHERE status != 'closed'");
  const expiredIds = rows.filter(row => isExpired(row)).map(row => row.id);
  if (expiredIds.length === 0) return;
  const placeholders = expiredIds.map(() => '?').join(',');
  getDb().run(
    `UPDATE batch SET status = 'closed', updated_at = datetime('now') WHERE id IN (${placeholders})`,
    expiredIds
  );
  saveDb();
}

export const BatchModel = {
  isExpired,
  hasStarted,

  assertAcceptingSubmissions(batchId: number): { ok: boolean; message?: string; batch?: BatchRow } {
    const batch = this.findById(batchId);
    if (!batch) return { ok: false, message: '批次不存在' };
    if (batch.status === 'closed') return { ok: false, message: '批次已结束，不能提交评价' };
    if (batch.status !== 'active') return { ok: false, message: '批次未启动，不能提交评价' };
    if (!hasStarted(batch)) return { ok: false, message: '批次尚未到开始时间，不能提交评价' };
    if (isExpired(batch)) return { ok: false, message: '批次已过结束时间，不能提交评价' };
    return { ok: true, batch };
  },

  findById(id: number): BatchRow | undefined {
    return closeExpiredBatch(queryOne<BatchRow>('SELECT * FROM batch WHERE id = ?', [id]));
  },

  findAll(filters?: { status?: string; keyword?: string }): BatchRow[] {
    closeAllExpired();
    let sql = 'SELECT * FROM batch WHERE 1=1';
    const params: any[] = [];
    if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
    if (filters?.keyword) { sql += ' AND name LIKE ?'; params.push(`%${filters.keyword}%`); }
    sql += ' ORDER BY created_at DESC';
    return queryAll<BatchRow>(sql, params);
  },

  count(filters?: { status?: string }): number {
    closeAllExpired();
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
    return closeExpiredBatch(batch)!;
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
    closeExpiredBatch(queryOne<BatchRow>('SELECT * FROM batch WHERE id = ?', [id]));
  },

  delete(id: number): void {
    getDb().run('DELETE FROM batch WHERE id = ?', [id]);
    saveDb();
  },

  getParticipantCount(batchId: number): number {
    const row = queryOne<{ total: number }>(
      `SELECT COUNT(DISTINCT evaluator_id) as total FROM relation WHERE batch_id = ?`,
      [batchId]
    );
    return row?.total ?? 0;
  },

  getCompletedCount(batchId: number): number {
    const row = queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM relation WHERE batch_id = ? AND status = 'completed'`,
      [batchId]
    );
    return row?.total ?? 0;
  },
};
