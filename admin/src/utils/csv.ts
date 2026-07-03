import Papa from 'papaparse'

export type CsvEncoding = 'utf-8' | 'gb18030'

export interface ParsedCsv {
  encoding: CsvEncoding
  headers: string[]
  items: Array<Record<string, string | number>>
}

export function buildCsvText(headers: string[], rows: Array<Array<string | number | null | undefined>> = []): string {
  return `\uFEFF${Papa.unparse([headers, ...rows], { newline: '\r\n' })}`
}

function decode(bytes: ArrayBuffer): { text: string; encoding: CsvEncoding } {
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      encoding: 'utf-8',
    }
  } catch {
    try {
      return {
        text: new TextDecoder('gb18030', { fatal: true }).decode(bytes),
        encoding: 'gb18030',
      }
    } catch {
      throw new Error('文件编码无法识别，请使用 UTF-8 或 GBK/GB18030 格式的 CSV 文件')
    }
  }
}

function isBlankRow(row: unknown[]): boolean {
  return row.every(value => String(value ?? '').trim() === '')
}

function validateHeaders(values: unknown[]): string[] {
  const headers = values.map((value, index) => {
    const header = String(value ?? '').replace(/^\uFEFF/, '').trim()
    if (!header) throw new Error(`第 ${index + 1} 列表头为空，请检查导入模板`)
    return header
  })

  const seen = new Set<string>()
  for (const header of headers) {
    if (seen.has(header)) throw new Error(`表头“${header}”重复，请检查导入模板`)
    seen.add(header)
  }
  return headers
}

export function parseCsvBuffer(bytes: ArrayBuffer): ParsedCsv {
  const decoded = decode(bytes)
  const parsed = Papa.parse<string[]>(decoded.text, { skipEmptyLines: false })
  if (parsed.errors.length > 0) {
    const error = parsed.errors[0]
    const row = typeof error.row === 'number' ? `第 ${error.row + 1} 行` : 'CSV 文件'
    throw new Error(`${row}格式错误：${error.message}`)
  }

  const rows = parsed.data
  const headerIndex = rows.findIndex(row => !isBlankRow(row))
  if (headerIndex < 0) throw new Error('文件内容为空')

  const headers = validateHeaders(rows[headerIndex])
  const items: Array<Record<string, string | number>> = []

  for (let index = headerIndex + 1; index < rows.length; index++) {
    const row = rows[index]
    if (isBlankRow(row)) continue

    const item: Record<string, string | number> = { __row: index + 1 }
    headers.forEach((header, column) => {
      item[header] = String(row[column] ?? '').trim()
    })
    items.push(item)
  }

  if (items.length === 0) throw new Error('文件没有可导入的数据行')
  return { encoding: decoded.encoding, headers, items }
}
