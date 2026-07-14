import { buildCsvText } from './csv'

interface TemplateUser {
  name: string
  employee_no: string
  level: string
  is_admin?: number
}

interface TemplateQuestion {
  seq: number
  content: string
  weight: number
}

interface ExistingQuestions {
  employee_no: string
  performance_questions?: TemplateQuestion[]
  comprehensive_questions?: TemplateQuestion[]
}

export function buildSelfQuestionTemplate(users: TemplateUser[], existingRows: ExistingQuestions[]): string {
  const headers = ['姓名', '工号']
  for (let i = 1; i <= 10; i++) headers.push(`业绩题${i}`, `业绩分值${i}`)
  for (let i = 1; i <= 5; i++) headers.push(`综合题${i}`, `综合分值${i}`)

  const existingByEmployeeNo = new Map(existingRows.map(row => [String(row.employee_no), row]))
  const rows = users
    .filter(user => ['manager', 'staff'].includes(user.level) && !Number(user.is_admin || 0))
    .sort((a, b) => String(a.employee_no || '').localeCompare(String(b.employee_no || ''), 'zh-Hans-CN'))
    .map(user => {
      const existing = existingByEmployeeNo.get(String(user.employee_no))
      const questionCells = Array.from({ length: 30 }, () => '' as string | number)
      for (const question of existing?.performance_questions || []) {
        const offset = (Number(question.seq) - 1) * 2
        questionCells[offset] = question.content
        questionCells[offset + 1] = question.weight
      }
      for (const question of existing?.comprehensive_questions || []) {
        const offset = 20 + (Number(question.seq) - 1) * 2
        questionCells[offset] = question.content
        questionCells[offset + 1] = question.weight
      }
      return [user.name || '', user.employee_no || '', ...questionCells]
    })

  return buildCsvText(headers, rows)
}
