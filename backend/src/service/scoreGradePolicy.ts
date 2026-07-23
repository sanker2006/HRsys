export type ScoreScale = 30 | 100;
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';

export interface GradeConstraint {
  key: string;
  label: string;
  grades: Grade[];
  min: number;
  max: number;
}

export interface GradeRange {
  min: number;
  max: number;
  label: string;
}

export interface GradePolicyResult {
  scale: ScoreScale;
  group_size: number;
  completed: number;
  remaining: number;
  counts: Record<Grade, number>;
  ranges: Record<Grade, GradeRange>;
  remaining_capacity: Record<Grade, number>;
  constraints: GradeConstraint[];
  valid: boolean;
  message: string | null;
}

const EMPTY_COUNTS = (): Record<Grade, number> => ({ A: 0, B: 0, C: 0, D: 0, E: 0 });
const GRADES: Grade[] = ['A', 'B', 'C', 'D', 'E'];

export function gradeRanges(scale: ScoreScale): Record<Grade, GradeRange> {
  return scale === 100
    ? {
      A: { min: 91, max: 100, label: '91.0～100.0' },
      B: { min: 81, max: 90.9, label: '81.0～90.9' },
      C: { min: 71, max: 80.9, label: '71.0～80.9' },
      D: { min: 60, max: 70.9, label: '60.0～70.9' },
      E: { min: 0, max: 59.9, label: '0～59.9' },
    }
    : {
      A: { min: 27.1, max: 30, label: '27.1～30.0' },
      B: { min: 24.1, max: 27, label: '24.1～27.0' },
      C: { min: 21.1, max: 24, label: '21.1～24.0' },
      D: { min: 18, max: 21, label: '18.0～21.0' },
      E: { min: 0, max: 17.9, label: '0～17.9' },
    };
}

export function classifyGrade(score: number, scale: ScoreScale): Grade {
  if (!Number.isFinite(score) || score < 0 || score > scale) {
    throw new Error(`评分必须在 0~${scale} 之间`);
  }
  if (scale === 100) {
    if (score >= 91) return 'A';
    if (score >= 81) return 'B';
    if (score >= 71) return 'C';
    if (score >= 60) return 'D';
    return 'E';
  }
  if (score >= 27.1) return 'A';
  if (score >= 24.1) return 'B';
  if (score >= 21.1) return 'C';
  if (score >= 18) return 'D';
  return 'E';
}

export function buildGradeConstraints(groupSize: number): GradeConstraint[] {
  if (!Number.isInteger(groupSize) || groupSize < 0) throw new Error('评价对象人数无效');
  if (groupSize <= 3) {
    return [{ key: 'A', label: 'A级', grades: ['A'], min: 0, max: Math.min(1, groupSize) }];
  }
  if (groupSize === 4) {
    return [
      { key: 'AB', label: 'A+B级', grades: ['A', 'B'], min: 1, max: 1 },
      { key: 'CD', label: 'C+D级', grades: ['C', 'D'], min: 2, max: 2 },
      { key: 'E', label: 'E级', grades: ['E'], min: 1, max: 1 },
    ];
  }
  return [
    { key: 'A', label: 'A级', grades: ['A'], min: 0, max: Math.floor(groupSize * 0.2) },
    { key: 'B', label: 'B级', grades: ['B'], min: 0, max: Math.floor(groupSize * 0.2) },
    { key: 'C', label: 'C级', grades: ['C'], min: 0, max: Math.floor(groupSize * 0.3) },
    { key: 'D', label: 'D级', grades: ['D'], min: Math.ceil(groupSize * 0.2), max: groupSize },
    { key: 'E', label: 'E级', grades: ['E'], min: Math.ceil(groupSize * 0.1), max: groupSize },
  ];
}

function evaluateCounts(
  counts: Record<Grade, number>,
  completed: number,
  groupSize: number,
  scale: ScoreScale
): Omit<GradePolicyResult, 'remaining_capacity'> {
  const constraints = buildGradeConstraints(groupSize);
  const remaining = groupSize - completed;
  const ranges = gradeRanges(scale);

  for (const constraint of constraints) {
    const current = constraint.grades.reduce((sum, grade) => sum + counts[grade], 0);
    if (current > constraint.max) {
      return {
        scale, group_size: groupSize, completed, remaining, counts, constraints, ranges,
        valid: false,
        message: `${constraint.label}最多 ${constraint.max} 人，当前提交后为 ${current} 人`,
      };
    }
    if (current + remaining < constraint.min) {
      return {
        scale, group_size: groupSize, completed, remaining, counts, constraints, ranges,
        valid: false,
        message: `${constraint.label}至少 ${constraint.min} 人，剩余 ${remaining} 人已无法满足要求`,
      };
    }
  }

  const minimumDeficit = constraints.reduce((sum, constraint) => {
    const current = constraint.grades.reduce((count, grade) => count + counts[grade], 0);
    return sum + Math.max(0, constraint.min - current);
  }, 0);
  if (minimumDeficit > remaining) {
    return {
      scale, group_size: groupSize, completed, remaining, counts, constraints, ranges,
      valid: false,
      message: `剩余 ${remaining} 人无法同时满足全部最低档位要求，至少还需要 ${minimumDeficit} 人`,
    };
  }

  return { scale, group_size: groupSize, completed, remaining, counts, constraints, ranges, valid: true, message: null };
}

export function evaluateGradePolicy(scores: number[], groupSize: number, scale: ScoreScale): GradePolicyResult {
  if (scores.length > groupSize) throw new Error('已评分人数不能超过评价对象人数');
  const counts = EMPTY_COUNTS();
  for (const score of scores) counts[classifyGrade(score, scale)] += 1;
  const base = evaluateCounts(counts, scores.length, groupSize, scale);
  const remainingCapacity = EMPTY_COUNTS();
  for (const grade of GRADES) {
    for (let additional = 1; additional <= base.remaining; additional += 1) {
      const projected = { ...counts, [grade]: counts[grade] + additional };
      if (!evaluateCounts(projected, scores.length + additional, groupSize, scale).valid) break;
      remainingCapacity[grade] = additional;
    }
  }
  return { ...base, remaining_capacity: remainingCapacity };
}

export function gradePolicyDescription(groupSize: number): string {
  if (groupSize <= 3) return 'A级最多 1 人，其余等级不限';
  if (groupSize === 4) return 'A+B级 1 人，C+D级 2 人，E级 1 人';
  return 'A、B级各不超过20%，C级不超过30%，D级不少于20%，E级不少于10%';
}
