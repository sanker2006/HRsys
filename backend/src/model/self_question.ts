import { execute, queryAll, queryOne, transaction } from '../db/query.js';

export type QuestionSection = 'performance' | 'comprehensive';

export interface SelfQuestionRow {
  id: number;
  batch_id: number;
  user_id: number;
  content_1: string | null;
  content_2: string | null;
  content_3: string | null;
  content_4: string | null;
  content_5: string | null;
  content_6: string | null;
  content_7: string | null;
  content_8: string | null;
  content_9: string | null;
  content_10: string | null;
  weight_1: number | null;
  weight_2: number | null;
  weight_3: number | null;
  weight_4: number | null;
  weight_5: number | null;
  weight_6: number | null;
  weight_7: number | null;
  weight_8: number | null;
  weight_9: number | null;
  weight_10: number | null;
  comp_content_1: string | null;
  comp_content_2: string | null;
  comp_content_3: string | null;
  comp_content_4: string | null;
  comp_content_5: string | null;
  comp_weight_1: number | null;
  comp_weight_2: number | null;
  comp_weight_3: number | null;
  comp_weight_4: number | null;
  comp_weight_5: number | null;
  created_at: string;
  updated_at: string;
  user_name?: string;
  employee_no?: string;
}

export interface QuestionItem {
  section: QuestionSection;
  seq: number;
  answer_seq: number;
  content: string;
  weight: number;
}

export interface SelfQuestionExport {
  id: number;
  batch_id: number;
  user_id: number;
  user_name: string;
  employee_no: string;
  performance_questions: QuestionItem[];
  comprehensive_questions: QuestionItem[];
  questions: QuestionItem[];
  locked?: boolean;
}

export type QuestionData = Partial<Record<`content_${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`, string | null>> &
  Partial<Record<`weight_${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`, number | null>> &
  Partial<Record<`comp_content_${1 | 2 | 3 | 4 | 5}`, string | null>> &
  Partial<Record<`comp_weight_${1 | 2 | 3 | 4 | 5}`, number | null>>;

export interface SelfQuestionImportItem {
  row: number;
  user_id: number;
  employee_no: string;
  user_name: string;
  data: QuestionData;
}

export interface SelfQuestionImportError {
  row: number;
  employee_no?: string;
  user_name?: string;
  message: string;
  code?: 'locked' | 'validation' | 'database';
}

export function toAnswerSeq(section: QuestionSection, seq: number): number {
  return section === 'performance' ? seq : 100 + seq;
}

export function fromAnswerSeq(answerSeq: number): { section: QuestionSection; seq: number } {
  return answerSeq > 100
    ? { section: 'comprehensive', seq: answerSeq - 100 }
    : { section: 'performance', seq: answerSeq };
}

function hasOneDecimalAtMost(value: number): boolean {
  return Number.isFinite(value) && Math.abs(Math.round(value * 10) - value * 10) < 0.0001;
}

function collectQuestions(row: SelfQuestionRow, section: QuestionSection): QuestionItem[] {
  const count = section === 'performance' ? 10 : 5;
  const items: QuestionItem[] = [];
  for (let i = 1; i <= count; i++) {
    const contentKey = section === 'performance' ? `content_${i}` : `comp_content_${i}`;
    const weightKey = section === 'performance' ? `weight_${i}` : `comp_weight_${i}`;
    const content = row[contentKey as keyof SelfQuestionRow] as string | null;
    const weight = row[weightKey as keyof SelfQuestionRow] as number | null;
    if (content) {
      items.push({
        section,
        seq: i,
        answer_seq: toAnswerSeq(section, i),
        content,
        weight: Number(weight ?? 0),
      });
    }
  }
  return items;
}

function validateSection(
  data: QuestionData,
  section: QuestionSection,
  requiredTotal: number,
  maxCount: number,
  label: string
): string | null {
  const weights: number[] = [];
  for (let i = 1; i <= maxCount; i++) {
    const contentKey = section === 'performance' ? `content_${i}` : `comp_content_${i}`;
    const weightKey = section === 'performance' ? `weight_${i}` : `comp_weight_${i}`;
    const content = data[contentKey as keyof QuestionData];
    const weightRaw = data[weightKey as keyof QuestionData];
    if (!content) continue;
    const weight = Number(weightRaw ?? 0);
    if (!Number.isFinite(weight) || weight <= 0) return `${label}第 ${i} 题分值必须大于 0`;
    if (!hasOneDecimalAtMost(weight)) return `${label}第 ${i} 题分值最多支持 1 位小数`;
    weights.push(weight);
  }

  if (weights.length === 0) return `${label}至少需要 1 道题目`;
  const sum = weights.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - requiredTotal) > 0.001) {
    return `${label}分值合计 ${sum.toFixed(1)}，必须等于 ${requiredTotal}`;
  }
  return null;
}

function validateQuestionData(data: QuestionData): string | null {
  return validateSection(data, 'performance', 70, 10, '业绩评价')
    || validateSection(data, 'comprehensive', 30, 5, '综合评价');
}

const QUESTION_FIELDS = [
  ...Array.from({ length: 10 }, (_, index) => `content_${index + 1}`),
  ...Array.from({ length: 10 }, (_, index) => `weight_${index + 1}`),
  ...Array.from({ length: 5 }, (_, index) => `comp_content_${index + 1}`),
  ...Array.from({ length: 5 }, (_, index) => `comp_weight_${index + 1}`),
] as const;

function normalizeQuestionValue(field: string, value: unknown): string | number | null {
  if (field.includes('weight_')) {
    if (value === undefined || value === null || value === '') return null;
    return Math.round(Number(value) * 10) / 10;
  }
  const text = String(value ?? '').trim();
  return text || null;
}

function questionDataEquals(row: SelfQuestionRow, data: QuestionData): boolean {
  return QUESTION_FIELDS.every(field =>
    normalizeQuestionValue(field, row[field as keyof SelfQuestionRow])
      === normalizeQuestionValue(field, data[field as keyof QuestionData])
  );
}

export const SelfQuestionModel = {
  findByBatchAndUser(batchId: number, userId: number): Promise<SelfQuestionRow | undefined> {
    return queryOne<SelfQuestionRow>(
      `SELECT sq.*, u.name as user_name, u.employee_no
       FROM self_question sq
       JOIN app_user u ON sq.user_id = u.id
       WHERE sq.batch_id = ? AND sq.user_id = ?`,
      [batchId, userId]
    );
  },

  findByBatchId(batchId: number): Promise<SelfQuestionRow[]> {
    return queryAll<SelfQuestionRow>(
      `SELECT sq.*, u.name as user_name, u.employee_no
       FROM self_question sq
       JOIN app_user u ON sq.user_id = u.id
       WHERE sq.batch_id = ?
       ORDER BY u.employee_no`,
      [batchId]
    );
  },

  toExportFormat(rows: SelfQuestionRow[]): SelfQuestionExport[] {
    return rows.map(row => {
      const performance = collectQuestions(row, 'performance');
      const comprehensive = collectQuestions(row, 'comprehensive');
      return {
        id: row.id,
        batch_id: row.batch_id,
        user_id: row.user_id,
        user_name: row.user_name ?? '',
        employee_no: row.employee_no ?? '',
        performance_questions: performance,
        comprehensive_questions: comprehensive,
        questions: [...performance, ...comprehensive],
      };
    });
  },

  async batchUpsert(batchId: number, questions: SelfQuestionImportItem[]): Promise<{
    success: number;
    unchanged: number;
    errors: SelfQuestionImportError[];
  }> {
    const errors: SelfQuestionImportError[] = [];
    let success = 0;
    let unchanged = 0;

    await transaction(async tx => {
      for (const q of questions) {
        const d = q.data;
        const validationError = validateQuestionData(d);
        if (validationError) {
          errors.push({ row: q.row, employee_no: q.employee_no, user_name: q.user_name, message: validationError, code: 'validation' });
          continue;
        }

        try {
          const existing = await tx.queryOne<SelfQuestionRow>(
            'SELECT * FROM self_question WHERE batch_id = ? AND user_id = ? FOR UPDATE',
            [batchId, q.user_id]
          );
          if (existing && questionDataEquals(existing, d)) {
            unchanged++;
            continue;
          }

          if (existing) {
            const locked = await tx.queryOne<{ id: number }>(
              `SELECT r.id
                 FROM relation r
                 LEFT JOIN answer a ON a.relation_id = r.id
                WHERE r.batch_id = ? AND r.target_id = ?
                  AND (r.status IN ('draft', 'completed') OR a.id IS NOT NULL)
                LIMIT 1`,
              [batchId, q.user_id]
            );
            if (locked) {
              errors.push({
                row: q.row,
                employee_no: q.employee_no,
                user_name: q.user_name,
                message: '该人员已经产生评价草稿或正式答案，题目已锁定，不能修改',
                code: 'locked',
              });
              continue;
            }
          }

          const values = QUESTION_FIELDS.map(field => normalizeQuestionValue(field, d[field as keyof QuestionData]));
          if (existing) {
            await tx.execute(
              `UPDATE self_question
                  SET ${QUESTION_FIELDS.map(field => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE batch_id = ? AND user_id = ?`,
              [...values, batchId, q.user_id]
            );
          } else {
            await tx.execute(
              `INSERT INTO self_question (batch_id, user_id, ${QUESTION_FIELDS.join(', ')})
               VALUES (?, ?, ${QUESTION_FIELDS.map(() => '?').join(', ')})`,
              [batchId, q.user_id, ...values]
            );
          }
          success++;
        } catch (err: any) {
          errors.push({ row: q.row, employee_no: q.employee_no, user_name: q.user_name, message: err.message, code: 'database' });
        }
      }
    });

    return { success, unchanged, errors };
  },

  async findLockedTargetIds(batchId: number): Promise<Set<number>> {
    const rows = await queryAll<{ target_id: number }>(
      `SELECT DISTINCT r.target_id
         FROM relation r
         LEFT JOIN answer a ON a.relation_id = r.id
        WHERE r.batch_id = ?
          AND (r.status IN ('draft', 'completed') OR a.id IS NOT NULL)`,
      [batchId]
    );
    return new Set(rows.map(row => row.target_id));
  },

  async batchHasAnswers(batchId: number): Promise<boolean> {
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total
         FROM answer a
         JOIN relation r ON r.id = a.relation_id
        WHERE r.batch_id = ?`,
      [batchId]
    );
    return Number(row?.total ?? 0) > 0;
  },

  deleteByBatchId(batchId: number): Promise<void> {
    return execute('DELETE FROM self_question WHERE batch_id = ?', [batchId]);
  },
};
