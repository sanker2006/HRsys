export type EvaluationScene = 'self' | 'peer' | 'upward' | 'downward'

export type RelationSceneInput = {
  id?: number
  batch_id?: number
  eval_type?: string
  evaluation_scene?: EvaluationScene
  evaluator_level?: string
  target_level?: string
  requires_grade_preview?: boolean
}

export function evaluationScene(relation: RelationSceneInput): EvaluationScene {
  if (relation.evaluation_scene) return relation.evaluation_scene
  if (
    relation.eval_type === 'upward'
    || (
      relation.eval_type === 'peer'
      && relation.evaluator_level === 'staff'
      && relation.target_level === 'manager'
    )
  ) return 'upward'
  if (relation.eval_type === 'self') return 'self'
  if (relation.eval_type === 'downward') return 'downward'
  return 'peer'
}

export function requiresGradePreview(relation: RelationSceneInput): boolean {
  if (typeof relation.requires_grade_preview === 'boolean') return relation.requires_grade_preview
  const scene = evaluationScene(relation)
  return (
    scene === 'peer'
    && relation.evaluator_level === 'staff'
    && relation.target_level === 'staff'
  ) || (
    scene === 'downward'
    && relation.evaluator_level === 'manager'
    && relation.target_level === 'staff'
  )
}

export function sceneLabel(scene: EvaluationScene): string {
  if (scene === 'self') return '自我评价'
  if (scene === 'upward') return '向上评价'
  if (scene === 'downward') return '向下评价'
  return '同级互评'
}

export function evaluationPath(relation: RelationSceneInput, batchId?: number | string): string {
  const scene = evaluationScene(relation)
  if (scene === 'self') return `/eval-form/${relation.id}`
  const batch = batchId ?? relation.batch_id
  if (scene === 'downward') return `/downward-eval/${batch}/${relation.id}`
  if (scene === 'upward') return `/upward-eval/${batch}/${relation.id}`
  return `/peer-eval/${batch}/${relation.id}`
}
