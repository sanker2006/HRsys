import assert from 'node:assert/strict';
import {
  getQuestionScorePolicy,
  validateQuestionDataForRole,
  type QuestionData,
} from '../model/self_question.js';
import { composeManagerFinalScore } from '../service/statistics.js';
import { isBlankSelfQuestionImportRow } from '../utils/selfQuestionImport.js';

function questions(performance: number, comprehensive?: number): QuestionData {
  return {
    content_1: '业绩题',
    weight_1: performance,
    ...(comprehensive === undefined ? {} : {
      comp_content_1: '综合题',
      comp_weight_1: comprehensive,
    }),
  };
}

assert.equal(validateQuestionDataForRole(questions(70, 30), 'manager'), null);
assert.equal(validateQuestionDataForRole(questions(100), 'manager'), null);
assert.match(validateQuestionDataForRole(questions(80, 20), 'manager') || '', /70\/30|100\/0/);
assert.match(validateQuestionDataForRole(questions(100), 'staff') || '', /综合评价至少需要 1 道题目/);

assert.deepEqual(getQuestionScorePolicy(questions(70, 30), 'manager'), {
  performance_total: 70,
  comprehensive_total: 30,
  score_mode: 'standard_70_30',
  valid: true,
});
assert.deepEqual(getQuestionScorePolicy(questions(100), 'manager'), {
  performance_total: 100,
  comprehensive_total: 0,
  score_mode: 'performance_only_100_0',
  valid: true,
});
assert.equal(composeManagerFinalScore(88.4, null, 'performance_only_100_0'), 88.4);
assert.equal(composeManagerFinalScore(61.2, 24.5, 'standard_70_30'), 85.7);
assert.equal(composeManagerFinalScore(61.2, null, 'standard_70_30'), null);
assert.equal(isBlankSelfQuestionImportRow({ __row: 2, '\uFEFF 题目状态 ': '未录入' }), true);
assert.equal(isBlankSelfQuestionImportRow({ __row: 2, 题目状态: '已录入', 姓名: '张三' }), false);

console.log('self question policy tests passed');
