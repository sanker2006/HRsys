import {
  gradeConstraintStatusLines,
  type Grade,
  type GradeConstraint,
} from './gradePolicyDisplay'

export interface SubmitPreview {
  total: number
  grade: string
  can_submit: boolean
  reason?: string | null
  group_size?: number
  projected_counts?: Partial<Record<Grade, number>>
  constraints?: GradeConstraint[]
  remaining_capacity?: Partial<Record<Grade, number>>
}

export function gradeCapacityText(preview: SubmitPreview): string {
  return gradeConstraintStatusLines({
    group_size: preview.group_size ?? Object.values(preview.projected_counts ?? {}).reduce((sum, count) => sum + (count ?? 0), 0),
    counts: preview.projected_counts,
    constraints: preview.constraints,
    remaining_capacity: preview.remaining_capacity,
  }).join('\n')
}

export function gradeConfirmMessage(preview: SubmitPreview): string {
  return `本次 ${preview.total.toFixed(1)} 分，属于${preview.grade}级。\n${gradeCapacityText(preview)}\n正式提交后不能直接修改，请认真确认。`
}

export function gradeBlockedMessage(preview: SubmitPreview): string {
  return `本次 ${preview.total.toFixed(1)} 分，属于${preview.grade}级。\n${preview.reason || '当前档位不满足提交规则'}\n${gradeCapacityText(preview)}`
}
