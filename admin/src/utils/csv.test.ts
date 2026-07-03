import { describe, expect, it } from 'vitest'
import iconv from 'iconv-lite'
import { buildCsvText, parseCsvBuffer } from './csv'

function toArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

describe('parseCsvBuffer', () => {
  it('decodes GB18030 and treats quoted multiline cells as one spreadsheet row', () => {
    const source = [
      '姓名,工号,业绩题1,业绩分值1',
      '张三,ZS001,"第一行\n第二行，含中文逗号",70',
      '李四,LS001,"包含""引号""的题目",70',
    ].join('\r\n')

    const result = parseCsvBuffer(toArrayBuffer(iconv.encode(source, 'gb18030')))

    expect(result.encoding).toBe('gb18030')
    expect(result.headers).toEqual(['姓名', '工号', '业绩题1', '业绩分值1'])
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      __row: 2,
      姓名: '张三',
      工号: 'ZS001',
      业绩题1: '第一行\n第二行，含中文逗号',
    })
    expect(result.items[1]).toMatchObject({ __row: 3, 姓名: '李四', 业绩题1: '包含"引号"的题目' })
  })

  it('accepts UTF-8 BOM and skips truly empty spreadsheet rows', () => {
    const source = '\uFEFF姓名,工号\r\n张三,ZS001\r\n,\r\n李四,LS001'
    const result = parseCsvBuffer(new TextEncoder().encode(source).buffer)

    expect(result.encoding).toBe('utf-8')
    expect(result.items.map(item => item.__row)).toEqual([2, 4])
  })

  it('rejects duplicate and empty headers with a human-readable message', () => {
    expect(() => parseCsvBuffer(new TextEncoder().encode('姓名,工号,工号\n张三,A1,A2').buffer))
      .toThrow('表头“工号”重复')
    expect(() => parseCsvBuffer(new TextEncoder().encode('姓名,,部门\n张三,,综合部').buffer))
      .toThrow('第 2 列表头为空')
  })

  it('builds an Excel-friendly UTF-8 BOM template and escapes cells', () => {
    const text = buildCsvText(['姓名', '备注'], [['张三', '包含,逗号和"引号"']])

    expect(text.startsWith('\uFEFF')).toBe(true)
    expect(text).toContain('姓名,备注\r\n')
    expect(text).toContain('张三,"包含,逗号和""引号"""')
  })
})
