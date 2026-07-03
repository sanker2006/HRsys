import { describe, expect, it } from 'vitest'
import { parseCsvBuffer } from './csv'
import { buildUserImportTemplate, removeUnchangedExampleRows } from './userImportTemplate'

describe('user import template', () => {
  it('contains one complete example row', () => {
    const text = buildUserImportTemplate()
    const parsed = parseCsvBuffer(new TextEncoder().encode(text).buffer)

    expect(parsed.headers).toEqual([
      '姓名', '工号', '部门', '岗位', '角色', '手机号', '身份证后四位', '状态', '负责部门',
    ])
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]).toMatchObject({
      姓名: '张三（示例，请覆盖或删除本行）',
      工号: 'EXAMPLE001',
      部门: '综合部',
      角色: '员工',
      状态: '启用',
    })
  })

  it('ignores only the unchanged example row', () => {
    const parsed = parseCsvBuffer(new TextEncoder().encode(buildUserImportTemplate()).buffer)
    expect(removeUnchangedExampleRows(parsed.items)).toEqual([])

    const realRow = { ...parsed.items[0], 姓名: '李四', 工号: 'LS001' }
    expect(removeUnchangedExampleRows([realRow])).toEqual([realRow])
  })
})
