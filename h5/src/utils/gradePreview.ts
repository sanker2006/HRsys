const GRADES = ['A', 'B', 'C', 'D', 'E'] as const

export interface SubmitPreview {
  total: number
  grade: string
  can_submit: boolean
  reason?: string | null
  remaining_capacity?: Partial<Record<(typeof GRADES)[number], number>>
}

export function gradeCapacityText(preview: SubmitPreview): string {
  return GRADES
    .map(grade => `${grade}级还可提交 ${preview.remaining_capacity?.[grade] ?? 0} 人`)
    .join('，')
}

export function gradeConfirmMessage(preview: SubmitPreview): string {
  return `本次 ${preview.total.toFixed(1)} 分，属于${preview.grade}级。\n${gradeCapacityText(preview)}\n正式提交后不能直接修改，请认真确认。`
}

export function gradeBlockedMessage(preview: SubmitPreview): string {
  return `本次 ${preview.total.toFixed(1)} 分，属于${preview.grade}级。\n${preview.reason || '当前档位不满足提交规则'}\n${gradeCapacityText(preview)}`
}
