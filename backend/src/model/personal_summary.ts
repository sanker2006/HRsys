import { execute, queryAll, queryOne } from '../db/query.js';

export interface PersonalSummaryMetadata {
  id: number;
  batch_id: number;
  user_id: number;
  original_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalSummaryFile extends PersonalSummaryMetadata {
  file_data: Buffer;
}

export interface PersonalSummaryAdminRow {
  user_id: number;
  name: string;
  employee_no: string;
  department: string;
  position: string;
  level: string;
  has_summary: number;
  original_name: string | null;
  file_size: number | null;
  uploaded_at: string | null;
}

export interface PersonalSummaryFilters {
  keyword?: string;
  department?: string;
  upload_status?: 'uploaded' | 'missing';
}

const PARTICIPANTS_SQL = `
  SELECT user_id FROM self_question WHERE batch_id = ?
  UNION
  SELECT target_id AS user_id FROM relation WHERE batch_id = ?
  UNION
  SELECT user_id FROM personal_summary WHERE batch_id = ?
  UNION
  SELECT u.id AS user_id
    FROM app_user u
    JOIN batch b ON b.id = ?
   WHERE b.status <> 'closed'
     AND u.is_admin = 0
     AND u.level = 'manager'
     AND u.status = 'active'
`;

function filterSql(filters: PersonalSummaryFilters): { sql: string; params: Array<string> } {
  const where: string[] = [];
  const params: string[] = [];
  if (filters.keyword) {
    where.push('(u.name LIKE ? OR u.employee_no LIKE ?)');
    params.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
  }
  if (filters.department) {
    where.push('u.department = ?');
    params.push(filters.department);
  }
  if (filters.upload_status === 'uploaded') where.push('ps.id IS NOT NULL');
  if (filters.upload_status === 'missing') where.push('ps.id IS NULL');
  return { sql: where.length ? ` AND ${where.join(' AND ')}` : '', params };
}

export const PersonalSummaryModel = {
  findMetadata(batchId: number, userId: number): Promise<PersonalSummaryMetadata | undefined> {
    return queryOne<PersonalSummaryMetadata>(
      `SELECT id, batch_id, user_id, original_name, mime_type, file_size,
              uploaded_by, created_at, updated_at
         FROM personal_summary
        WHERE batch_id = ? AND user_id = ?`,
      [batchId, userId]
    );
  },

  findFile(batchId: number, userId: number): Promise<PersonalSummaryFile | undefined> {
    return queryOne<PersonalSummaryFile>(
      'SELECT * FROM personal_summary WHERE batch_id = ? AND user_id = ?',
      [batchId, userId]
    );
  },

  async isParticipant(batchId: number, userId: number): Promise<boolean> {
    const row = await queryOne<{ user_id: number }>(
      `SELECT p.user_id FROM (${PARTICIPANTS_SQL}) p WHERE p.user_id = ? LIMIT 1`,
      [batchId, batchId, batchId, batchId, userId]
    );
    return !!row;
  },

  async listAdmin(
    batchId: number,
    filters: PersonalSummaryFilters,
    page: number,
    pageSize: number
  ): Promise<{
    list: PersonalSummaryAdminRow[];
    total: number;
    summary: { total: number; uploaded: number; missing: number };
  }> {
    const filtered = filterSql(filters);
    const baseParams = [batchId, batchId, batchId, batchId];
    const baseFrom = `
      FROM (${PARTICIPANTS_SQL}) p
      JOIN app_user u ON u.id = p.user_id
      LEFT JOIN personal_summary ps ON ps.batch_id = ? AND ps.user_id = p.user_id
      WHERE u.is_admin = 0 AND u.level IN ('manager', 'staff')
    `;
    const params = [...baseParams, batchId, ...filtered.params];
    const totalRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total ${baseFrom}${filtered.sql}`,
      params
    );
    const offset = (page - 1) * pageSize;
    const list = await queryAll<PersonalSummaryAdminRow>(
      `SELECT u.id AS user_id, u.name, u.employee_no, u.department, u.position, u.level,
              CASE WHEN ps.id IS NULL THEN 0 ELSE 1 END AS has_summary,
              ps.original_name, ps.file_size, ps.updated_at AS uploaded_at
         ${baseFrom}${filtered.sql}
        ORDER BY u.department, u.employee_no
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const stats = await queryOne<{ total: number; uploaded: number }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN ps.id IS NULL THEN 0 ELSE 1 END) AS uploaded
         ${baseFrom}`,
      [...baseParams, batchId]
    );
    const total = Number(stats?.total ?? 0);
    const uploaded = Number(stats?.uploaded ?? 0);
    return {
      list,
      total: Number(totalRow?.total ?? 0),
      summary: { total, uploaded, missing: total - uploaded },
    };
  },

  upsert(data: {
    batchId: number;
    userId: number;
    originalName: string;
    mimeType: string;
    fileData: Buffer;
    uploadedBy: number;
  }): Promise<void> {
    return execute(
      `INSERT INTO personal_summary
         (batch_id, user_id, original_name, mime_type, file_size, file_data, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         original_name = VALUES(original_name), mime_type = VALUES(mime_type),
         file_size = VALUES(file_size), file_data = VALUES(file_data),
         uploaded_by = VALUES(uploaded_by), updated_at = CURRENT_TIMESTAMP`,
      [data.batchId, data.userId, data.originalName, data.mimeType,
       data.fileData.length, data.fileData, data.uploadedBy]
    );
  },

  delete(batchId: number, userId: number): Promise<void> {
    return execute('DELETE FROM personal_summary WHERE batch_id = ? AND user_id = ?', [batchId, userId]);
  },
};
