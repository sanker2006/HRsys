import { describe, expect, it } from 'vitest'
import { gradeBlockedMessage, gradeCapacityText, gradeConfirmMessage } from './gradePreview'

describe('grade preview messages', () => {
  const preview = {
    total: 91,
    grade: 'A',
    can_submit: true,
    remaining_capacity: { A: 0, B: 1, C: 2, D: 2, E: 1 },
  }

  it('shows the backend grade and every remaining capacity', () => {
    expect(gradeCapacityText(preview)).toBe(
      'A级还可提交 0 人，B级还可提交 1 人，C级还可提交 2 人，D级还可提交 2 人，E级还可提交 1 人',
    )
    expect(gradeConfirmMessage(preview)).toContain('本次 91.0 分，属于A级')
    expect(gradeConfirmMessage(preview)).toContain('正式提交后不能直接修改')
  })

  it('shows the backend rejection reason', () => {
    expect(gradeBlockedMessage({ ...preview, can_submit: false, reason: 'A级人数已满' }))
      .toContain('A级人数已满')
  })
})
