import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import type { RelationRow } from '../model/relation.js';
import {
  addTemplateSheet,
  buildLeaderTemplateRows,
  parseLeaderScoreSheet,
} from '../route/leader_score.js';

function relation(id: number): RelationRow {
  return {
    id, batch_id: 9, evaluator_id: 7, target_id: id + 100,
    role_type: 'main_leader', eval_type: 'downward', status: 'pending',
    is_anonymous: 0, created_at: '', updated_at: '', target_name: `对象${id}`, target_employee_no: `NO${id}`, target_department: '', target_level: 'staff',
  };
}

function sheetWithRows(values: Array<[number, number, number]>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('领导评分');
  sheet.addRow(Array.from({ length: 20 }, (_, index) => `列${index + 1}`));
  for (const [relationId, performance, comprehensive] of values) {
    const row = sheet.addRow([]);
    row.getCell(1).value = relationId;
    row.getCell(2).value = 9;
    row.getCell(3).value = 7;
    row.getCell(4).value = 'fingerprint';
    row.getCell(5).value = `NO${relationId}`;
    row.getCell(6).value = `对象${relationId}`;
    row.getCell(7).value = '';
    row.getCell(8).value = '员工';
    row.getCell(19).value = performance;
    row.getCell(20).value = comprehensive;
  }
  return sheet;
}

const expected = new Map([[1, relation(1)], [2, relation(2)]]);
const valid = parseLeaderScoreSheet(sheetWithRows([[1, 66.5, 28], [2, 60, 25.5]]), expected, 9, 7, 'fingerprint');
assert.deepEqual(valid.map(row => [row.relation.id, row.performance, row.comprehensive]), [[1, 66.5, 28], [2, 60, 25.5]]);
assert.throws(() => parseLeaderScoreSheet(sheetWithRows([[1, 66, 28]]), expected, 9, 7, 'fingerprint'), /完整填写/);
assert.throws(() => parseLeaderScoreSheet(sheetWithRows([[1, 66, 28], [2, 60, Number.NaN]]), expected, 9, 7, 'fingerprint'), /0~30/);
assert.throws(() => parseLeaderScoreSheet(sheetWithRows([[1, 71, 28], [2, 60, 25]]), expected, 9, 7, 'fingerprint'), /0~70/);
assert.throws(() => parseLeaderScoreSheet(sheetWithRows([[1, 66, 28], [1, 60, 25]]), expected, 9, 7, 'fingerprint'), /重复/);

const leaderToManager = {
  ...relation(10),
  target_id: 110,
  target_name: '负责人',
  target_level: 'manager',
} as RelationRow;
const leaderToStaff = {
  ...relation(11),
  target_id: 111,
  target_name: '员工',
} as RelationRow;
const references = [
  {
    ...relation(20),
    evaluator_id: 201,
    target_id: 110,
    eval_type: 'upward',
    evaluator_level: 'staff',
    target_level: 'manager',
    status: 'completed',
  },
  {
    ...relation(21),
    evaluator_id: 202,
    target_id: 110,
    eval_type: 'peer',
    evaluator_level: 'staff',
    target_level: 'manager',
    status: 'completed',
  },
  {
    ...relation(22),
    evaluator_id: 203,
    target_id: 111,
    eval_type: 'peer',
    evaluator_level: 'staff',
    target_level: 'staff',
    status: 'completed',
  },
  {
    ...relation(23),
    evaluator_id: 204,
    target_id: 111,
    eval_type: 'peer',
    evaluator_level: 'staff',
    target_level: 'staff',
    status: 'completed',
  },
] as RelationRow[];
const answers = new Map<number, any[]>([
  [20, [{ relation_id: 20, score: 24, is_total: 1 }]],
  [21, [{ relation_id: 21, score: 28, is_total: 1 }]],
  [22, [{ relation_id: 22, score: 25, is_total: 1 }]],
  [23, [{ relation_id: 23, score: 27, is_total: 1 }]],
]);
const templateRows = buildLeaderTemplateRows(
  [leaderToManager, leaderToStaff],
  references,
  answers,
  [...references, leaderToManager, leaderToStaff]
);
assert.equal(templateRows[0].managerUpwardAverage, 26);
assert.equal(templateRows[0].managerPeerAverage, null);
assert.equal(templateRows[1].employeePeerAverage, 26);

const partialRows = buildLeaderTemplateRows(
  [leaderToManager],
  [{ ...references[0], status: 'draft' }, references[1]],
  answers,
  [{ ...references[0], status: 'draft' }, references[1], leaderToManager]
);
assert.equal(partialRows[0].managerUpwardAverage, null);

const partialEmployeeRows = buildLeaderTemplateRows(
  [leaderToStaff],
  [{ ...references[2], status: 'draft' }, references[3]],
  answers,
  [{ ...references[2], status: 'draft' }, references[3], leaderToStaff]
);
assert.equal(partialEmployeeRows[0].employeePeerAverage, null);

const workbook = new ExcelJS.Workbook();
addTemplateSheet(workbook, templateRows, 9, 7, 'fingerprint');
const exported = workbook.getWorksheet('领导评分')!;
assert.equal(exported.getCell('N1').value, '员工自评业绩');
assert.equal(exported.getCell('P1').value, '员工互评平均分');
assert.equal(exported.getCell('M1').value, '员工向上评价平均分');
assert.equal(exported.getCell('S1').value, '领导业绩评分（0-70）');
assert.equal(exported.getCell('T1').value, '领导综合评分（0-30）');

console.log('leader score template tests passed');
