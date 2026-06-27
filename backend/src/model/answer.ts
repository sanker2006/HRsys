import { execute, queryAll, queryOne, transaction, type DbExecutor } from '../db/query.js';

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

async function lockRelationForWrite(tx: DbExecutor, relationId: number): Promise<void> {
  await tx.queryOne('SELECT id FROM relation WHERE id = ? FOR UPDATE', [relationId]);
}

export const AnswerModel = {
  findByRelationId(relationId: number): Promise<AnswerRow[]> {
    return queryAll<AnswerRow>(
      'SELECT * FROM answer WHERE relation_id = ? ORDER BY question_seq NULLS FIRST',
      [relationId]
    );
  },

  findByRelationIds(relationIds: number[]): Promise<AnswerRow[]> {
    if (relationIds.length === 0) return Promise.resolve([]);
    const placeholders = relationIds.map(() => '?').join(',');
    return queryAll<AnswerRow>(
      `SELECT * FROM answer WHERE relation_id IN (${placeholders}) ORDER BY relation_id, question_seq NULLS FIRST`,
      relationIds
    );
  },

  findByRelationAndSeq(relationId: number, seq: number): Promise<AnswerRow | undefined> {
    return queryOne<AnswerRow>(
      'SELECT * FROM answer WHERE relation_id = ? AND question_seq = ?',
      [relationId, seq]
    );
  },

  findTotalByRelationId(relationId: number): Promise<AnswerRow | undefined> {
    return queryOne<AnswerRow>(
      'SELECT * FROM answer WHERE relation_id = ? AND is_total = 1',
      [relationId]
    );
  },

  async upsertQuestion(relationId: number, seq: number, score: number, isDraft = false): Promise<void> {
    await transaction(async tx => {
      await lockRelationForWrite(tx, relationId);
      await tx.execute('DELETE FROM answer WHERE relation_id = ? AND question_seq = ?', [relationId, seq]);
      await tx.execute(
        `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
         VALUES (?, ?, ?, 0, ?)`,
        [relationId, seq, score, isDraft ? 1 : 0]
      );
    });
  },

  async upsertTotal(relationId: number, score: number, isDraft = false): Promise<void> {
    await transaction(async tx => {
      await lockRelationForWrite(tx, relationId);
      await tx.execute('DELETE FROM answer WHERE relation_id = ? AND is_total = 1', [relationId]);
      await tx.execute(
        `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
         VALUES (?, NULL, ?, 1, ?)`,
        [relationId, score, isDraft ? 1 : 0]
      );
    });
  },

  async submitSelfEval(relationId: number, answers: Array<{ seq: number; score: number }>, isDraft = false): Promise<void> {
    await transaction(async tx => {
      await lockRelationForWrite(tx, relationId);
      await tx.execute('DELETE FROM answer WHERE relation_id = ?', [relationId]);
      for (const a of answers) {
        await tx.execute(
          `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
           VALUES (?, ?, ?, 0, ?)`,
          [relationId, a.seq, a.score, isDraft ? 1 : 0]
        );
      }
      const total = answers.reduce((sum, a) => sum + a.score, 0);
      await tx.execute(
        `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
         VALUES (?, NULL, ?, 1, ?)`,
        [relationId, total, isDraft ? 1 : 0]
      );
    });
  },

  async submitDetailedWithStatus(
    relationId: number,
    answers: Array<{ seq: number; score: number }>,
    status: 'pending' | 'draft' | 'completed',
    isDraft = false
  ): Promise<void> {
    await transaction(async tx => {
      await lockRelationForWrite(tx, relationId);
      await tx.execute('DELETE FROM answer WHERE relation_id = ?', [relationId]);
      for (const a of answers) {
        await tx.execute(
          `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
           VALUES (?, ?, ?, 0, ?)`,
          [relationId, a.seq, a.score, isDraft ? 1 : 0]
        );
      }
      const total = answers.reduce((sum, a) => sum + a.score, 0);
      await tx.execute(
        `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
         VALUES (?, NULL, ?, 1, ?)`,
        [relationId, total, isDraft ? 1 : 0]
      );
      await tx.execute("UPDATE relation SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, relationId]);
    });
  },

  async submitTotalWithStatus(
    relationId: number,
    score: number,
    status: 'pending' | 'draft' | 'completed',
    isDraft = false
  ): Promise<void> {
    await transaction(async tx => {
      await lockRelationForWrite(tx, relationId);
      await tx.execute('DELETE FROM answer WHERE relation_id = ? AND is_total = 1', [relationId]);
      await tx.execute(
        `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
         VALUES (?, NULL, ?, 1, ?)`,
        [relationId, score, isDraft ? 1 : 0]
      );
      await tx.execute("UPDATE relation SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, relationId]);
    });
  },

  submitTotalEval(relationId: number, score: number, isDraft = false): Promise<void> {
    return this.upsertTotal(relationId, score, isDraft);
  },

  deleteByRelationId(relationId: number): Promise<void> {
    return execute('DELETE FROM answer WHERE relation_id = ?', [relationId]);
  },

  findByBatchAndEvaluator(batchId: number, evaluatorId: number): Promise<AnswerRow[]> {
    return queryAll<AnswerRow>(
      `SELECT a.* FROM answer a
       JOIN relation r ON a.relation_id = r.id
       WHERE r.batch_id = ? AND r.evaluator_id = ?`,
      [batchId, evaluatorId]
    );
  },
};
