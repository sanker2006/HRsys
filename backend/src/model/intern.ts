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

export interface AttendanceRange {
  start: string;
  end: string;
  days: string[];
  mode: 'month' | 'custom';
  label: string;
}

export interface AttendanceFilters {
  month?: string;
  startDate?: string;
  endDate?: string;
  internId?: number;
  department?: string;
  keyword?: string;
  status?: string;
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

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function dateRange(start: string, end: string): AttendanceRange {
  if (!validDate(start) || !validDate(end)) throw new Error('日期格式必须是 YYYY-MM-DD');
  if (start > end) throw new Error('开始日期不能晚于结束日期');
  const startAt = Date.parse(`${start}T00:00:00Z`);
  const endAt = Date.parse(`${end}T00:00:00Z`);
  const count = Math.floor((endAt - startAt) / 86400000) + 1;
  if (count > 366) throw new Error('自定义日期范围最多支持 366 天');
  const days = Array.from({ length: count }, (_, index) => {
    const value = new Date(startAt + index * 86400000);
    return value.toISOString().slice(0, 10);
  });
  return { start, end, days, mode: 'custom', label: `${start}至${end}` };
}

function attendanceRange(filters: Pick<AttendanceFilters, 'month' | 'startDate' | 'endDate'> = {}): AttendanceRange {
  if (filters.startDate || filters.endDate) {
    if (!filters.startDate || !filters.endDate) throw new Error('自定义查询必须同时提供开始日期和结束日期');
    return dateRange(filters.startDate, filters.endDate);
  }
  const month = filters.month || localDate().slice(0, 7);
  const range = monthRange(month);
  return { ...range, mode: 'month', label: month };
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

async function rowsForRange(range: AttendanceRange, filters: AttendanceFilters = {}) {
  let userSql = 'SELECT * FROM intern_user WHERE 1=1';
  const userParams: any[] = [];
  if (filters.internId) { userSql += ' AND id = ?'; userParams.push(filters.internId); }
  if (filters.department) { userSql += ' AND department = ?'; userParams.push(filters.department); }
  if (filters.status) { userSql += ' AND status = ?'; userParams.push(normalizeStatus(filters.status)); }
  if (filters.keyword) {
    userSql += ' AND (name LIKE ? OR intern_no LIKE ?)';
    userParams.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
  }
  userSql += ' ORDER BY department, intern_no';
  const users = await queryAll<InternUserRow>(userSql, userParams);
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

function buildDailyStats(
  user: InternUserRow,
  range: { days: string[] },
  records: InternAttendanceRecordRow[],
  adjustments: InternAttendanceAdjustmentRow[],
  zeroAsAbsent = true
) {
  const invalid = invalidRecordIds(adjustments);
  return range.days
    .filter(day => dateInRange(day, user.start_date, user.end_date))
    .map(day => {
      const dayRecords = records.filter(r => r.intern_id === user.id && r.punch_date === day);
      const validRecords = dayRecords.filter(r => !invalid.has(r.id));
      const makeup = adjustments.filter(a => a.intern_id === user.id && a.target_date === day && a.action === 'makeup').length;
      const rejected = adjustments.filter(a => a.intern_id === user.id && a.target_date === day && (a.action === 'reject' || a.action === 'void')).length;
      const valid_count = validRecords.length + makeup;
      const status = valid_count >= 2 ? 'present' : valid_count === 1 || zeroAsAbsent ? 'absent' : 'unrecorded';
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

function timeOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/(\d{2}:\d{2}:\d{2})/);
  return match?.[1] || null;
}

function dayCellText(day: ReturnType<typeof buildDailyStats>[number]): string {
  const lines: string[] = [];
  const first = timeOnly(day.first_time);
  const last = timeOnly(day.last_time);
  if (first) lines.push(first);
  if (last && last !== first) lines.push(last);
  if (day.makeup_count > 0) lines.push(`补卡×${day.makeup_count}`);
  return lines.join('\n');
}

function latestAdjustmentByRecord(adjustments: InternAttendanceAdjustmentRow[]) {
  const map = new Map<number, InternAttendanceAdjustmentRow>();
  for (const item of adjustments) {
    if (item.record_id) map.set(item.record_id, item);
  }
  return map;
}

function decorateRecord(row: InternAttendanceRecordRow, adjustment?: InternAttendanceAdjustmentRow) {
  const invalid = adjustment?.action === 'reject' || adjustment?.action === 'void';
  const actionLabels: Record<string, string> = { reject: '驳回', void: '作废', restore: '恢复' };
  return {
    ...recordPublic(row),
    valid_status: invalid ? 'invalid' : 'valid',
    adjustment_action: adjustment?.action || null,
    adjustment_note: adjustment ? `${actionLabels[adjustment.action] || adjustment.action}：${adjustment.reason}` : '',
  };
}

function styleWorkbookSheet(sheet: ExcelJS.Worksheet, freezeColumns = 0) {
  sheet.views = [{ state: 'frozen', xSplit: freezeColumns, ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  const header = sheet.getRow(1);
  header.height = 30;
  header.font = { name: 'Microsoft YaHei', bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B5F83' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.font = { name: 'Microsoft YaHei', size: 10 };
    row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    row.height = 34;
    if (rowNumber % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F7FA' } };
    }
  });
  const border: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD7E2EA' } },
    left: { style: 'thin', color: { argb: 'FFD7E2EA' } },
    bottom: { style: 'thin', color: { argb: 'FFD7E2EA' } },
    right: { style: 'thin', color: { argb: 'FFD7E2EA' } },
  };
  sheet.eachRow(row => row.eachCell(cell => { cell.border = border; }));
}

export const InternModel = {
  normalizeStatus,
  publicIntern,
  recordPublic,
  localDate,
  attendanceRange,
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
    const hasLatitude = data.latitude !== null && data.latitude !== undefined && String(data.latitude).trim() !== '';
    const hasLongitude = data.longitude !== null && data.longitude !== undefined && String(data.longitude).trim() !== '';
    const hasGps = hasLatitude && hasLongitude && Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude));
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

  async records(filters: AttendanceFilters = {}, page = 1, pageSize = 20) {
    const range = attendanceRange(filters);
    let fromSql = `FROM intern_attendance_record r JOIN intern_user u ON r.intern_id = u.id
      WHERE r.punch_date >= ? AND r.punch_date <= ?`;
    const params: any[] = [range.start, range.end];
    if (filters.internId) { fromSql += ' AND r.intern_id = ?'; params.push(filters.internId); }
    if (filters.department) { fromSql += ' AND u.department = ?'; params.push(filters.department); }
    if (filters.status) { fromSql += ' AND u.status = ?'; params.push(normalizeStatus(filters.status)); }
    if (filters.keyword) {
      fromSql += ' AND (u.name LIKE ? OR u.intern_no LIKE ?)';
      params.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
    }
    const total = Number((await queryOne<{ total: number }>(`SELECT COUNT(*) AS total ${fromSql}`, params))?.total || 0);
    let sql = `SELECT r.*, u.intern_no, u.name as intern_name, u.department ${fromSql} ORDER BY r.punch_time DESC, r.id DESC`;
    const listParams = [...params];
    if (pageSize > 0) {
      sql += ' LIMIT ? OFFSET ?';
      listParams.push(pageSize, (page - 1) * pageSize);
    }
    const rows = await queryAll<InternAttendanceRecordRow>(sql, listParams);
    const ids = rows.map(row => row.id);
    let adjustmentMap = new Map<number, InternAttendanceAdjustmentRow>();
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const adjustments = await queryAll<InternAttendanceAdjustmentRow>(
        `SELECT * FROM intern_attendance_adjustment WHERE record_id IN (${placeholders}) ORDER BY created_at ASC, id ASC`,
        ids
      );
      adjustmentMap = latestAdjustmentByRecord(adjustments);
    }
    return {
      range,
      list: rows.map(row => decorateRecord(row, adjustmentMap.get(row.id))),
      total,
      page,
      pageSize: pageSize > 0 ? pageSize : total,
    };
  },

  async recordPhoto(recordId: number) {
    return queryOne<Pick<InternAttendanceRecordRow, 'id' | 'photo_data' | 'photo_mime'>>(
      'SELECT id, photo_data, photo_mime FROM intern_attendance_record WHERE id = ?',
      [recordId]
    );
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

  async rangeStats(filters: AttendanceFilters = {}) {
    const range = attendanceRange(filters);
    const data = await rowsForRange(range, filters);
    const rows = data.users.map(user => {
      const days = buildDailyStats(user, data.range, data.records, data.adjustments, false);
      return {
        intern: publicIntern(user),
        days,
        summary: {
          present_days: days.filter(day => day.status === 'present').length,
          absent_days: days.filter(day => day.status === 'absent').length,
          unrecorded_days: days.filter(day => day.status === 'unrecorded').length,
        },
      };
    });
    return { range, rows };
  },

  async monthStats(month: string, internId?: number) {
    const range = attendanceRange({ month });
    const data = await rowsForRange(range, { internId });
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

  async exportAttendance(filters: AttendanceFilters = {}) {
    const stats = await this.rangeStats(filters);
    const recordData = await this.records(filters, 1, 0);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HRsys';
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet('出勤统计');
    summarySheet.columns = [
      { header: '序号', key: 'index', width: 9 },
      { header: '实习生编号', key: 'intern_no', width: 16 },
      { header: '实习生姓名', key: 'name', width: 14 },
      { header: '部门', key: 'department', width: 20 },
      { header: '出勤天数', key: 'present_days', width: 12 },
      { header: '缺勤天数', key: 'absent_days', width: 12 },
      ...stats.range.days.map(day => ({ header: day, key: day, width: 17 })),
    ];
    stats.rows.forEach((row, index) => {
      const data: Record<string, unknown> = {
        index: index + 1,
        ...row.intern,
        department: row.intern.department || null,
        ...row.summary,
      };
      for (const day of stats.range.days) {
        const detail = row.days.find(item => item.date === day);
        data[day] = detail ? dayCellText(detail) || null : null;
      }
      summarySheet.addRow(data);
    });
    styleWorkbookSheet(summarySheet, 6);

    const recordSheet = workbook.addWorksheet('原始打卡记录');
    recordSheet.columns = [
      { header: '序号', key: 'index', width: 9 },
      { header: '日期', key: 'punch_date', width: 14 },
      { header: '打卡时间', key: 'punch_time', width: 14 },
      { header: '实习生编号', key: 'intern_no', width: 16 },
      { header: '姓名', key: 'intern_name', width: 14 },
      { header: '部门', key: 'department', width: 20 },
      { header: '证据类型', key: 'evidence_type', width: 14 },
      { header: '经纬度', key: 'location', width: 25 },
      { header: '定位精度', key: 'accuracy', width: 13 },
      { header: '是否有照片', key: 'has_photo', width: 13 },
      { header: '来源', key: 'source', width: 13 },
      { header: '有效状态', key: 'valid_status', width: 13 },
      { header: '调整说明', key: 'adjustment_note', width: 32 },
    ];
    const evidenceLabels: Record<string, string> = { gps: 'GPS', photo: '照片', gps_photo: 'GPS+照片' };
    recordData.list.forEach((record: any, index: number) => {
      recordSheet.addRow({
        index: index + 1,
        punch_date: record.punch_date,
        punch_time: timeOnly(record.punch_time) || '',
        intern_no: record.intern_no,
        intern_name: record.intern_name,
        department: record.department,
        evidence_type: evidenceLabels[record.evidence_type] || record.evidence_type || '-',
        location: record.latitude == null || record.longitude == null ? null : `${Number(record.latitude).toFixed(6)}, ${Number(record.longitude).toFixed(6)}`,
        accuracy: record.accuracy == null ? null : `${Number(record.accuracy).toFixed(1)}m`,
        has_photo: record.has_photo ? '是' : '否',
        source: record.source || '-',
        valid_status: record.valid_status === 'invalid' ? '无效' : '有效',
        adjustment_note: record.adjustment_note || null,
      });
    });
    styleWorkbookSheet(recordSheet, 0);
    return workbook;
  },
};
