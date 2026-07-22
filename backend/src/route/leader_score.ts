import Router from '@koa/router';
import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Context } from 'koa';
import { auth } from '../middleware/auth.js';
import { admin } from '../middleware/admin.js';
import { AnswerModel, LEADER_COMPREHENSIVE_SEQ, LEADER_PERFORMANCE_SEQ, type AnswerRow } from '../model/answer.js';
import { BatchModel } from '../model/batch.js';
import { RelationModel, type RelationRow } from '../model/relation.js';
import { execute, queryOne, transaction } from '../db/query.js';
import { fail, success } from '../utils/response.js';

const router = new Router({ prefix: '/api/v1/answer/admin/leader-score' });
router.use(auth, admin);

type ScoreParts = { performance: number | null; comprehensive: number | null; total: number | null };
type TemplateRow = {
  relation: RelationRow;
  managerSelf: ScoreParts | null;
  managerPeerAverage: number | null;
  employeeSelf: ScoreParts | null;
  employeePeerAverage: number | null;
  managerScore: ScoreParts | null;
};

function round1(value: number): number { return Math.round(value * 10) / 10; }
function oneDecimal(value: number): boolean {
  return Number.isFinite(value) && Math.abs(Math.round(value * 10) - value * 10) < 0.0001;
}
function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return valid.length ? round1(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
}
function totalAnswer(answers: AnswerRow[]): number | null {
  return answers.find(answer => answer.is_total === 1)?.score ?? null;
}
function scoreParts(answers: AnswerRow[]): ScoreParts {
  const explicitPerformance = answers.find(answer => answer.question_seq === LEADER_PERFORMANCE_SEQ)?.score;
  const explicitComprehensive = answers.find(answer => answer.question_seq === LEADER_COMPREHENSIVE_SEQ)?.score;
  const performanceRows = answers.filter(answer => !answer.is_total && Number(answer.question_seq) > 0 && Number(answer.question_seq) <= 100);
  const comprehensiveRows = answers.filter(answer => !answer.is_total && Number(answer.question_seq) > 100);
  const performance = explicitPerformance ?? (performanceRows.length ? round1(performanceRows.reduce((sum, row) => sum + Number(row.score || 0), 0)) : null);
  const comprehensive = explicitComprehensive ?? (comprehensiveRows.length ? round1(comprehensiveRows.reduce((sum, row) => sum + Number(row.score || 0), 0)) : null);
  return { performance, comprehensive, total: totalAnswer(answers) };
}
function roleLabel(level?: string): string {
  if (level === 'manager') return '部门负责人';
  if (level === 'staff') return '员工';
  return level || '';
}
function computeReferenceFingerprint(relations: RelationRow[], answersMap: Map<number, AnswerRow[]>): string {
  const source = relations.map(row => ({
    id: row.id,
    status: row.status,
    updated_at: row.updated_at,
    answers: (answersMap.get(row.id) || []).map(answer => ({
      id: answer.id,
      relation_id: answer.relation_id,
      question_seq: answer.question_seq,
      score: answer.score,
      is_total: answer.is_total,
      is_draft: answer.is_draft,
      created_at: answer.created_at,
      updated_at: answer.updated_at,
    })),
  })).sort((a, b) => a.id - b.id);
  return createHash('sha256').update(JSON.stringify(source)).digest('hex');
}
function safeFileName(value: string): string { return value.replace(/[\\/:*?"<>|]/g, '_'); }
function normalizeUpload(files: any): any | undefined {
  const value = files?.file;
  return Array.isArray(value) ? value[0] : value;
}
async function uploadBuffer(ctx: Context): Promise<Buffer> {
  const file = normalizeUpload((ctx.request as any).files);
  if (!file?.filepath) throw Object.assign(new Error('请选择Excel文件'), { status: 400 });
  if (!String(file.originalFilename || '').toLowerCase().endsWith('.xlsx')) {
    throw Object.assign(new Error('仅支持.xlsx文件'), { status: 400 });
  }
  const buffer = await readFile(file.filepath);
  if (!buffer.length) throw Object.assign(new Error('Excel文件不能为空'), { status: 400 });
  return buffer;
}

async function leaderRelations(batchId: number, leaderId?: number): Promise<RelationRow[]> {
  const rows = await RelationModel.findByBatchId(batchId, { eval_type: 'downward', evaluator_id: leaderId });
  return rows.filter(row => ['main_leader', 'division_leader'].includes(row.evaluator_level || ''));
}

async function buildTemplateContext(batchId: number, leaderId: number) {
  const relations = await leaderRelations(batchId, leaderId);
  if (!relations.length) throw Object.assign(new Error('该领导在当前批次没有评价对象'), { status: 404 });
  const targetIds = new Set(relations.map(row => row.target_id));
  const allRelations = await RelationModel.findByBatchId(batchId);
  const referenceRelations = allRelations.filter(row => {
    if (!targetIds.has(row.target_id)) return false;
    if (row.eval_type === 'self') return true;
    if (row.eval_type === 'peer' && row.evaluator_level === row.target_level) return true;
    return row.eval_type === 'downward' && row.evaluator_level === 'manager' && row.target_level === 'staff';
  });
  const answerRelations = [...relations, ...referenceRelations];
  const answers = await AnswerModel.findByRelationIds([...new Set(answerRelations.map(row => row.id))]);
  const answersMap = new Map<number, AnswerRow[]>();
  for (const answer of answers) {
    if (!answersMap.has(answer.relation_id)) answersMap.set(answer.relation_id, []);
    answersMap.get(answer.relation_id)!.push(answer);
  }
  const completedParts = (relation: RelationRow | undefined): ScoreParts | null => (
    relation?.status === 'completed' ? scoreParts(answersMap.get(relation.id) || []) : null
  );
  const rows: TemplateRow[] = relations.map(relation => {
    const self = referenceRelations.find(row => row.eval_type === 'self' && row.target_id === relation.target_id);
    const peers = referenceRelations.filter(row => row.eval_type === 'peer' && row.target_id === relation.target_id && row.status === 'completed');
    const manager = referenceRelations.find(row => row.eval_type === 'downward' && row.target_id === relation.target_id && row.evaluator_level === 'manager');
    if (relation.target_level === 'manager') {
      return {
        relation,
        managerSelf: completedParts(self),
        managerPeerAverage: average(peers.map(row => completedParts(row)?.total ?? null)),
        employeeSelf: null,
        employeePeerAverage: null,
        managerScore: null,
      };
    }
    return {
      relation,
      managerSelf: null,
      managerPeerAverage: null,
      employeeSelf: completedParts(self),
      employeePeerAverage: average(peers.map(row => completedParts(row)?.total ?? null)),
      managerScore: completedParts(manager),
    };
  });
  return { relations, rows, answersMap, referenceRelations, referenceFingerprint: computeReferenceFingerprint(referenceRelations, answersMap) };
}

export function addTemplateSheet(workbook: ExcelJS.Workbook, rows: TemplateRow[], batchId: number, leaderId: number, fingerprint: string) {
  const sheet = workbook.addWorksheet('领导评分');
  sheet.columns = [
    { header: '关系ID', key: 'relation_id', width: 12, hidden: true },
    { header: '批次ID', key: 'batch_id', width: 12, hidden: true },
    { header: '领导ID', key: 'leader_id', width: 12, hidden: true },
    { header: '参考数据指纹', key: 'fingerprint', width: 18, hidden: true },
    { header: '工号', key: 'employee_no', width: 14 },
    { header: '姓名', key: 'name', width: 14 },
    { header: '部门', key: 'department', width: 20 },
    { header: '角色', key: 'role', width: 14 },
    { header: '主管自评业绩', key: 'manager_self_performance', width: 16 },
    { header: '主管自评综合', key: 'manager_self_comprehensive', width: 16 },
    { header: '主管互评平均分', key: 'manager_peer_average', width: 17 },
    { header: '员工自评业绩', key: 'employee_self_performance', width: 16 },
    { header: '员工自评综合', key: 'employee_self_comprehensive', width: 16 },
    { header: '员工互评平均分', key: 'employee_peer_average', width: 17 },
    { header: '主管评员工业绩', key: 'manager_performance', width: 17 },
    { header: '主管评员工综合', key: 'manager_comprehensive', width: 17 },
    { header: '领导业绩评分（0-70）', key: 'leader_performance', width: 22 },
    { header: '领导综合评分（0-30）', key: 'leader_comprehensive', width: 22 },
  ];
  for (const row of rows) {
    sheet.addRow({
      relation_id: row.relation.id,
      batch_id: batchId,
      leader_id: leaderId,
      fingerprint,
      employee_no: row.relation.target_employee_no || '',
      name: row.relation.target_name,
      department: row.relation.target_department,
      role: roleLabel(row.relation.target_level),
      manager_self_performance: row.managerSelf?.performance ?? '',
      manager_self_comprehensive: row.managerSelf?.comprehensive ?? '',
      manager_peer_average: row.managerPeerAverage ?? '',
      employee_self_performance: row.employeeSelf?.performance ?? '',
      employee_self_comprehensive: row.employeeSelf?.comprehensive ?? '',
      employee_peer_average: row.employeePeerAverage ?? '',
      manager_performance: row.managerScore?.performance ?? '',
      manager_comprehensive: row.managerScore?.comprehensive ?? '',
      leader_performance: '',
      leader_comprehensive: '',
    });
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF036486' } };
  sheet.autoFilter = { from: 'E1', to: 'R1' };
  sheet.getColumn(17).eachCell((cell, rowNumber) => { if (rowNumber > 1) cell.dataValidation = { type: 'decimal', operator: 'between', formulae: [0, 70] }; });
  sheet.getColumn(18).eachCell((cell, rowNumber) => { if (rowNumber > 1) cell.dataValidation = { type: 'decimal', operator: 'between', formulae: [0, 30] }; });
}

export function parseLeaderScoreSheet(
  sheet: ExcelJS.Worksheet,
  expected: Map<number, RelationRow>,
  batchId: number,
  leaderId: number,
  fileFingerprint: string
) {
  const parsed: Array<{ relation: RelationRow; performance: number; comprehensive: number }> = [];
  const seen = new Set<number>();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const populated = Array.from({ length: 18 }, (_, index) => row.getCell(index + 1).value)
      .some(value => value !== null && value !== undefined && value !== '');
    if (!populated) continue;
    const relationId = Number(row.getCell(1).value);
    const fileBatchId = Number(row.getCell(2).value);
    const fileLeaderId = Number(row.getCell(3).value);
    const fingerprint = String(row.getCell(4).value || '');
    const relation = expected.get(relationId);
    const identityMatches = relation
      && String(row.getCell(5).value || '') === String(relation.target_employee_no || '')
      && String(row.getCell(6).value || '') === String(relation.target_name || '')
      && String(row.getCell(7).value || '') === String(relation.target_department || '')
      && String(row.getCell(8).value || '') === roleLabel(relation.target_level);
    if (!relation || fileBatchId !== batchId || fileLeaderId !== leaderId || fingerprint !== fileFingerprint || !identityMatches) {
      throw Object.assign(new Error(`第${rowNumber}行身份或参考数据校验失败`), { status: 400 });
    }
    if (seen.has(relationId)) throw Object.assign(new Error(`第${rowNumber}行关系重复`), { status: 400 });
    const performanceValue = row.getCell(17).value;
    const comprehensiveValue = row.getCell(18).value;
    if (performanceValue === null || performanceValue === undefined || performanceValue === '') {
      throw Object.assign(new Error(`第${rowNumber}行领导业绩评分不能为空`), { status: 400 });
    }
    if (comprehensiveValue === null || comprehensiveValue === undefined || comprehensiveValue === '') {
      throw Object.assign(new Error(`第${rowNumber}行领导综合评分不能为空`), { status: 400 });
    }
    const performance = typeof performanceValue === 'number' ? performanceValue : Number.NaN;
    const comprehensive = typeof comprehensiveValue === 'number' ? comprehensiveValue : Number.NaN;
    if (!oneDecimal(performance) || performance < 0 || performance > 70) {
      throw Object.assign(new Error(`第${rowNumber}行领导业绩评分必须为0~70且最多1位小数`), { status: 400 });
    }
    if (!oneDecimal(comprehensive) || comprehensive < 0 || comprehensive > 30) {
      throw Object.assign(new Error(`第${rowNumber}行领导综合评分必须为0~30且最多1位小数`), { status: 400 });
    }
    seen.add(relationId);
    parsed.push({ relation, performance: round1(performance), comprehensive: round1(comprehensive) });
  }
  if (seen.size !== expected.size) throw Object.assign(new Error(`模板必须完整填写全部${expected.size}名评价对象`), { status: 400 });
  return parsed;
}

async function parseWorkbook(buffer: Buffer, batchId: number, leaderId: number, expectedFingerprint?: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.getWorksheet('领导评分') || workbook.worksheets[0];
  if (!sheet) throw Object.assign(new Error('Excel中没有评分工作表'), { status: 400 });
  const fileFingerprint = String(sheet.getRow(2).getCell(4).value || '');
  if (!fileFingerprint) throw Object.assign(new Error('模板缺少参考数据指纹，请重新下载'), { status: 400 });
  if (expectedFingerprint && fileFingerprint !== expectedFingerprint) {
    throw Object.assign(new Error('导入模板与预览模板不一致'), { status: 409 });
  }
  const context = await buildTemplateContext(batchId, leaderId);
  if (context.referenceFingerprint !== fileFingerprint) {
    throw Object.assign(new Error('参考评分已发生变化，请重新下载模板'), { status: 409 });
  }
  const expected = new Map(context.relations.map(row => [row.id, row]));
  const parsed = parseLeaderScoreSheet(sheet, expected, batchId, leaderId, fileFingerprint);
  return { parsed, context, referenceFingerprint: fileFingerprint };
}

async function validateLeaderPrerequisites(batchId: number, relations: RelationRow[]): Promise<string | null> {
  const all = await RelationModel.findByBatchId(batchId);
  for (const relation of relations) {
    if (relation.target_level === 'manager') {
      const self = all.find(row => row.eval_type === 'self' && row.target_id === relation.target_id);
      if (self?.status !== 'completed') return `${relation.target_name}尚未完成负责人自评`;
      const staffRows = all.filter(row => row.eval_type === 'downward' && row.evaluator_id === relation.target_id && row.target_level === 'staff');
      if (!staffRows.length || staffRows.some(row => row.status !== 'completed')) return `${relation.target_name}尚未完成所负责部门的全部员工评分`;
    } else {
      const manager = all.find(row => row.eval_type === 'downward' && row.target_id === relation.target_id && row.evaluator_level === 'manager');
      if (manager?.status !== 'completed') return `${relation.target_name}的部门负责人评分尚未完成`;
      const staffRows = all.filter(row => row.eval_type === 'downward' && row.evaluator_id === manager.evaluator_id && row.target_level === 'staff');
      if (staffRows.some(row => row.status !== 'completed')) return `${manager.evaluator_name}尚未完成所负责部门的全部员工评分`;
    }
  }
  return null;
}

router.get('/:batchId', async (ctx: Context) => {
  const batchId = Number(ctx.params.batchId);
  const batch = await BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  const rows = await leaderRelations(batchId);
  const grouped = new Map<number, RelationRow[]>();
  for (const row of rows) {
    if (!grouped.has(row.evaluator_id)) grouped.set(row.evaluator_id, []);
    grouped.get(row.evaluator_id)!.push(row);
  }
  const list = await Promise.all([...grouped.values()].map(async relations => {
    const leaderId = relations[0].evaluator_id;
    const latestImport = await queryOne<{ created_at: string }>(
      `SELECT created_at FROM log
       WHERE action = 'leader_score.import'
         AND CAST(JSON_UNQUOTE(JSON_EXTRACT(detail, '$.batch_id')) AS UNSIGNED) = ?
         AND CAST(JSON_UNQUOTE(JSON_EXTRACT(detail, '$.leader_id')) AS UNSIGNED) = ?
       ORDER BY id DESC LIMIT 1`,
      [batchId, leaderId]
    );
    return {
      leader_id: relations[0].evaluator_id,
      leader_name: relations[0].evaluator_name,
      leader_department: relations[0].evaluator_department,
      leader_level: relations[0].evaluator_level,
      total: relations.length,
      completed: relations.filter(row => row.status === 'completed').length,
      draft: relations.filter(row => row.status === 'draft').length,
      pending: relations.filter(row => row.status === 'pending').length,
      updated_at: relations.map(row => row.updated_at).sort().at(-1),
      last_import_at: latestImport?.created_at ?? null,
    };
  }));
  success(ctx, { batch, list });
});

router.get('/:batchId/:leaderId/export', async (ctx: Context) => {
  const batchId = Number(ctx.params.batchId);
  const leaderId = Number(ctx.params.leaderId);
  const batch = await BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  const context = await buildTemplateContext(batchId, leaderId);
  const workbook = new ExcelJS.Workbook();
  addTemplateSheet(workbook, context.rows, batchId, leaderId, context.referenceFingerprint);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const leaderName = context.relations[0].evaluator_name || String(leaderId);
  ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  ctx.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`领导评分-${safeFileName(batch.name)}-${safeFileName(leaderName)}.xlsx`)}`);
  ctx.body = buffer;
  await execute('INSERT INTO log (user_id, action, ip, detail) VALUES (?, ?, ?, ?)', [
    Number(ctx.state.userId), 'leader_score.export', ctx.ip || null, JSON.stringify({ batch_id: batchId, leader_id: leaderId }),
  ]);
});

router.post('/:batchId/:leaderId/preview', async (ctx: Context) => {
  const batchId = Number(ctx.params.batchId);
  const leaderId = Number(ctx.params.leaderId);
  const batch = await BatchModel.findById(batchId);
  if (!batch) return fail(ctx, '批次不存在', -1, 404);
  if (batch.status === 'closed') return fail(ctx, '已结束批次不能导入评分', -1, 409);
  const buffer = await uploadBuffer(ctx);
  const result = await parseWorkbook(buffer, batchId, leaderId);
  const prerequisiteError = await validateLeaderPrerequisites(batchId, result.parsed.map(item => item.relation));
  if (prerequisiteError) return fail(ctx, prerequisiteError, -1, 409);
  const fileHash = createHash('sha256').update(buffer).digest('hex');
  const conflicts = result.parsed.filter(item => item.relation.status === 'completed').map(item => ({
    relation_id: item.relation.id, target_name: item.relation.target_name,
  }));
  await execute('INSERT INTO log (user_id, action, ip, detail) VALUES (?, ?, ?, ?)', [
    Number(ctx.state.userId), 'leader_score.preview', ctx.ip || null,
    JSON.stringify({ batch_id: batchId, leader_id: leaderId, rows: result.parsed.length, conflicts: conflicts.length, file_hash: fileHash }),
  ]);
  success(ctx, { file_hash: fileHash, reference_fingerprint: result.referenceFingerprint, rows: result.parsed.length, conflicts });
});

router.post('/:batchId/:leaderId/import', async (ctx: Context) => {
  const batchId = Number(ctx.params.batchId);
  const leaderId = Number(ctx.params.leaderId);
  const batchGate = await BatchModel.assertAcceptingSubmissions(batchId);
  if (!batchGate.ok) return fail(ctx, batchGate.message, -1, 409);
  const buffer = await uploadBuffer(ctx);
  const body = ctx.request.body as any;
  const expectedHash = String(body?.file_hash || '');
  const actualHash = createHash('sha256').update(buffer).digest('hex');
  if (!expectedHash || expectedHash !== actualHash) return fail(ctx, '导入文件与预览文件不一致', -1, 409);
  const fingerprint = String(body?.reference_fingerprint || '');
  const result = await parseWorkbook(buffer, batchId, leaderId, fingerprint);
  const prerequisiteError = await validateLeaderPrerequisites(batchId, result.parsed.map(item => item.relation));
  if (prerequisiteError) return fail(ctx, prerequisiteError, -1, 409);
  const conflicts = result.parsed.filter(item => item.relation.status === 'completed');
  if (conflicts.length && String(body?.confirm_overwrite) !== 'true') {
    return fail(ctx, `存在${conflicts.length}条已完成评分，请确认覆盖`, -1, 409);
  }
  await transaction(async tx => {
    const lockedReferenceRelations: RelationRow[] = [];
    const lockedAnswers = new Map<number, AnswerRow[]>();
    for (const reference of result.context.referenceRelations.slice().sort((a, b) => a.id - b.id)) {
      const current = await tx.queryOne<RelationRow>('SELECT * FROM relation WHERE id = ? FOR UPDATE', [reference.id]);
      if (!current) throw Object.assign(new Error('参考评价关系已不存在，请重新下载模板'), { status: 409 });
      lockedReferenceRelations.push(current);
      lockedAnswers.set(reference.id, await tx.queryAll<AnswerRow>(
        'SELECT * FROM answer WHERE relation_id = ? ORDER BY question_seq IS NOT NULL, question_seq',
        [reference.id]
      ));
    }
    if (computeReferenceFingerprint(lockedReferenceRelations, lockedAnswers) !== fingerprint) {
      throw Object.assign(new Error('参考评分已发生变化，请重新下载模板'), { status: 409 });
    }
    for (const item of result.parsed.sort((a, b) => a.relation.id - b.relation.id)) {
      await tx.queryOne('SELECT id FROM relation WHERE id = ? FOR UPDATE', [item.relation.id]);
      await AnswerModel.replaceLeaderTotals(tx, item.relation.id, item.performance, item.comprehensive, 'completed');
    }
    await tx.execute('INSERT INTO log (user_id, action, ip, detail) VALUES (?, ?, ?, ?)', [
      Number(ctx.state.userId), 'leader_score.import', ctx.ip || null,
      JSON.stringify({ batch_id: batchId, leader_id: leaderId, rows: result.parsed.length, overwritten: conflicts.length, file_hash: actualHash }),
    ]);
  });
  success(ctx, { imported: result.parsed.length, overwritten: conflicts.length }, '领导评分导入成功');
});

export default router;
