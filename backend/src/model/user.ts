import { getDb, saveDb } from '../db/index.js';
import { queryAll, queryOne } from '../db/query.js';

export type UserLevel = 'main_leader' | 'division_leader' | 'manager' | 'staff' | 'admin' | 'leader';

export interface UserRow {
  id: number;
  name: string;
  employee_no: string;
  department: string;
  position: string;
  level: UserLevel;
  phone: string;
  id_card_tail: string;
  password: string;
  status: 'active' | 'inactive';
  is_admin: number;
  created_at: string;
  updated_at: string;
  managed_departments?: string[];
}

export interface UserPublic {
  id: number;
  name: string;
  employee_no: string;
  department: string;
  position: string;
  level: UserLevel;
  phone: string;
  id_card_tail: string;
  status: 'active' | 'inactive';
  is_admin: number;
  created_at: string;
  managed_departments?: string[];
}

function toPublic(row: UserRow): UserPublic {
  const { password: _, ...pub } = row;
  return pub as UserPublic;
}

function normalizeLevel(level: string): UserLevel {
  if (level === 'leader') return 'division_leader';
  if (['main_leader', 'division_leader', 'manager', 'staff', 'admin'].includes(level)) return level as UserLevel;
  return 'staff';
}

function normalizeStatus(status: unknown): 'active' | 'inactive' {
  const text = String(status || '').trim();
  if (text === 'inactive' || text === '停用') return 'inactive';
  return 'active';
}

function getManagedDepartments(userId: number): string[] {
  return queryAll<{ department: string }>(
    'SELECT department FROM division_leader_department WHERE user_id = ? ORDER BY department',
    [userId]
  ).map(r => r.department);
}

function attachManagedDepartments<T extends UserRow>(user: T | undefined): T | undefined {
  if (!user) return user;
  user.level = normalizeLevel(user.level);
  user.managed_departments = getManagedDepartments(user.id);
  return user;
}

function replaceManagedDepartments(userId: number, departments: string[] = []): void {
  const db = getDb();
  db.run('DELETE FROM division_leader_department WHERE user_id = ?', [userId]);
  const unique = [...new Set(departments.map(d => String(d).trim()).filter(Boolean))];
  for (const dept of unique) {
    db.run('INSERT OR IGNORE INTO division_leader_department (user_id, department) VALUES (?, ?)', [userId, dept]);
  }
}

function assertSingleMainLeader(level: string, excludeId?: number): void {
  if (normalizeLevel(level) !== 'main_leader') return;
  const existing = excludeId
    ? queryOne<UserRow>('SELECT * FROM app_user WHERE level = ? AND id != ? LIMIT 1', ['main_leader', excludeId])
    : queryOne<UserRow>('SELECT * FROM app_user WHERE level = ? LIMIT 1', ['main_leader']);
  if (existing) throw new Error('系统只能存在 1 名主要领导');
}

export const UserModel = {
  findById(id: number): UserRow | undefined {
    return attachManagedDepartments(queryOne<UserRow>('SELECT * FROM app_user WHERE id = ?', [id]));
  },

  findByPhone(phone: string): UserRow | undefined {
    return attachManagedDepartments(queryOne<UserRow>('SELECT * FROM app_user WHERE phone = ?', [phone]));
  },

  findByPhoneAndIdCard(phone: string, idCardTail: string): UserRow | undefined {
    return attachManagedDepartments(queryOne<UserRow>('SELECT * FROM app_user WHERE phone = ? AND id_card_tail = ?', [phone, idCardTail]));
  },

  findByPhoneAndIdCardExclude(phone: string, idCardTail: string, excludeId: number): UserRow | undefined {
    return attachManagedDepartments(queryOne<UserRow>('SELECT * FROM app_user WHERE phone = ? AND id_card_tail = ? AND id != ?', [phone, idCardTail, excludeId]));
  },

  findByEmployeeNo(employeeNo: string): UserRow | undefined {
    return attachManagedDepartments(queryOne<UserRow>('SELECT * FROM app_user WHERE employee_no = ?', [employeeNo]));
  },

  findByAccount(account: string): UserRow | undefined {
    return attachManagedDepartments(queryOne<UserRow>(
      'SELECT * FROM app_user WHERE (employee_no = ? OR phone = ?) AND is_admin = 1',
      [account, account]
    ));
  },

  findAll(filters?: { department?: string; level?: string; keyword?: string; status?: string }): UserRow[] {
    let sql = 'SELECT * FROM app_user WHERE 1=1';
    const params: any[] = [];
    if (filters?.department) { sql += ' AND department = ?'; params.push(filters.department); }
    if (filters?.level) { sql += ' AND level = ?'; params.push(filters.level); }
    if (filters?.status) { sql += ' AND status = ?'; params.push(normalizeStatus(filters.status)); }
    if (filters?.keyword) { sql += ' AND (name LIKE ? OR employee_no LIKE ?)'; params.push(`%${filters.keyword}%`, `%${filters.keyword}%`); }
    sql += ' ORDER BY created_at DESC';
    return queryAll<UserRow>(sql, params).map(u => attachManagedDepartments(u)!);
  },

  findPage(filters: { department?: string; level?: string; keyword?: string; status?: string } = {}, page = 1, pageSize = 20): {
    list: UserRow[];
    total: number;
  } {
    let sql = 'SELECT * FROM app_user WHERE 1=1';
    const params: any[] = [];
    if (filters.department) { sql += ' AND department = ?'; params.push(filters.department); }
    if (filters.level) { sql += ' AND level = ?'; params.push(filters.level); }
    if (filters.status) { sql += ' AND status = ?'; params.push(normalizeStatus(filters.status)); }
    if (filters.keyword) { sql += ' AND (name LIKE ? OR employee_no LIKE ?)'; params.push(`%${filters.keyword}%`, `%${filters.keyword}%`); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = queryOne<{ total: number }>(countSql, params)?.total ?? 0;
    const offset = (page - 1) * pageSize;
    const list = queryAll<UserRow>(
      `${sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    ).map(u => attachManagedDepartments(u)!);
    return { list, total };
  },

  count(filters?: { department?: string; level?: string; keyword?: string; status?: string }): number {
    let sql = 'SELECT COUNT(*) as total FROM app_user WHERE 1=1';
    const params: any[] = [];
    if (filters?.department) { sql += ' AND department = ?'; params.push(filters.department); }
    if (filters?.level) { sql += ' AND level = ?'; params.push(filters.level); }
    if (filters?.status) { sql += ' AND status = ?'; params.push(normalizeStatus(filters.status)); }
    if (filters?.keyword) { sql += ' AND (name LIKE ? OR employee_no LIKE ?)'; params.push(`%${filters.keyword}%`, `%${filters.keyword}%`); }
    return queryOne<{ total: number }>(sql, params)?.total ?? 0;
  },

  findDepartments(): string[] {
    return queryAll<{ department: string }>('SELECT DISTINCT department FROM app_user ORDER BY department').map(r => r.department);
  },

  create(data: {
    name: string; employee_no: string; department: string; position: string;
    level: string; phone: string; id_card_tail: string; password: string; status?: string; is_admin?: number; managed_departments?: string[];
  }): UserRow {
    const level = normalizeLevel(data.level);
    assertSingleMainLeader(level);
    const existing = this.findByPhoneAndIdCard(data.phone, data.id_card_tail);
    if (existing) throw new Error(`手机号 ${data.phone} + 证件后四位 ${data.id_card_tail} 已被用户「${existing.name}」使用`);
    const db = getDb();
    db.run(
      `INSERT INTO app_user (name, employee_no, department, position, level, phone, id_card_tail, password, status, is_admin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.employee_no, data.department, data.position, level, data.phone, data.id_card_tail, data.password, normalizeStatus(data.status), data.is_admin ?? 0]
    );
    const user = this.findByEmployeeNo(data.employee_no);
    if (!user) throw new Error('创建用户后无法获取记录');
    if (level === 'division_leader') replaceManagedDepartments(user.id, data.managed_departments ?? []);
    saveDb();
    return this.findById(user.id)!;
  },

  update(id: number, data: Partial<{
    name: string; department: string; position: string; level: string;
    phone: string; id_card_tail: string; password: string; status: string; is_admin: number; managed_departments: string[];
  }>): void {
    const current = this.findById(id);
    if (!current) throw new Error('用户不存在');
    const nextLevel = normalizeLevel(data.level ?? current.level);
    assertSingleMainLeader(nextLevel, id);

    if (data.phone !== undefined || data.id_card_tail !== undefined) {
      const phone = data.phone ?? current.phone;
      const idCardTail = data.id_card_tail ?? current.id_card_tail;
      const conflict = this.findByPhoneAndIdCardExclude(phone, idCardTail, id);
      if (conflict) throw new Error(`手机号 ${phone} + 证件后四位 ${idCardTail} 已被用户「${conflict.name}」使用`);
    }

    const fields: string[] = [];
    const params: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.department !== undefined) { fields.push('department = ?'); params.push(data.department); }
    if (data.position !== undefined) { fields.push('position = ?'); params.push(data.position); }
    if (data.level !== undefined) { fields.push('level = ?'); params.push(nextLevel); }
    if (data.phone !== undefined) { fields.push('phone = ?'); params.push(data.phone); }
    if (data.id_card_tail !== undefined) { fields.push('id_card_tail = ?'); params.push(data.id_card_tail); }
    if (data.password !== undefined) { fields.push('password = ?'); params.push(data.password); }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(normalizeStatus(data.status)); }
    if (data.is_admin !== undefined) { fields.push('is_admin = ?'); params.push(data.is_admin); }
    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      params.push(id);
      getDb().run(`UPDATE app_user SET ${fields.join(', ')} WHERE id = ?`, params);
    }

    if (data.managed_departments !== undefined || nextLevel !== 'division_leader') {
      replaceManagedDepartments(id, nextLevel === 'division_leader' ? (data.managed_departments ?? current.managed_departments ?? []) : []);
    }
    saveDb();
  },

  delete(id: number): void {
    getDb().run('DELETE FROM app_user WHERE id = ?', [id]);
    saveDb();
  },

  batchCreate(users: Array<{
    name: string; employee_no: string; department: string; position: string;
    level: string; phone: string; id_card_tail: string; password: string; status?: string; managed_departments?: string[];
  }>): { success: number; errors: Array<{ row: number; message: string }> } {
    const errors: Array<{ row: number; message: string }> = [];
    let success = 0;
    const db = getDb();

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      try {
        const level = normalizeLevel(u.level);
        const existing = this.findByEmployeeNo(u.employee_no);
        if (existing) {
          errors.push({ row: i + 2, message: `工号 ${u.employee_no} 已存在` });
          continue;
        }
        const dup = this.findByPhoneAndIdCard(u.phone, u.id_card_tail);
        if (dup) {
          errors.push({ row: i + 2, message: `手机号 ${u.phone} + 证件后四位 ${u.id_card_tail} 已被用户「${dup.name}」使用` });
          continue;
        }
        assertSingleMainLeader(level);
        db.run(
          `INSERT INTO app_user (name, employee_no, department, position, level, phone, id_card_tail, password, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [u.name, u.employee_no, u.department, u.position, level, u.phone, u.id_card_tail, u.password, normalizeStatus(u.status)]
        );
        const created = this.findByEmployeeNo(u.employee_no);
        if (created && level === 'division_leader') replaceManagedDepartments(created.id, u.managed_departments ?? []);
        success++;
      } catch (err: any) {
        errors.push({ row: i + 2, message: err.message });
      }
    }
    saveDb();
    return { success, errors };
  },

  toPublic,
  normalizeStatus,
};
