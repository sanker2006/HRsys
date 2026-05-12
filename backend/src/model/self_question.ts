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
}

type QuestionData = Partial<Record<`content_${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`, string | null>> &
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
    errors: SelfQuestionImportError[];
  }> {
    const errors: SelfQuestionImportError[] = [];
    let success = 0;

    await transaction(async tx => {
      for (const q of questions) {
        const d = q.data;
        const validationError = validateQuestionData(d);
        if (validationError) {
          errors.push({ row: q.row, employee_no: q.employee_no, user_name: q.user_name, message: validationError });
          continue;
        }

        try {
          await tx.execute('DELETE FROM self_question WHERE batch_id = ? AND user_id = ?', [batchId, q.user_id]);
          await tx.execute(
            `INSERT INTO self_question (batch_id, user_id,
             content_1, content_2, content_3, content_4, content_5,
             content_6, content_7, content_8, content_9, content_10,
             weight_1, weight_2, weight_3, weight_4, weight_5,
             weight_6, weight_7, weight_8, weight_9, weight_10,
             comp_content_1, comp_content_2, comp_content_3, comp_content_4, comp_content_5,
             comp_weight_1, comp_weight_2, comp_weight_3, comp_weight_4, comp_weight_5)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [batchId, q.user_id,
             d.content_1 ?? null, d.content_2 ?? null, d.content_3 ?? null,
             d.content_4 ?? null, d.content_5 ?? null, d.content_6 ?? null,
             d.content_7 ?? null, d.content_8 ?? null, d.content_9 ?? null,
             d.content_10 ?? null,
             d.weight_1 ?? null, d.weight_2 ?? null, d.weight_3 ?? null,
             d.weight_4 ?? null, d.weight_5 ?? null, d.weight_6 ?? null,
             d.weight_7 ?? null, d.weight_8 ?? null, d.weight_9 ?? null,
             d.weight_10 ?? null,
             d.comp_content_1 ?? null, d.comp_content_2 ?? null, d.comp_content_3 ?? null,
             d.comp_content_4 ?? null, d.comp_content_5 ?? null,
             d.comp_weight_1 ?? null, d.comp_weight_2 ?? null, d.comp_weight_3 ?? null,
             d.comp_weight_4 ?? null, d.comp_weight_5 ?? null]
          );
          success++;
        } catch (err: any) {
          errors.push({ row: q.row, employee_no: q.employee_no, user_name: q.user_name, message: err.message });
        }
      }
    });

    return { success, errors };
  },

  deleteByBatchId(batchId: number): Promise<void> {
    return execute('DELETE FROM self_question WHERE batch_id = ?', [batchId]);
  },
};
