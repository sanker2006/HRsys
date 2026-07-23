import { describe, expect, it } from 'vitest'
import { gradeBlockedMessage, gradeCapacityText, gradeConfirmMessage } from './gradePreview'
import {
  gradeConstraintStatusLines,
  gradePolicyExplanation,
  gradeProgressText,
  gradeRuleText,
} from './gradePolicyDisplay'

describe('grade preview messages', () => {
  const preview = {
    total: 91,
    grade: 'A',
    can_submit: true,
    group_size: 5,
    projected_counts: { A: 1, B: 0, C: 0, D: 0, E: 0 },
    constraints: [
      { key: 'A', label: 'A级', grades: ['A'] as const, min: 0, max: 1 },
      { key: 'B', label: 'B级', grades: ['B'] as const, min: 0, max: 1 },
      { key: 'C', label: 'C级', grades: ['C'] as const, min: 0, max: 1 },
      { key: 'D', label: 'D级', grades: ['D'] as const, min: 1, max: 5 },
      { key: 'E', label: 'E级', grades: ['E'] as const, min: 1, max: 5 },
    ],
    remaining_capacity: { A: 0, B: 1, C: 2, D: 2, E: 1 },
  }

  it('separates maximum limits from minimum deficits', () => {
    expect(gradeCapacityText(preview)).toContain('A级：当前1人，最多1人，还可0人')
    expect(gradeCapacityText(preview)).toContain('D级：当前0人，至少1人，还需1人（无独立上限）')
    expect(gradeCapacityText(preview)).toContain('E级：当前0人，至少1人，还需1人（无独立上限）')
    expect(gradeCapacityText(preview)).not.toContain('D级还可提交')
    expect(gradeConfirmMessage(preview)).toContain('本次 91.0 分，属于A级')
    expect(gradeConfirmMessage(preview)).toContain('正式提交后不能直接修改')
  })

  it('shows the backend rejection reason', () => {
    expect(gradeBlockedMessage({ ...preview, can_submit: false, reason: 'A级人数已满' }))
      .toContain('A级人数已满')
  })
})

describe('grade policy display', () => {
  it('describes lower-only grades without inventing an upper limit', () => {
    const policy = {
      group_size: 5,
      counts: { A: 0, B: 0, C: 0, D: 0, E: 0 },
      constraints: [
        { key: 'D', label: 'D级', grades: ['D'] as const, min: 1, max: 5 },
      ],
    }
    expect(gradeRuleText(policy, 'D')).toBe('至少1人')
    expect(gradeProgressText(policy, 'D')).toBe('还需 1 人')
    expect(gradePolicyExplanation(policy)).toBe(
      'D级为最低人数要求，不设独立上限；系统会为尚未满足的最低档预留人数。',
    )
  })

  it('shows combined exact constraints for a four-person group', () => {
    const policy = {
      group_size: 4,
      counts: { A: 0, B: 0, C: 1, D: 0, E: 0 },
      constraints: [
        { key: 'AB', label: 'A+B级', grades: ['A', 'B'] as const, min: 1, max: 1 },
        { key: 'CD', label: 'C+D级', grades: ['C', 'D'] as const, min: 2, max: 2 },
        { key: 'E', label: 'E级', grades: ['E'] as const, min: 1, max: 1 },
      ],
    }
    expect(gradeRuleText(policy, 'A')).toBe('A+B级合计1人')
    expect(gradeProgressText(policy, 'D')).toBe('组合还需 1 人')
    expect(gradeConstraintStatusLines(policy)).toContain('C+D级：当前1人，要求2人，还需1人')
    expect(gradePolicyExplanation(policy)).toBe(
      '本组要求：A+B级合计1人，C+D级合计2人，E级1人。',
    )
  })

  it('marks grades without a constraint as unlimited', () => {
    const policy = {
      group_size: 3,
      counts: { A: 0, B: 0, C: 0, D: 0, E: 0 },
      constraints: [
        { key: 'A', label: 'A级', grades: ['A'] as const, min: 0, max: 1 },
      ],
    }
    expect(gradeRuleText(policy, 'B')).toBe('人数不限')
    expect(gradeProgressText(policy, 'B')).toBe('无人数限制')
    expect(gradeConstraintStatusLines(policy)).toContain('B级、C级、D级、E级：人数不限')
    expect(gradePolicyExplanation(policy)).toBeNull()
  })
})
