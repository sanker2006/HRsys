export type EvaluationScene = 'self' | 'peer' | 'upward' | 'downward'

export function evaluationScene(row: {
  eval_type?: string
  evaluation_scene?: EvaluationScene
  evaluator_level?: string
  target_level?: string
}): EvaluationScene {
  if (row.evaluation_scene) return row.evaluation_scene
  if (
    row.eval_type === 'upward'
    || (
      row.eval_type === 'peer'
      && row.evaluator_level === 'staff'
      && row.target_level === 'manager'
    )
  ) return 'upward'
  if (row.eval_type === 'self') return 'self'
  if (row.eval_type === 'downward') return 'downward'
  return 'peer'
}

export const evaluationSceneText: Record<EvaluationScene, string> = {
  self: '自评',
  peer: '同级互评',
  upward: '向上评价',
  downward: '向下评价',
}
