export const GRADES = ['A', 'B', 'C', 'D', 'E'] as const

export type Grade = (typeof GRADES)[number]

export interface GradeConstraint {
  key: string
  label: string
  grades: readonly Grade[]
  min: number
  max: number
}

export interface GradePolicyDisplaySource {
  group_size: number
  counts?: Partial<Record<Grade, number>>
  constraints?: GradeConstraint[]
  remaining_capacity?: Partial<Record<Grade, number>>
}

function constraintCount(policy: GradePolicyDisplaySource, constraint: GradeConstraint): number {
  return constraint.grades.reduce((sum, grade) => sum + (policy.counts?.[grade] ?? 0), 0)
}

function constraintForGrade(policy: GradePolicyDisplaySource, grade: Grade): GradeConstraint | undefined {
  return policy.constraints?.find(constraint => constraint.grades.includes(grade))
}

function isLowerOnly(policy: GradePolicyDisplaySource, constraint: GradeConstraint): boolean {
  return constraint.min > 0 && constraint.max >= policy.group_size
}

export function gradeRuleText(policy: GradePolicyDisplaySource, grade: Grade): string {
  const constraint = constraintForGrade(policy, grade)
  if (!constraint) return '人数不限'
  if (constraint.grades.length > 1) {
    return constraint.min === constraint.max
      ? `${constraint.label}合计${constraint.min}人`
      : `${constraint.label}合并约束`
  }
  if (constraint.min === constraint.max) return `固定${constraint.min}人`
  if (isLowerOnly(policy, constraint)) return `至少${constraint.min}人`
  if (constraint.min === 0) return `最多${constraint.max}人`
  return `${constraint.min}～${constraint.max}人`
}

export function gradeProgressText(policy: GradePolicyDisplaySource, grade: Grade): string {
  const constraint = constraintForGrade(policy, grade)
  if (!constraint) return '无人数限制'

  const current = constraintCount(policy, constraint)
  const missing = Math.max(0, constraint.min - current)
  if (constraint.grades.length > 1) {
    if (missing > 0) return `组合还需 ${missing} 人`
    if (constraint.min === constraint.max) return '组合人数已满足'
    return '组合最低人数已满足'
  }
  if (constraint.min === constraint.max) {
    return missing > 0 ? `还需 ${missing} 人` : '人数要求已满足'
  }
  if (isLowerOnly(policy, constraint)) {
    return missing > 0 ? `还需 ${missing} 人` : '最低人数已满足'
  }
  if (constraint.min === 0) {
    return `还可 ${Math.max(0, constraint.max - current)} 人`
  }
  return missing > 0 ? `还需 ${missing} 人` : `还可 ${Math.max(0, constraint.max - current)} 人`
}

export function gradeConstraintStatusLines(policy: GradePolicyDisplaySource): string[] {
  const covered = new Set<Grade>()
  const lines = (policy.constraints ?? []).map(constraint => {
    constraint.grades.forEach(grade => covered.add(grade))
    const current = constraintCount(policy, constraint)
    const missing = Math.max(0, constraint.min - current)

    if (constraint.min === constraint.max) {
      const status = missing > 0 ? `还需${missing}人` : '人数要求已满足'
      return `${constraint.label}：当前${current}人，要求${constraint.min}人，${status}`
    }
    if (isLowerOnly(policy, constraint)) {
      const status = missing > 0 ? `还需${missing}人` : '最低人数已满足'
      return `${constraint.label}：当前${current}人，至少${constraint.min}人，${status}（无独立上限）`
    }
    if (constraint.min === 0) {
      return `${constraint.label}：当前${current}人，最多${constraint.max}人，还可${Math.max(0, constraint.max - current)}人`
    }
    return `${constraint.label}：当前${current}人，要求${constraint.min}～${constraint.max}人`
  })

  const unrestricted = GRADES.filter(grade => !covered.has(grade))
  if (unrestricted.length > 0) {
    lines.push(`${unrestricted.map(grade => `${grade}级`).join('、')}：人数不限`)
  }
  return lines
}

export function gradePolicyExplanation(policy: GradePolicyDisplaySource): string | null {
  const constraints = policy.constraints ?? []
  const combined = constraints.filter(constraint => constraint.grades.length > 1)
  if (combined.length > 0) {
    const parts = constraints.map(constraint => {
      if (constraint.grades.length > 1) {
        return `${constraint.label}合计${constraint.min}人`
      }
      if (constraint.min === constraint.max) {
        return `${constraint.label}${constraint.min}人`
      }
      return `${constraint.label}${constraint.min}～${constraint.max}人`
    })
    return `本组要求：${parts.join('，')}。`
  }

  const lowerOnly = constraints.filter(constraint => isLowerOnly(policy, constraint))
  if (lowerOnly.length > 0) {
    return `${lowerOnly.map(constraint => constraint.label).join('、')}为最低人数要求，不设独立上限；系统会为尚未满足的最低档预留人数。`
  }
  return null
}
