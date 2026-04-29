import { getDb, saveDb } from '../db/index.js';
import { queryAll, queryOne } from '../db/query.js';

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
  created_at: string;
  updated_at: string;
  user_name?: string;
  employee_no?: string;
}

export interface SelfQuestionExport {
  id: number;
  batch_id: number;
  user_id: number;
  user_name: string;
  employee_no: string;
  questions: Array<{ seq: number; content: string | null; weight: number | null }>;
}

type QuestionData = Partial<Record<`content_${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`, string | null>> &
  Partial<Record<`weight_${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`, number | null>>;

function extractQuestions(row: SelfQuestionRow): Array<{ seq: number; content: string | null; weight: number | null }> {
  const questions: Array<{ seq: number; content: string | null; weight: number | null }> = [];
  for (let i = 1; i <= 10; i++) {
    const content = row[`content_${i}` as keyof SelfQuestionRow] as string | null;
    const weight = row[`weight_${i}` as keyof SelfQuestionRow] as number | null;
    if (content) questions.push({ seq: i, content, weight });
  }
  return questions;
}

function validateQuestionData(data: QuestionData): string | null {
  const usedWeights = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    .filter(seq => data[`content_${seq}` as keyof QuestionData])
    .map(seq => Number(data[`weight_${seq}` as keyof QuestionData] ?? 0));

  if (usedWeights.length === 0) return '至少需要 1 道题目';

  const sum = usedWeights.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 0.01) {
    return `分值合计 ${sum.toFixed(2)}，必须等于 100`;
  }
  return null;
}

export const SelfQuestionModel = {
  findByBatchAndUser(batchId: number, userId: number): SelfQuestionRow | undefined {
    return queryOne<SelfQuestionRow>(
      `SELECT sq.*, u.name as user_name, u.employee_no
       FROM self_question sq
       JOIN app_user u ON sq.user_id = u.id
       WHERE sq.batch_id = ? AND sq.user_id = ?`,
      [batchId, userId]
    );
  },

  findByBatchId(batchId: number): SelfQuestionRow[] {
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
    return rows.map(row => ({
      id: row.id,
      batch_id: row.batch_id,
      user_id: row.user_id,
      user_name: row.user_name ?? '',
      employee_no: row.employee_no ?? '',
      questions: extractQuestions(row),
    }));
  },

  batchUpsert(batchId: number, questions: Array<{ user_id: number; data: QuestionData }>): {
    success: number;
    errors: Array<{ row: number; message: string }>;
  } {
    const errors: Array<{ row: number; message: string }> = [];
    let success = 0;
    const db = getDb();

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const d = q.data;
      const validationError = validateQuestionData(d);
      if (validationError) {
        errors.push({ row: i + 2, message: validationError });
        continue;
      }

      try {
        db.run('DELETE FROM self_question WHERE batch_id = ? AND user_id = ?', [batchId, q.user_id]);
        db.run(
          `INSERT INTO self_question (batch_id, user_id,
           content_1, content_2, content_3, content_4, content_5,
           content_6, content_7, content_8, content_9, content_10,
           weight_1, weight_2, weight_3, weight_4, weight_5,
           weight_6, weight_7, weight_8, weight_9, weight_10)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [batchId, q.user_id,
           d.content_1 ?? null, d.content_2 ?? null, d.content_3 ?? null,
           d.content_4 ?? null, d.content_5 ?? null, d.content_6 ?? null,
           d.content_7 ?? null, d.content_8 ?? null, d.content_9 ?? null,
           d.content_10 ?? null,
           d.weight_1 ?? null, d.weight_2 ?? null, d.weight_3 ?? null,
           d.weight_4 ?? null, d.weight_5 ?? null, d.weight_6 ?? null,
           d.weight_7 ?? null, d.weight_8 ?? null, d.weight_9 ?? null,
           d.weight_10 ?? null]
        );
        success++;
      } catch (err: any) {
        errors.push({ row: i + 2, message: err.message });
      }
    }

    saveDb();
    return { success, errors };
  },

  deleteByBatchId(batchId: number): void {
    getDb().run('DELETE FROM self_question WHERE batch_id = ?', [batchId]);
    saveDb();
  },
};
