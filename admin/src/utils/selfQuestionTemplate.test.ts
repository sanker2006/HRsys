import { describe, expect, it } from 'vitest'
import { parseCsvBuffer } from './csv'
import { buildSelfQuestionTemplate } from './selfQuestionTemplate'

const users = [{ name: '张三', employee_no: 'M001', level: 'manager', is_admin: 0 }]

describe('self question import template', () => {
  it('round-trips without a read-only question status column', () => {
    const text = buildSelfQuestionTemplate(users, [])
      .replace('张三,M001,', '张三,M001,业绩题,100,')
    const parsed = parseCsvBuffer(new TextEncoder().encode(text).buffer)

    expect(parsed.headers).not.toContain('题目状态')
    expect(parsed.items[0]).toMatchObject({ 姓名: '张三', 工号: 'M001', 业绩题1: '业绩题', 业绩分值1: '100' })
  })

  it('keeps existing question values when downloading a populated template', () => {
    const text = buildSelfQuestionTemplate(users, [{
      employee_no: 'M001',
      performance_questions: [{ seq: 1, content: '完成重点任务', weight: 70 }],
      comprehensive_questions: [{ seq: 1, content: '协作能力', weight: 30 }],
    }])
    const parsed = parseCsvBuffer(new TextEncoder().encode(text).buffer)

    expect(parsed.items[0]).toMatchObject({
      业绩题1: '完成重点任务',
      业绩分值1: '70',
      综合题1: '协作能力',
      综合分值1: '30',
    })
  })
})
