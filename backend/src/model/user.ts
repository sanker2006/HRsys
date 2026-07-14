import { execute, queryAll, queryOne, transaction, type DbExecutor } from '../db/query.js';

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

function supportsManagedDepartments(level: string): boolean {
  return ['division_leader', 'manager'].includes(normalizeLevel(level));
}

export function effectiveManagedDepartments(user: { level: string; department: string; managed_departments?: string[] }): string[] {
  if (!supportsManagedDepartments(user.level)) return [];
  const configured = [...new Set((user.managed_departments ?? []).map(department => String(department).trim()).filter(Boolean))];
  if (user.level === 'manager' && configured.length === 0 && user.department) return [user.department];
  return configured;
}

async function getManagedDepartments(userId: number): Promise<string[]> {
  return (await queryAll<{ department: string }>(
    'SELECT department FROM division_leader_department WHERE user_id = ? ORDER BY department',
    [userId]
  )).map(r => r.department);
}

async function attachManagedDepartments<T extends UserRow>(user: T | undefined): Promise<T | undefined> {
  if (!user) return user;
  user.level = normalizeLevel(user.level);
  user.managed_departments = await getManagedDepartments(user.id);
  return user;
}

async function attachMany(users: UserRow[]): Promise<UserRow[]> {
  if (users.length === 0) return users;
  const placeholders = users.map(() => '?').join(', ');
  const rows = await queryAll<{ user_id: number; department: string }>(
    `SELECT user_id, department FROM division_leader_department WHERE user_id IN (${placeholders}) ORDER BY user_id, department`,
    users.map(user => user.id)
  );
  const managed = new Map<number, string[]>();
  for (const row of rows) {
    if (!managed.has(row.user_id)) managed.set(row.user_id, []);
    managed.get(row.user_id)!.push(row.department);
  }
  return users.map(user => ({
    ...user,
    level: normalizeLevel(user.level),
    managed_departments: managed.get(user.id) ?? [],
  }));
}

async function replaceManagedDepartments(db: Pick<DbExecutor, 'execute'>, userId: number, departments: string[] = []): Promise<void> {
  await db.execute('DELETE FROM division_leader_department WHERE user_id = ?', [userId]);
  const unique = [...new Set(departments.map(d => String(d).trim()).filter(Boolean))];
  for (const dept of unique) {
    await db.execute('INSERT INTO division_leader_department (user_id, department) VALUES (?, ?)', [userId, dept]);
  }
}

async function assertManagerDepartmentsAvailable(
  db: Pick<DbExecutor, 'queryAll'>,
  candidate: Pick<UserRow, 'id' | 'level' | 'department' | 'status' | 'managed_departments'>
): Promise<void> {
  if (candidate.level !== 'manager' || candidate.status !== 'active') return;
  const departments = effectiveManagedDepartments(candidate);
  if (departments.length === 0) return;

  const departmentPlaceholders = departments.map(() => '?').join(', ');
  await db.queryAll<{ name: string }>(
    `SELECT name FROM department WHERE name IN (${departmentPlaceholders}) FOR UPDATE`,
    departments
  );
  const rows = await db.queryAll<UserRow & { managed_department: string | null }>(
    `SELECT u.*, d.department as managed_department
      FROM app_user u
      LEFT JOIN division_leader_department d ON d.user_id = u.id
      WHERE u.level = 'manager' AND u.status = 'active' AND u.id != ?
      ORDER BY u.id
      FOR UPDATE`,
    [candidate.id]
  );
  const byManager = new Map<number, UserRow>();
  for (const row of rows) {
    const manager = byManager.get(row.id) ?? { ...row, managed_departments: [] };
    if (row.managed_department) manager.managed_departments!.push(row.managed_department);
    byManager.set(row.id, manager);
  }
  for (const manager of byManager.values()) {
    const conflict = effectiveManagedDepartments(manager).find(department => departments.includes(department));
    if (conflict) throw new Error(`部门「${conflict}」已由部门负责人「${manager.name}」负责`);
  }
}

async function assertSingleMainLeader(level: string, excludeId?: number): Promise<void> {
  if (normalizeLevel(level) !== 'main_leader') return;
  const existing = excludeId
    ? await queryOne<UserRow>('SELECT * FROM app_user WHERE level = ? AND id != ? LIMIT 1', ['main_leader', excludeId])
    : await queryOne<UserRow>('SELECT * FROM app_user WHERE level = ? LIMIT 1', ['main_leader']);
  if (existing) throw new Error('系统只能存在 1 名主要领导');
}

export const UserModel = {
  async findById(id: number): Promise<UserRow | undefined> {
    return attachManagedDepartments(await queryOne<UserRow>('SELECT * FROM app_user WHERE id = ?', [id]));
  },

  async findByPhone(phone: string): Promise<UserRow | undefined> {
    return attachManagedDepartments(await queryOne<UserRow>('SELECT * FROM app_user WHERE phone = ?', [phone]));
  },

  async findByPhoneAndIdCard(phone: string, idCardTail: string): Promise<UserRow | undefined> {
    return attachManagedDepartments(await queryOne<UserRow>('SELECT * FROM app_user WHERE phone = ? AND id_card_tail = ?', [phone, idCardTail]));
  },

  async findByPhoneAndIdCardExclude(phone: string, idCardTail: string, excludeId: number): Promise<UserRow | undefined> {
    return attachManagedDepartments(await queryOne<UserRow>('SELECT * FROM app_user WHERE phone = ? AND id_card_tail = ? AND id != ?', [phone, idCardTail, excludeId]));
  },

  async findByEmployeeNo(employeeNo: string): Promise<UserRow | undefined> {
    return attachManagedDepartments(await queryOne<UserRow>('SELECT * FROM app_user WHERE employee_no = ?', [employeeNo]));
  },

  async findByAccount(account: string): Promise<UserRow | undefined> {
    return attachManagedDepartments(await queryOne<UserRow>(
      'SELECT * FROM app_user WHERE (employee_no = ? OR phone = ?) AND is_admin = 1',
      [account, account]
    ));
  },

  async findAll(filters?: { department?: string; level?: string; keyword?: string; status?: string }): Promise<UserRow[]> {
    let sql = 'SELECT * FROM app_user WHERE 1=1';
    const params: any[] = [];
    if (filters?.department) { sql += ' AND department = ?'; params.push(filters.department); }
    if (filters?.level) { sql += ' AND level = ?'; params.push(filters.level); }
    if (filters?.status) { sql += ' AND status = ?'; params.push(normalizeStatus(filters.status)); }
    if (filters?.keyword) { sql += ' AND (name LIKE ? OR employee_no LIKE ?)'; params.push(`%${filters.keyword}%`, `%${filters.keyword}%`); }
    sql += ' ORDER BY created_at DESC, id DESC';
    return attachMany(await queryAll<UserRow>(sql, params));
  },

  async findPage(filters: { department?: string; level?: string; keyword?: string; status?: string } = {}, page = 1, pageSize = 20): Promise<{
    list: UserRow[];
    total: number;
  }> {
    let sql = 'SELECT * FROM app_user WHERE 1=1';
    const params: any[] = [];
    if (filters.department) { sql += ' AND department = ?'; params.push(filters.department); }
    if (filters.level) { sql += ' AND level = ?'; params.push(filters.level); }
    if (filters.status) { sql += ' AND status = ?'; params.push(normalizeStatus(filters.status)); }
    if (filters.keyword) { sql += ' AND (name LIKE ? OR employee_no LIKE ?)'; params.push(`%${filters.keyword}%`, `%${filters.keyword}%`); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = Number((await queryOne<{ total: number }>(countSql, params))?.total ?? 0);
    const offset = (page - 1) * pageSize;
    const list = await attachMany(await queryAll<UserRow>(
      `${sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    ));
    return { list, total };
  },

  async count(filters?: { department?: string; level?: string; keyword?: string; status?: string }): Promise<number> {
    let sql = 'SELECT COUNT(*) as total FROM app_user WHERE 1=1';
    const params: any[] = [];
    if (filters?.department) { sql += ' AND department = ?'; params.push(filters.department); }
    if (filters?.level) { sql += ' AND level = ?'; params.push(filters.level); }
    if (filters?.status) { sql += ' AND status = ?'; params.push(normalizeStatus(filters.status)); }
    if (filters?.keyword) { sql += ' AND (name LIKE ? OR employee_no LIKE ?)'; params.push(`%${filters.keyword}%`, `%${filters.keyword}%`); }
    return Number((await queryOne<{ total: number }>(sql, params))?.total ?? 0);
  },

  async findDepartments(): Promise<string[]> {
    return (await queryAll<{ department: string }>('SELECT DISTINCT department FROM app_user ORDER BY department')).map(r => r.department);
  },

  async create(data: {
    name: string; employee_no: string; department: string; position: string;
    level: string; phone: string; id_card_tail: string; password: string; status?: string; is_admin?: number; managed_departments?: string[];
  }): Promise<UserRow> {
    const level = normalizeLevel(data.level);
    await assertSingleMainLeader(level);
    const existing = await this.findByPhoneAndIdCard(data.phone, data.id_card_tail);
    if (existing) throw new Error(`手机号 ${data.phone} + 证件后四位 ${data.id_card_tail} 已被用户「${existing.name}」使用`);

    await transaction(async tx => {
      await tx.execute(
        `INSERT INTO app_user (name, employee_no, department, position, level, phone, id_card_tail, password, status, is_admin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.name, data.employee_no, data.department, data.position, level, data.phone, data.id_card_tail, data.password, normalizeStatus(data.status), data.is_admin ?? 0]
      );
      const created = await tx.queryOne<UserRow>('SELECT * FROM app_user WHERE employee_no = ? FOR UPDATE', [data.employee_no]);
      if (!created) throw new Error('创建用户后无法获取记录');
      const managedDepartments = supportsManagedDepartments(level) ? (data.managed_departments ?? []) : [];
      await assertManagerDepartmentsAvailable(tx, {
        ...created,
        level,
        status: normalizeStatus(data.status),
        managed_departments: managedDepartments,
      });
      await replaceManagedDepartments(tx, created.id, managedDepartments);
    });

    const user = await this.findByEmployeeNo(data.employee_no);
    if (!user) throw new Error('创建用户后无法获取记录');
    return (await this.findById(user.id))!;
  },

  async update(id: number, data: Partial<{
    name: string; department: string; position: string; level: string;
    phone: string; id_card_tail: string; password: string; status: string; is_admin: number; managed_departments: string[];
  }>): Promise<void> {
    const current = await this.findById(id);
    if (!current) throw new Error('用户不存在');
    const nextLevel = normalizeLevel(data.level ?? current.level);
    await assertSingleMainLeader(nextLevel, id);

    if (data.phone !== undefined || data.id_card_tail !== undefined) {
      const phone = data.phone ?? current.phone;
      const idCardTail = data.id_card_tail ?? current.id_card_tail;
      const conflict = await this.findByPhoneAndIdCardExclude(phone, idCardTail, id);
      if (conflict) throw new Error(`手机号 ${phone} + 证件后四位 ${idCardTail} 已被用户「${conflict.name}」使用`);
    }

    await transaction(async tx => {
      await tx.queryOne<UserRow>('SELECT * FROM app_user WHERE id = ? FOR UPDATE', [id]);
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
        await tx.execute(`UPDATE app_user SET ${fields.join(', ')} WHERE id = ?`, params);
      }
      const nextManagedDepartments = supportsManagedDepartments(nextLevel)
        ? (data.managed_departments ?? current.managed_departments ?? [])
        : [];
      await assertManagerDepartmentsAvailable(tx, {
        ...current,
        id,
        level: nextLevel,
        department: data.department ?? current.department,
        status: data.status !== undefined ? normalizeStatus(data.status) : current.status,
        managed_departments: nextManagedDepartments,
      });
      await replaceManagedDepartments(tx, id, nextManagedDepartments);
    });
  },

  delete(id: number): Promise<void> {
    return execute('DELETE FROM app_user WHERE id = ?', [id]);
  },

  async batchCreate(users: Array<{
    name: string; employee_no: string; department: string; position: string;
    level: string; phone: string; id_card_tail: string; password: string; status?: string; managed_departments?: string[]; source_row?: number;
  }>): Promise<{ success: number; errors: Array<{ row: number; message: string }> }> {
    const errors: Array<{ row: number; message: string }> = [];
    let success = 0;

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      try {
        const level = normalizeLevel(u.level);
        const existing = await this.findByEmployeeNo(u.employee_no);
        if (existing) {
          errors.push({ row: u.source_row ?? i + 2, message: `工号 ${u.employee_no} 已存在` });
          continue;
        }
        const dup = await this.findByPhoneAndIdCard(u.phone, u.id_card_tail);
        if (dup) {
          errors.push({ row: u.source_row ?? i + 2, message: `手机号 ${u.phone} + 证件后四位 ${u.id_card_tail} 已被用户「${dup.name}」使用` });
          continue;
        }
        await assertSingleMainLeader(level);
        await this.create({ ...u, level });
        success++;
      } catch (err: any) {
        errors.push({ row: u.source_row ?? i + 2, message: err.message });
      }
    }
    return { success, errors };
  },

  toPublic,
  normalizeStatus,
};
