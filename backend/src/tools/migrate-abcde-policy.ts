import { queryAll, transaction } from '../db/query.js';
import { closeDb, initDb } from '../db/index.js';
import { evaluateGradePolicy, type ScoreScale } from '../service/scoreGradePolicy.js';

type GroupRow = {
  batch_id: number;
  evaluator_id: number;
  evaluator_name: string;
  eval_type: 'peer' | 'downward';
  department: string;
  scale: ScoreScale;
};

const apply = process.argv.includes('--apply');

async function groups(): Promise<GroupRow[]> {
  const peer = await queryAll<GroupRow>(
    `SELECT DISTINCT r.batch_id, r.evaluator_id, e.name as evaluator_name,
       'peer' as eval_type, '' as department, 30 as scale
     FROM relation r
     JOIN batch b ON b.id = r.batch_id
     JOIN app_user e ON e.id = r.evaluator_id
     JOIN app_user t ON t.id = r.target_id
     WHERE b.status = 'active' AND r.eval_type = 'peer' AND e.level = 'staff' AND t.level = 'staff'`
  );
  const downward = await queryAll<GroupRow>(
    `SELECT DISTINCT r.batch_id, r.evaluator_id, e.name as evaluator_name,
       'downward' as eval_type, t.department, 100 as scale
     FROM relation r
     JOIN batch b ON b.id = r.batch_id
     JOIN app_user e ON e.id = r.evaluator_id
     JOIN app_user t ON t.id = r.target_id
     WHERE b.status = 'active' AND r.eval_type = 'downward' AND e.level = 'manager' AND t.level = 'staff'`
  );
  return [...peer, ...downward];
}

async function relationRows(group: GroupRow) {
  const params: Array<string | number> = [group.batch_id, group.evaluator_id];
  let sql = `SELECT r.id, r.target_id, r.status,
      (SELECT a.score FROM answer a WHERE a.relation_id = r.id AND a.is_total = 1 LIMIT 1) as score
    FROM relation r JOIN app_user t ON t.id = r.target_id
    WHERE r.batch_id = ? AND r.evaluator_id = ? AND r.eval_type = ?`;
  params.push(group.eval_type);
  if (group.eval_type === 'peer') sql += " AND t.level = 'staff'";
  else { sql += " AND t.level = 'staff' AND t.department = ?"; params.push(group.department); }
  sql += ' ORDER BY r.id';
  return queryAll<{ id: number; target_id: number; status: string; score: number | null }>(sql, params);
}

async function main() {
  await initDb({ ensureSchema: false });
  const findings: Array<{ group: GroupRow; relations: Awaited<ReturnType<typeof relationRows>>; reason: string }> = [];
  for (const group of await groups()) {
    const relations = await relationRows(group);
    const scores = relations
      .filter(row => row.status === 'completed' && row.score !== null)
      .map(row => Number(row.score));
    const result = evaluateGradePolicy(scores, relations.length, group.scale);
    if (!result.valid) findings.push({ group, relations, reason: result.message || '不符合ABCDE规则' });
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preflight', groups: findings.map(item => ({
    batch_id: item.group.batch_id,
    evaluator_id: item.group.evaluator_id,
    evaluator_name: item.group.evaluator_name,
    eval_type: item.group.eval_type,
    department: item.group.department,
    relations: item.relations.length,
    reason: item.reason,
  })) }, null, 2));

  if (!apply) return;
  for (const finding of findings) {
    await transaction(async tx => {
      const relationIds = finding.relations.map(row => row.id);
      const targetIds = finding.relations.map(row => row.target_id);
      for (const relationId of relationIds) await tx.queryOne('SELECT id FROM relation WHERE id = ? FOR UPDATE', [relationId]);
      let dependentLeaderIds: number[] = [];
      if (targetIds.length) {
        const placeholders = targetIds.map(() => '?').join(',');
        const direct = await tx.queryAll<{ id: number }>(
          `SELECT lr.id FROM relation lr JOIN app_user leader ON leader.id = lr.evaluator_id
           WHERE lr.batch_id = ? AND lr.status = 'completed' AND lr.eval_type = 'downward'
             AND leader.level IN ('main_leader','division_leader') AND lr.target_id IN (${placeholders})`,
          [finding.group.batch_id, ...targetIds]
        );
        dependentLeaderIds = direct.map(row => row.id);
      }
      if (finding.group.eval_type === 'downward') {
        const managerTargets = await tx.queryAll<{ id: number }>(
          `SELECT lr.id FROM relation lr JOIN app_user leader ON leader.id = lr.evaluator_id
           WHERE lr.batch_id = ? AND lr.status = 'completed' AND lr.eval_type = 'downward'
             AND leader.level IN ('main_leader','division_leader') AND lr.target_id = ?`,
          [finding.group.batch_id, finding.group.evaluator_id]
        );
        dependentLeaderIds.push(...managerTargets.map(row => row.id));
      }
      dependentLeaderIds = [...new Set(dependentLeaderIds)];
      for (const id of dependentLeaderIds.sort((a, b) => a - b)) {
        await tx.queryOne('SELECT id FROM relation WHERE id = ? FOR UPDATE', [id]);
        await tx.execute('UPDATE answer SET is_draft = 1, updated_at = datetime(\'now\') WHERE relation_id = ?', [id]);
        await tx.execute("UPDATE relation SET status = 'draft', updated_at = datetime('now') WHERE id = ?", [id]);
      }
      for (const id of relationIds) {
        await tx.execute('DELETE FROM answer WHERE relation_id = ?', [id]);
        await tx.execute("UPDATE relation SET status = 'pending', updated_at = datetime('now') WHERE id = ?", [id]);
      }
      await tx.execute('INSERT INTO log (user_id, action, ip, detail) VALUES (NULL, ?, NULL, ?)', [
        'answer.abcde_migration', JSON.stringify({
          batch_id: finding.group.batch_id,
          evaluator_id: finding.group.evaluator_id,
          eval_type: finding.group.eval_type,
          department: finding.group.department,
          reset_relations: relationIds,
          reset_leader_relations: dependentLeaderIds,
          reason: finding.reason,
        }),
      ]);
    });
  }
}

main()
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => closeDb());
