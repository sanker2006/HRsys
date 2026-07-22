import assert from 'node:assert/strict';
import { buildGradeConstraints, classifyGrade, evaluateGradePolicy } from '../service/scoreGradePolicy.js';

assert.equal(classifyGrade(91, 100), 'A');
assert.equal(classifyGrade(90.9, 100), 'B');
assert.equal(classifyGrade(81, 100), 'B');
assert.equal(classifyGrade(80.9, 100), 'C');
assert.equal(classifyGrade(71, 100), 'C');
assert.equal(classifyGrade(70.9, 100), 'D');
assert.equal(classifyGrade(60, 100), 'D');
assert.equal(classifyGrade(59.9, 100), 'E');
assert.equal(classifyGrade(27.1, 30), 'A');
assert.equal(classifyGrade(27, 30), 'B');
assert.equal(classifyGrade(24.1, 30), 'B');
assert.equal(classifyGrade(24, 30), 'C');
assert.equal(classifyGrade(21.1, 30), 'C');
assert.equal(classifyGrade(21, 30), 'D');
assert.equal(classifyGrade(18, 30), 'D');
assert.equal(classifyGrade(17.9, 30), 'E');

assert.deepEqual(buildGradeConstraints(4).map(item => [item.key, item.min, item.max]), [
  ['AB', 1, 1], ['CD', 2, 2], ['E', 1, 1],
]);
assert.equal(evaluateGradePolicy([95], 3, 100).valid, true);
assert.equal(evaluateGradePolicy([95, 92], 3, 100).valid, false);
assert.equal(evaluateGradePolicy([95, 80, 70, 50], 4, 100).valid, true);
assert.equal(evaluateGradePolicy([95, 85], 4, 100).valid, false);
assert.equal(evaluateGradePolicy([95, 85, 75, 72], 5, 100).valid, false);
assert.equal(evaluateGradePolicy([95, 85, 75, 65, 50], 5, 100).valid, true);
assert.equal(evaluateGradePolicy([29, 26, 23, 20, 15], 5, 30).valid, true);
assert.equal(evaluateGradePolicy([95, 85, 75], 6, 100).valid, true);
assert.equal(evaluateGradePolicy([95, 85, 75, 72], 6, 100).valid, false);

console.log('score grade policy tests passed');
