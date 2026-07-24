import type { RelationRow } from '../model/relation.js';

export type EvaluationScene = 'self' | 'peer' | 'upward' | 'downward';
export type EvaluationAnswerMode = 'self_detailed' | 'comprehensive_detailed' | 'detailed' | 'leader_totals';

export interface EvaluationCapabilities {
  evaluation_scene: EvaluationScene;
  canonical_eval_type: EvaluationScene;
  display_label: string;
  answer_mode: EvaluationAnswerMode;
  requires_grade_preview: boolean;
  grade_scale: 30 | 100 | null;
}

type RelationIdentity = Pick<RelationRow, 'eval_type' | 'evaluator_level' | 'target_level'>;

function isLegacyUpward(relation: RelationIdentity): boolean {
  return relation.eval_type === 'peer'
    && relation.evaluator_level === 'staff'
    && relation.target_level === 'manager';
}

export function classifyEvaluationRelation(relation: RelationIdentity): EvaluationCapabilities {
  if (relation.eval_type === 'upward' || isLegacyUpward(relation)) {
    return {
      evaluation_scene: 'upward',
      canonical_eval_type: 'upward',
      display_label: '向上评价',
      answer_mode: 'comprehensive_detailed',
      requires_grade_preview: false,
      grade_scale: null,
    };
  }
  if (relation.eval_type === 'self') {
    return {
      evaluation_scene: 'self',
      canonical_eval_type: 'self',
      display_label: '自我评价',
      answer_mode: 'self_detailed',
      requires_grade_preview: false,
      grade_scale: null,
    };
  }
  if (relation.eval_type === 'peer') {
    const graded = relation.evaluator_level === 'staff' && relation.target_level === 'staff';
    return {
      evaluation_scene: 'peer',
      canonical_eval_type: 'peer',
      display_label: '同级互评',
      answer_mode: 'comprehensive_detailed',
      requires_grade_preview: graded,
      grade_scale: graded ? 30 : null,
    };
  }

  const leaderTotals = ['main_leader', 'division_leader'].includes(relation.evaluator_level || '')
    && ['staff', 'manager'].includes(relation.target_level || '');
  const graded = relation.evaluator_level === 'manager' && relation.target_level === 'staff';
  return {
    evaluation_scene: 'downward',
    canonical_eval_type: 'downward',
    display_label: '向下评价',
    answer_mode: leaderTotals ? 'leader_totals' : 'detailed',
    requires_grade_preview: graded,
    grade_scale: graded ? 100 : null,
  };
}

export function withEvaluationCapabilities<T extends RelationIdentity>(
  relation: T
): T & EvaluationCapabilities {
  return { ...relation, ...classifyEvaluationRelation(relation) };
}
