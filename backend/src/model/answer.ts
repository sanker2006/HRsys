import { getDb, saveDb } from '../db/index.js';
import { queryAll, queryOne } from '../db/query.js';

export interface AnswerRow {
  id: number;
  relation_id: number;
  question_seq: number | null; // 1~10=自评逐题, NULL=总分
  score: number | null;
  is_total: number; // 0=逐题, 1=总分
  is_draft: number;
  created_at: string;
  updated_at: string;
}

export const AnswerModel = {
  // 按关系ID查所有答案
  findByRelationId(relationId: number): AnswerRow[] {
    return queryAll<AnswerRow>(
      'SELECT * FROM answer WHERE relation_id = ? ORDER BY question_seq NULLS FIRST',
      [relationId]
    );
  },

  // 批量按关系ID列表查所有答案
  findByRelationIds(relationIds: number[]): AnswerRow[] {
    if (relationIds.length === 0) return [];
    const placeholders = relationIds.map(() => '?').join(',');
    return queryAll<AnswerRow>(
      `SELECT * FROM answer WHERE relation_id IN (${placeholders}) ORDER BY relation_id, question_seq NULLS FIRST`,
      relationIds
    );
  },

  // 按关系ID和题目序号查单条
  findByRelationAndSeq(relationId: number, seq: number): AnswerRow | undefined {
    return queryOne<AnswerRow>(
      'SELECT * FROM answer WHERE relation_id = ? AND question_seq = ?',
      [relationId, seq]
    );
  },

  // 查总分答案
  findTotalByRelationId(relationId: number): AnswerRow | undefined {
    return queryOne<AnswerRow>(
      'SELECT * FROM answer WHERE relation_id = ? AND is_total = 1',
      [relationId]
    );
  },

  // 保存/更新单条答案（逐题）
  upsertQuestion(relationId: number, seq: number, score: number, isDraft: boolean = false): void {
    const db = getDb();
    const existing = this.findByRelationAndSeq(relationId, seq);
    if (existing) {
      db.run(
        `UPDATE answer SET score = ?, is_draft = ?, updated_at = datetime('now')
         WHERE relation_id = ? AND question_seq = ?`,
        [score, isDraft ? 1 : 0, relationId, seq]
      );
    } else {
      db.run(
        `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
         VALUES (?, ?, ?, 0, ?)`,
        [relationId, seq, score, isDraft ? 1 : 0]
      );
    }
    saveDb();
  },

  // 保存/更新总分
  upsertTotal(relationId: number, score: number, isDraft: boolean = false): void {
    const db = getDb();
    const existing = this.findTotalByRelationId(relationId);
    if (existing) {
      db.run(
        `UPDATE answer SET score = ?, is_draft = ?, updated_at = datetime('now')
         WHERE relation_id = ? AND is_total = 1`,
        [score, isDraft ? 1 : 0, relationId]
      );
    } else {
      db.run(
        `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
         VALUES (?, NULL, ?, 1, ?)`,
        [relationId, score, isDraft ? 1 : 0]
      );
    }
    saveDb();
  },

  // 提交自评（逐题得分求和，更新总分答案）
  submitSelfEval(relationId: number, answers: Array<{ seq: number; score: number }>, isDraft: boolean = false): void {
    const db = getDb();
    // 先保存所有逐题答案
    for (const a of answers) {
      const existing = this.findByRelationAndSeq(relationId, a.seq);
      if (existing) {
        db.run(
          `UPDATE answer SET score = ?, is_draft = ?, updated_at = datetime('now')
           WHERE relation_id = ? AND question_seq = ?`,
          [a.score, isDraft ? 1 : 0, relationId, a.seq]
        );
      } else {
        db.run(
          `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
           VALUES (?, ?, ?, 0, ?)`,
          [relationId, a.seq, a.score, isDraft ? 1 : 0]
        );
      }
    }
    // 计算总分
    const total = answers.reduce((sum, a) => sum + a.score, 0);
    const totalRow = this.findTotalByRelationId(relationId);
    if (totalRow) {
      db.run(
        `UPDATE answer SET score = ?, is_draft = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [total, isDraft ? 1 : 0, totalRow.id]
      );
    } else {
      db.run(
        `INSERT INTO answer (relation_id, question_seq, score, is_total, is_draft)
         VALUES (?, NULL, ?, 1, ?)`,
        [relationId, total, isDraft ? 1 : 0]
      );
    }
    saveDb();
  },

  // 提交互评/向下评估（总分）
  submitTotalEval(relationId: number, score: number, isDraft: boolean = false): void {
    this.upsertTotal(relationId, score, isDraft);
  },

  // 删除某关系的所有答案
  deleteByRelationId(relationId: number): void {
    getDb().run('DELETE FROM answer WHERE relation_id = ?', [relationId]);
    saveDb();
  },

  // 批量获取某批次某人的所有答案
  findByBatchAndEvaluator(batchId: number, evaluatorId: number): AnswerRow[] {
    return queryAll<AnswerRow>(
      `SELECT a.* FROM answer a
       JOIN relation r ON a.relation_id = r.id
       WHERE r.batch_id = ? AND r.evaluator_id = ?`,
      [batchId, evaluatorId]
    );
  },
};
