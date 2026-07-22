import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import type { RelationRow } from '../model/relation.js';
import { parseLeaderScoreSheet } from '../route/leader_score.js';

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
  sheet.addRow(Array.from({ length: 18 }, (_, index) => `列${index + 1}`));
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
    row.getCell(17).value = performance;
    row.getCell(18).value = comprehensive;
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

console.log('leader score template tests passed');
