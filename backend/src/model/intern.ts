import ExcelJS from 'exceljs';
import { execute, queryAll, queryOne, transaction } from '../db/query.js';

const PHOTO_LIMIT = 10 * 1024;

export interface InternUserRow {
  id: number;
  intern_no: string;
  name: string;
  phone: string;
  id_card_tail: string;
  department: string;
  position: string;
  mentor: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface InternAttendanceRecordRow {
  id: number;
  intern_id: number;
  punch_time: string;
  punch_date: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  photo_data?: Uint8Array | null;
  photo_mime: string | null;
  evidence_type: string;
  source: string;
  created_at: string;
  intern_no?: string;
  intern_name?: string;
  department?: string;
}

export interface InternAttendanceAdjustmentRow {
  id: number;
  intern_id: number;
  record_id: number | null;
  target_date: string;
  action: 'makeup' | 'reject' | 'restore' | 'void';
  reason: string;
  admin_id: number | null;
  created_at: string;
}

function normalizeStatus(status: unknown): 'active' | 'inactive' {
  const text = String(status || '').trim();
  const lower = text.toLowerCase();
  if (['inactive', 'disabled'].includes(lower)) return 'inactive';
  if (['停用', '禁用'].includes(text)) return 'inactive';
  return 'active';
}

function localDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function monthRange(month: string): { start: string; end: string; days: string[] } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('月份格式必须是 YYYY-MM');
  const [year, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const days = Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  return { start: days[0], end: days[days.length - 1], days };
}

function dateInRange(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}

function decodePhoto(photoBase64?: string | null): { data: Uint8Array | null; mime: string | null } {
  if (!photoBase64) return { data: null, mime: null };
  const match = photoBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const mime = match?.[1] || 'image/jpeg';
  const raw = match?.[2] || photoBase64;
  const data = Buffer.from(raw, 'base64');
  if (!data.length) throw new Error('照片数据为空');
  if (data.length > PHOTO_LIMIT) throw new Error('打卡照片压缩后不能超过 10KB');
  return { data, mime };
}

function publicIntern(row: InternUserRow): Omit<InternUserRow, 'id_card_tail'> {
  const { id_card_tail: _, ...rest } = row;
  return rest;
}

function recordPublic(row: InternAttendanceRecordRow) {
  const { photo_data: _, ...rest } = row;
  return {
    ...rest,
    has_photo: !!row.photo_data,
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    accuracy: row.accuracy === null || row.accuracy === undefined ? null : Number(row.accuracy),
  };
}

async function rowsForMonth(month: string, internId?: number) {
  const range = monthRange(month);
  const users = internId
    ? await queryAll<InternUserRow>('SELECT * FROM intern_user WHERE id = ?', [internId])
    : await queryAll<InternUserRow>('SELECT * FROM intern_user ORDER BY department, intern_no');
  const filteredUsers = users.filter(u => u.start_date <= range.end && u.end_date >= range.start);
  const ids = filteredUsers.map(u => u.id);
  if (!ids.length) return { range, users: filteredUsers, records: [], adjustments: [] };
  const placeholders = ids.map(() => '?').join(',');
  const records = await queryAll<InternAttendanceRecordRow>(
    `SELECT * FROM intern_attendance_record
     WHERE intern_id IN (${placeholders}) AND punch_date >= ? AND punch_date <= ?
     ORDER BY punch_time ASC`,
    [...ids, range.start, range.end]
  );
  const adjustments = await queryAll<InternAttendanceAdjustmentRow>(
    `SELECT * FROM intern_attendance_adjustment
     WHERE intern_id IN (${placeholders}) AND target_date >= ? AND target_date <= ?
     ORDER BY created_at ASC, id ASC`,
    [...ids, range.start, range.end]
  );
  return { range, users: filteredUsers, records, adjustments };
}

function invalidRecordIds(adjustments: InternAttendanceAdjustmentRow[]): Set<number> {
  const state = new Map<number, boolean>();
  for (const a of adjustments) {
    if (!a.record_id) continue;
    if (a.action === 'reject' || a.action === 'void') state.set(a.record_id, true);
    if (a.action === 'restore') state.set(a.record_id, false);
  }
  return new Set([...state.entries()].filter(([, invalid]) => invalid).map(([id]) => id));
}

function buildDailyStats(user: InternUserRow, range: { days: string[] }, records: InternAttendanceRecordRow[], adjustments: InternAttendanceAdjustmentRow[]) {
  const invalid = invalidRecordIds(adjustments);
  return range.days
    .filter(day => dateInRange(day, user.start_date, user.end_date))
    .map(day => {
      const dayRecords = records.filter(r => r.intern_id === user.id && r.punch_date === day);
      const validRecords = dayRecords.filter(r => !invalid.has(r.id));
      const makeup = adjustments.filter(a => a.intern_id === user.id && a.target_date === day && a.action === 'makeup').length;
      const rejected = adjustments.filter(a => a.intern_id === user.id && a.target_date === day && (a.action === 'reject' || a.action === 'void')).length;
      const valid_count = validRecords.length + makeup;
      const status = valid_count >= 2 ? 'present' : 'absent';
      return {
        date: day,
        valid_count,
        raw_count: dayRecords.length,
        makeup_count: makeup,
        rejected_count: rejected,
        first_time: validRecords[0]?.punch_time || null,
        last_time: validRecords[validRecords.length - 1]?.punch_time || null,
        status,
      };
    });
}

export const InternModel = {
  normalizeStatus,
  publicIntern,
  localDate,
  PHOTO_LIMIT,

  findById(id: number) {
    return queryOne<InternUserRow>('SELECT * FROM intern_user WHERE id = ?', [id]);
  },

  findByPhoneAndIdCard(phone: string, idCardTail: string) {
    return queryOne<InternUserRow>('SELECT * FROM intern_user WHERE phone = ? AND id_card_tail = ?', [phone, idCardTail]);
  },

  async findPage(filters: { keyword?: string; department?: string; status?: string } = {}, page = 1, pageSize = 20) {
    let sql = 'SELECT * FROM intern_user WHERE 1=1';
    const params: any[] = [];
    if (filters.keyword) {
      sql += ' AND (name LIKE ? OR intern_no LIKE ? OR phone LIKE ?)';
      params.push(`%${filters.keyword}%`, `%${filters.keyword}%`, `%${filters.keyword}%`);
    }
    if (filters.department) { sql += ' AND department = ?'; params.push(filters.department); }
    if (filters.status) { sql += ' AND status = ?'; params.push(normalizeStatus(filters.status)); }
    const total = Number((await queryOne<{ total: number }>(sql.replace('SELECT *', 'SELECT COUNT(*) as total'), params))?.total ?? 0);
    const offset = (page - 1) * pageSize;
    const list = await queryAll<InternUserRow>(`${sql} ORDER BY department, intern_no LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
    return { list, total, page, pageSize };
  },

  async create(data: Omit<InternUserRow, 'id' | 'created_at' | 'updated_at' | 'status'> & { status?: string }) {
    const existing = await queryOne<InternUserRow>('SELECT * FROM intern_user WHERE intern_no = ?', [data.intern_no]);
    if (existing) throw new Error(`实习生编号 ${data.intern_no} 已存在`);
    const phoneDup = await this.findByPhoneAndIdCard(data.phone, data.id_card_tail);
    if (phoneDup) throw new Error(`手机号 ${data.phone} + 证件后四位已被 ${phoneDup.name} 使用`);
    await execute(
      `INSERT INTO intern_user (intern_no, name, phone, id_card_tail, department, position, mentor, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.intern_no, data.name, data.phone, data.id_card_tail, data.department, data.position, data.mentor, data.start_date, data.end_date, normalizeStatus(data.status)]
    );
    return queryOne<InternUserRow>('SELECT * FROM intern_user WHERE intern_no = ?', [data.intern_no]);
  },

  async update(id: number, data: Partial<InternUserRow>) {
    const current = await this.findById(id);
    if (!current) throw new Error('实习生不存在');
    if (data.phone || data.id_card_tail) {
      const phone = data.phone ?? current.phone;
      const tail = data.id_card_tail ?? current.id_card_tail;
      const conflict = await queryOne<InternUserRow>('SELECT * FROM intern_user WHERE phone = ? AND id_card_tail = ? AND id != ?', [phone, tail, id]);
      if (conflict) throw new Error(`手机号 ${phone} + 证件后四位已被 ${conflict.name} 使用`);
    }
    const fields: string[] = [];
    const params: any[] = [];
    for (const key of ['name', 'phone', 'id_card_tail', 'department', 'position', 'mentor', 'start_date', 'end_date'] as const) {
      if (data[key] !== undefined) { fields.push(`${key} = ?`); params.push(data[key]); }
    }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(normalizeStatus(data.status)); }
    if (!fields.length) return;
    fields.push("updated_at = datetime('now')");
    params.push(id);
    await execute(`UPDATE intern_user SET ${fields.join(', ')} WHERE id = ?`, params);
  },

  async batchCreate(items: any[]) {
    const errors: Array<{ row: number; message: string }> = [];
    let success = 0;
    for (let i = 0; i < items.length; i++) {
      try {
        const item = items[i];
        const data = {
          intern_no: String(item.intern_no || item['实习生编号'] || item['编号'] || '').trim(),
          name: String(item.name || item['姓名'] || '').trim(),
          phone: String(item.phone || item['手机号'] || '').trim(),
          id_card_tail: String(item.id_card_tail || item['身份证后四位'] || item['证件后四位'] || '').trim(),
          department: String(item.department || item['部门'] || '').trim(),
          position: String(item.position || item['岗位/学校'] || item['岗位'] || item['学校'] || '').trim(),
          mentor: String(item.mentor || item['负责人'] || '').trim(),
          start_date: String(item.start_date || item['开始日期'] || '').trim(),
          end_date: String(item.end_date || item['结束日期'] || '').trim(),
          status: String(item.status || item['状态'] || 'active').trim(),
        };
        if (!data.intern_no || !data.name || !data.phone || !/^\d{4}$/.test(data.id_card_tail) || !data.start_date || !data.end_date) {
          throw new Error('缺少必填字段或身份证后四位格式错误');
        }
        await this.create(data);
        success++;
      } catch (err: any) {
        errors.push({ row: i + 2, message: err.message || '导入失败' });
      }
    }
    return { success, errors };
  },

  async punch(internId: number, data: { latitude?: number; longitude?: number; accuracy?: number; photoBase64?: string }) {
    const hasGps = Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude));
    const photo = decodePhoto(data.photoBase64);
    if (!hasGps && !photo.data) throw new Error('未获取到定位时必须上传打卡照片');
    const evidence = hasGps && photo.data ? 'gps_photo' : hasGps ? 'gps' : 'photo';
    const punchDate = localDate();
    await execute(
      `INSERT INTO intern_attendance_record (intern_id, punch_date, latitude, longitude, accuracy, photo_data, photo_mime, evidence_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        internId,
        punchDate,
        hasGps ? Number(data.latitude) : null,
        hasGps ? Number(data.longitude) : null,
        Number.isFinite(Number(data.accuracy)) ? Number(data.accuracy) : null,
        photo.data,
        photo.mime,
        evidence,
      ]
    );
    return queryOne<InternAttendanceRecordRow>('SELECT * FROM intern_attendance_record WHERE intern_id = ? ORDER BY id DESC LIMIT 1', [internId]);
  },

  async records(filters: { month?: string; internId?: number; department?: string; status?: string } = {}) {
    const month = filters.month || localDate().slice(0, 7);
    const range = monthRange(month);
    let sql = `SELECT r.*, u.intern_no, u.name as intern_name, u.department
      FROM intern_attendance_record r JOIN intern_user u ON r.intern_id = u.id
      WHERE r.punch_date >= ? AND r.punch_date <= ?`;
    const params: any[] = [range.start, range.end];
    if (filters.internId) { sql += ' AND r.intern_id = ?'; params.push(filters.internId); }
    if (filters.department) { sql += ' AND u.department = ?'; params.push(filters.department); }
    if (filters.status) { sql += ' AND u.status = ?'; params.push(normalizeStatus(filters.status)); }
    sql += ' ORDER BY r.punch_time DESC';
    return (await queryAll<InternAttendanceRecordRow>(sql, params)).map(recordPublic);
  },

  async adjust(data: { intern_id: number; record_id?: number | null; target_date: string; action: string; reason: string; admin_id: number }) {
    if (!['makeup', 'reject', 'restore', 'void'].includes(data.action)) throw new Error('调整动作无效');
    if (!data.reason?.trim()) throw new Error('必须填写调整原因');
    await execute(
      `INSERT INTO intern_attendance_adjustment (intern_id, record_id, target_date, action, reason, admin_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.intern_id, data.record_id ?? null, data.target_date, data.action, data.reason, data.admin_id]
    );
  },

  async monthStats(month: string, internId?: number) {
    const data = await rowsForMonth(month, internId);
    const rows = data.users.map(user => {
      const days = buildDailyStats(user, data.range, data.records, data.adjustments);
      const present = days.filter(d => d.status === 'present').length;
      const absent = days.filter(d => d.status === 'absent').length;
      const makeup = days.reduce((sum, d) => sum + d.makeup_count, 0);
      const rejected = days.reduce((sum, d) => sum + d.rejected_count, 0);
      return {
        intern: publicIntern(user),
        days,
        summary: {
          expected_days: days.length,
          present_days: present,
          absent_days: absent,
          exception_days: days.filter(d => d.rejected_count > 0 || d.makeup_count > 0).length,
          makeup_count: makeup,
          rejected_count: rejected,
        },
      };
    });
    return { month, rows };
  },

  async yearStats(year: string, internId?: number) {
    if (!/^\d{4}$/.test(year)) throw new Error('年份格式必须是 YYYY');
    const monthStatsList = [];
    for (let i = 1; i <= 12; i++) {
      const month = `${year}-${String(i).padStart(2, '0')}`;
      monthStatsList.push(await this.monthStats(month, internId));
    }
    const internMap = new Map<number, { intern: Omit<InternUserRow, 'id_card_tail'>; months: any[]; summary: any }>();
    const months = monthStatsList.map(stats => {
      const summary = stats.rows.reduce((acc, row) => {
        acc.expected_days += row.summary.expected_days;
        acc.present_days += row.summary.present_days;
        acc.absent_days += row.summary.absent_days;
        acc.exception_days += row.summary.exception_days;
        acc.makeup_count += row.summary.makeup_count;
        acc.rejected_count += row.summary.rejected_count;
        return acc;
      }, { expected_days: 0, present_days: 0, absent_days: 0, exception_days: 0, makeup_count: 0, rejected_count: 0 });
      for (const row of stats.rows) {
        if (!internMap.has(row.intern.id)) {
          internMap.set(row.intern.id, {
            intern: row.intern,
            months: [],
            summary: { expected_days: 0, present_days: 0, absent_days: 0, exception_days: 0, makeup_count: 0, rejected_count: 0 },
          });
        }
        const item = internMap.get(row.intern.id)!;
        item.months.push({ month: stats.month, summary: row.summary });
        item.summary.expected_days += row.summary.expected_days || 0;
        item.summary.present_days += row.summary.present_days || 0;
        item.summary.absent_days += row.summary.absent_days || 0;
        item.summary.exception_days += row.summary.exception_days || 0;
        item.summary.makeup_count += row.summary.makeup_count || 0;
        item.summary.rejected_count += row.summary.rejected_count || 0;
      }
      return { month: stats.month, summary };
    });
    for (const item of internMap.values()) {
      const existing = new Set(item.months.map(month => month.month));
      for (let i = 1; i <= 12; i++) {
        const month = `${year}-${String(i).padStart(2, '0')}`;
        if (!existing.has(month)) {
          item.months.push({ month, summary: { expected_days: 0, present_days: 0, absent_days: 0, exception_days: 0, makeup_count: 0, rejected_count: 0 } });
        }
      }
      item.months.sort((a, b) => a.month.localeCompare(b.month));
    }
    const rows = [...internMap.values()].sort((a, b) => `${a.intern.department}-${a.intern.intern_no}`.localeCompare(`${b.intern.department}-${b.intern.intern_no}`));
    return { year, months, rows };
  },

  async exportMonth(month: string) {
    const stats = await this.monthStats(month);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('实习生打卡统计');
    sheet.columns = [
      { header: '实习生编号', key: 'intern_no', width: 16 },
      { header: '姓名', key: 'name', width: 14 },
      { header: '部门', key: 'department', width: 18 },
      { header: '负责人', key: 'mentor', width: 14 },
      { header: '应出勤天数', key: 'expected_days', width: 14 },
      { header: '出勤天数', key: 'present_days', width: 12 },
      { header: '缺勤天数', key: 'absent_days', width: 12 },
      { header: '异常天数', key: 'exception_days', width: 12 },
      { header: '补卡次数', key: 'makeup_count', width: 12 },
      { header: '驳回次数', key: 'rejected_count', width: 12 },
    ];
    for (const row of stats.rows) sheet.addRow({ ...row.intern, ...row.summary });
    return workbook;
  },

  async exportMonthCalendar(month: string) {
    const stats = await this.monthStats(month);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('实习生月度日历');
    const days = monthRange(month).days;
    sheet.columns = [
      { header: '实习生编号', key: 'intern_no', width: 16 },
      { header: '姓名', key: 'name', width: 14 },
      { header: '部门', key: 'department', width: 18 },
      { header: '负责人', key: 'mentor', width: 14 },
      ...days.map(day => ({ header: day.slice(8), key: day, width: 14 })),
      { header: '应出勤天数', key: 'expected_days', width: 14 },
      { header: '出勤天数', key: 'present_days', width: 12 },
      { header: '缺勤天数', key: 'absent_days', width: 12 },
      { header: '异常天数', key: 'exception_days', width: 12 },
    ];
    for (const row of stats.rows) {
      const data: any = { ...row.intern, ...row.summary };
      for (const day of days) {
        const item = row.days.find((d: any) => d.date === day);
        if (!item) data[day] = '不在实习期';
        else {
          const flags = [];
          if (item.makeup_count) flags.push(`补${item.makeup_count}`);
          if (item.rejected_count) flags.push(`驳${item.rejected_count}`);
          data[day] = `${item.status === 'present' ? '出勤' : '缺勤'}(${item.valid_count})${flags.length ? ` ${flags.join('/')}` : ''}`;
        }
      }
      sheet.addRow(data);
    }
    return workbook;
  },

  async exportYearCalendar(year: string) {
    const stats = await this.yearStats(year);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('实习生年度日历');
    sheet.columns = [
      { header: '实习生编号', key: 'intern_no', width: 16 },
      { header: '姓名', key: 'name', width: 14 },
      { header: '部门', key: 'department', width: 18 },
      { header: '负责人', key: 'mentor', width: 14 },
      ...Array.from({ length: 12 }, (_, index) => {
        const key = `${year}-${String(index + 1).padStart(2, '0')}`;
        return { header: `${index + 1}月`, key, width: 24 };
      }),
      { header: '全年应出勤', key: 'expected_days', width: 14 },
      { header: '全年出勤', key: 'present_days', width: 12 },
      { header: '全年缺勤', key: 'absent_days', width: 12 },
      { header: '全年异常', key: 'exception_days', width: 12 },
    ];
    for (const row of stats.rows) {
      const data: any = { ...row.intern, ...row.summary };
      for (const month of row.months) {
        const s = month.summary;
        data[month.month] = `应${s.expected_days}/出${s.present_days}/缺${s.absent_days}/异${s.exception_days}`;
      }
      sheet.addRow(data);
    }
    return workbook;
  },
};
