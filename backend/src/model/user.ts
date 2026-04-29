import { getDb, saveDb } from '../db/index.js';
import { queryAll, queryOne } from '../db/query.js';

export interface UserRow {
  id: number;
  name: string;
  employee_no: string;
  department: string;
  position: string;
  level: string;
  phone: string;
  id_card_tail: string;
  password: string;
  is_admin: number;
  created_at: string;
  updated_at: string;
}

export interface UserPublic {
  id: number;
  name: string;
  employee_no: string;
  department: string;
  position: string;
  level: string;
  phone: string;
  id_card_tail: string;
  is_admin: number;
  created_at: string;
}

function toPublic(row: UserRow): UserPublic {
  const { password: _, ...pub } = row;
  return pub as UserPublic;
}

export const UserModel = {
  findById(id: number): UserRow | undefined {
    return queryOne<UserRow>('SELECT * FROM app_user WHERE id = ?', [id]);
  },

  findByPhone(phone: string): UserRow | undefined {
    return queryOne<UserRow>('SELECT * FROM app_user WHERE phone = ?', [phone]);
  },

  findByPhoneAndIdCard(phone: string, idCardTail: string): UserRow | undefined {
    return queryOne<UserRow>('SELECT * FROM app_user WHERE phone = ? AND id_card_tail = ?', [phone, idCardTail]);
  },

  findByPhoneAndIdCardExclude(phone: string, idCardTail: string, excludeId: number): UserRow | undefined {
    return queryOne<UserRow>('SELECT * FROM app_user WHERE phone = ? AND id_card_tail = ? AND id != ?', [phone, idCardTail, excludeId]);
  },

  findByEmployeeNo(employeeNo: string): UserRow | undefined {
    return queryOne<UserRow>('SELECT * FROM app_user WHERE employee_no = ?', [employeeNo]);
  },

  findByAccount(account: string): UserRow | undefined {
    return queryOne<UserRow>(
      'SELECT * FROM app_user WHERE (employee_no = ? OR phone = ?) AND is_admin = 1',
      [account, account]
    );
  },

  findAll(filters?: { department?: string; level?: string; keyword?: string }): UserRow[] {
    let sql = 'SELECT * FROM app_user WHERE 1=1';
    const params: any[] = [];
    if (filters?.department) { sql += ' AND department = ?'; params.push(filters.department); }
    if (filters?.level) { sql += ' AND level = ?'; params.push(filters.level); }
    if (filters?.keyword) { sql += ' AND (name LIKE ? OR employee_no LIKE ?)'; params.push(`%${filters.keyword}%`, `%${filters.keyword}%`); }
    sql += ' ORDER BY created_at DESC';
    return queryAll<UserRow>(sql, params);
  },

  findPage(filters: { department?: string; level?: string; keyword?: string } = {}, page = 1, pageSize = 20): {
    list: UserRow[];
    total: number;
  } {
    let sql = 'SELECT * FROM app_user WHERE 1=1';
    const params: any[] = [];
    if (filters.department) { sql += ' AND department = ?'; params.push(filters.department); }
    if (filters.level) { sql += ' AND level = ?'; params.push(filters.level); }
    if (filters.keyword) { sql += ' AND (name LIKE ? OR employee_no LIKE ?)'; params.push(`%${filters.keyword}%`, `%${filters.keyword}%`); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = queryOne<{ total: number }>(countSql, params)?.total ?? 0;
    const offset = (page - 1) * pageSize;
    const list = queryAll<UserRow>(
      `${sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    return { list, total };
  },

  count(filters?: { department?: string; level?: string; keyword?: string }): number {
    let sql = 'SELECT COUNT(*) as total FROM app_user WHERE 1=1';
    const params: any[] = [];
    if (filters?.department) { sql += ' AND department = ?'; params.push(filters.department); }
    if (filters?.level) { sql += ' AND level = ?'; params.push(filters.level); }
    if (filters?.keyword) { sql += ' AND (name LIKE ? OR employee_no LIKE ?)'; params.push(`%${filters.keyword}%`, `%${filters.keyword}%`); }
    const row = queryOne<{ total: number }>(sql, params);
    return row?.total ?? 0;
  },

  findDepartments(): string[] {
    const rows = queryAll<{ department: string }>('SELECT DISTINCT department FROM app_user ORDER BY department');
    return rows.map(r => r.department);
  },

  create(data: {
    name: string; employee_no: string; department: string; position: string;
    level: string; phone: string; id_card_tail: string; password: string; is_admin?: number;
  }): UserRow {
    const existing = this.findByPhoneAndIdCard(data.phone, data.id_card_tail);
    if (existing) throw new Error(`手机号 ${data.phone} + 身份证后四位 ${data.id_card_tail} 已被用户「${existing.name}」使用`);
    const db = getDb();
    db.run(
      `INSERT INTO app_user (name, employee_no, department, position, level, phone, id_card_tail, password, is_admin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.employee_no, data.department, data.position, data.level, data.phone, data.id_card_tail, data.password, data.is_admin ?? 0]
    );
    saveDb();
    const user = this.findByEmployeeNo(data.employee_no);
    if (!user) throw new Error('创建用户后无法获取记录');
    return user;
  },

  update(id: number, data: Partial<{
    name: string; department: string; position: string; level: string;
    phone: string; id_card_tail: string; password: string; is_admin: number;
  }>): void {
    // 修改 phone 或 id_card_tail 时校验唯一性
    if (data.phone !== undefined || data.id_card_tail !== undefined) {
      const current = this.findById(id);
      if (current) {
        const phone = data.phone ?? current.phone;
        const idCardTail = data.id_card_tail ?? current.id_card_tail;
        const conflict = this.findByPhoneAndIdCardExclude(phone, idCardTail, id);
        if (conflict) throw new Error(`手机号 ${phone} + 身份证后四位 ${idCardTail} 已被用户「${conflict.name}」使用`);
      }
    }
    const fields: string[] = [];
    const params: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.department !== undefined) { fields.push('department = ?'); params.push(data.department); }
    if (data.position !== undefined) { fields.push('position = ?'); params.push(data.position); }
    if (data.level !== undefined) { fields.push('level = ?'); params.push(data.level); }
    if (data.phone !== undefined) { fields.push('phone = ?'); params.push(data.phone); }
    if (data.id_card_tail !== undefined) { fields.push('id_card_tail = ?'); params.push(data.id_card_tail); }
    if (data.password !== undefined) { fields.push('password = ?'); params.push(data.password); }
    if (data.is_admin !== undefined) { fields.push('is_admin = ?'); params.push(data.is_admin); }
    if (fields.length === 0) return;
    fields.push("updated_at = datetime('now')");
    params.push(id);
    getDb().run(`UPDATE app_user SET ${fields.join(', ')} WHERE id = ?`, params);
    saveDb();
  },

  delete(id: number): void {
    getDb().run('DELETE FROM app_user WHERE id = ?', [id]);
    saveDb();
  },

  batchCreate(users: Array<{
    name: string; employee_no: string; department: string; position: string;
    level: string; phone: string; id_card_tail: string; password: string;
  }>): { success: number; errors: Array<{row: number; message: string}> } {
    const errors: Array<{row: number; message: string}> = [];
    let success = 0;
    const db = getDb();

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      try {
        const existing = this.findByEmployeeNo(u.employee_no);
        if (existing) {
          errors.push({ row: i + 2, message: `工号 ${u.employee_no} 已存在` });
          continue;
        }
        const dup = this.findByPhoneAndIdCard(u.phone, u.id_card_tail);
        if (dup) {
          errors.push({ row: i + 2, message: `手机号 ${u.phone} + 身份证后四位 ${u.id_card_tail} 已被用户「${dup.name}」使用` });
          continue;
        }
        db.run(
          `INSERT INTO app_user (name, employee_no, department, position, level, phone, id_card_tail, password)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [u.name, u.employee_no, u.department, u.position, u.level, u.phone, u.id_card_tail, u.password]
        );
        success++;
      } catch (err: any) {
        errors.push({ row: i + 2, message: err.message });
      }
    }
    saveDb();
    return { success, errors };
  },

  toPublic,
};
