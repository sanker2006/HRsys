import { getDb, saveDb } from '../db/index.js';
import { queryAll, queryOne } from '../db/query.js';

export interface AnswerRow {
  id: number;
  relation_id: number;
  question_seq: number | null;
  score: number | null;
  is_total: number;
  is_draft: number;
  created_at: string;
  updated_at: string;
}

function rollbackQuietly(): void {
  try {
    getDb().run('ROLLBACK');
  } catch {
    // no active transaction
  }
}

export const AnswerModel = {
  findByRelationId(relationId: number): AnswerRow[] {
    return queryAll<AnswerRow>(
      'SELECT * FROM answer WHERE relation_id = ? ORDER BY question_seq NULLS FIRST',
      [relationId]
    );
  },

  findByRelationIds(relationIds: number[]): AnswerRow[] {
    if (relationIds.length === 0) return [];
    const placeholders = relationIds.map(() => '?').join(',');
    return queryAll<AnswerRow>(
      `SELECT * FROM answer WHERE relation_id IN (${placeholders}) ORDER BY relation_id, question_seq NULLS FIRST`,
      relationIds
    );
  },

  findByRelationAndSeq(relationId: number, seq: number): AnswerRow | undefined {
    return queryOne<AnswerRow>(
      'SELECT * FROM answer WHERE relation_id = ? AND question_seq = ?',
      [relationId, seq]
    );
  },

  findTotalByRelationId(relationId: number): AnswerRow | undefined {
    return queryOne<AnswerRow>(
      'SELECT * FROM answer WHERE relation_id = ? AND is_total = 1',
      [relationId]
    );
  },

  upsertQuestion(relationId: number, seq: number, score: number, isDraft = false): void {
    const db = getDb();
    db.run('DELETE FROM answer WHERE relation_id = ? AND question_seq = ?', [relationId, seq]);
    db.run(
      `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
       VALUES (?, ?, ?, 0, ?)`,
      [relationId, seq, score, isDraft ? 1 : 0]
    );
    saveDb();
  },

  upsertTotal(relationId: number, score: number, isDraft = false): void {
    const db = getDb();
    try {
      db.run('BEGIN');
      db.run('DELETE FROM answer WHERE relation_id = ? AND is_total = 1', [relationId]);
      db.run(
        `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
         VALUES (?, NULL, ?, 1, ?)`,
        [relationId, score, isDraft ? 1 : 0]
      );
      db.run('COMMIT');
      saveDb();
    } catch (err) {
      rollbackQuietly();
      throw err;
    }
  },

  submitSelfEval(relationId: number, answers: Array<{ seq: number; score: number }>, isDraft = false): void {
    const db = getDb();
    try {
      db.run('BEGIN');
      db.run('DELETE FROM answer WHERE relation_id = ?', [relationId]);
      for (const a of answers) {
        db.run(
          `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
           VALUES (?, ?, ?, 0, ?)`,
          [relationId, a.seq, a.score, isDraft ? 1 : 0]
        );
      }
      const total = answers.reduce((sum, a) => sum + a.score, 0);
      db.run(
        `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
         VALUES (?, NULL, ?, 1, ?)`,
        [relationId, total, isDraft ? 1 : 0]
      );
      db.run('COMMIT');
      saveDb();
    } catch (err) {
      rollbackQuietly();
      throw err;
    }
  },

  submitTotalEval(relationId: number, score: number, isDraft = false): void {
    this.upsertTotal(relationId, score, isDraft);
  },

  deleteByRelationId(relationId: number): void {
    getDb().run('DELETE FROM answer WHERE relation_id = ?', [relationId]);
    saveDb();
  },

  findByBatchAndEvaluator(batchId: number, evaluatorId: number): AnswerRow[] {
    return queryAll<AnswerRow>(
      `SELECT a.* FROM answer a
       JOIN relation r ON a.relation_id = r.id
       WHERE r.batch_id = ? AND r.evaluator_id = ?`,
      [batchId, evaluatorId]
    );
  },
};
