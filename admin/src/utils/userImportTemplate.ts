import { buildCsvText } from './csv'

export const USER_IMPORT_HEADERS = [
  '姓名', '工号', '部门', '岗位', '角色', '手机号', '身份证后四位', '状态', '负责部门',
] as const

const EXAMPLE_VALUES = [
  '张三（示例，请覆盖或删除本行）',
  'EXAMPLE001',
  '综合部',
  '业务专员',
  '员工',
  '13800138000',
  '1234',
  '启用',
  '',
] as const

export function buildUserImportTemplate(): string {
  return buildCsvText([...USER_IMPORT_HEADERS], [[...EXAMPLE_VALUES]])
}

export function removeUnchangedExampleRows(items: Array<Record<string, string | number>>) {
  return items.filter(item => !USER_IMPORT_HEADERS.every((header, index) => String(item[header] ?? '') === EXAMPLE_VALUES[index]))
}
