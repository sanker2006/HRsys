import { evaluationScene, type EvaluationScene } from './relationScene'

export type RelationSide = 'evaluator' | 'target'

export interface RelationFilterRow {
  evaluator_id: number
  evaluator_name?: string
  evaluator_department?: string
  target_id: number
  target_name?: string
  target_department?: string
  eval_type?: string
  evaluation_scene?: EvaluationScene
  evaluator_level?: string
  target_level?: string
  status?: string
}

export interface PersonOption {
  value: number
  label: string
  name: string
  department: string
}

export interface RelationFilters {
  evalTypes?: string[]
  statuses?: string[]
  evaluatorIds?: number[]
  evaluatorDepartments?: string[]
  targetIds?: number[]
  targetDepartments?: string[]
}

function includesWhenSelected<T>(selected: T[] | undefined, value: T): boolean {
  return !selected?.length || selected.includes(value)
}

export function buildPersonOptions(rows: RelationFilterRow[], side: RelationSide): PersonOption[] {
  const options = new Map<number, PersonOption>()
  for (const row of rows) {
    const value = side === 'evaluator' ? row.evaluator_id : row.target_id
    const name = String(side === 'evaluator' ? row.evaluator_name || '' : row.target_name || '').trim()
    const department = String(side === 'evaluator' ? row.evaluator_department || '' : row.target_department || '').trim()
    if (!options.has(value)) {
      options.set(value, {
        value,
        name,
        department,
        label: department ? `${name}（${department}）` : name,
      })
    }
  }
  return [...options.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-CN') || a.department.localeCompare(b.department, 'zh-CN') || a.value - b.value
  )
}

export function buildDepartmentOptions(rows: RelationFilterRow[], side: RelationSide): string[] {
  const values = rows
    .map(row => side === 'evaluator' ? row.evaluator_department : row.target_department)
    .map(value => String(value || '').trim())
    .filter(Boolean)
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export function filterRelationRows<T extends RelationFilterRow>(rows: T[], filters: RelationFilters): T[] {
  return rows.filter(row =>
    includesWhenSelected(filters.evalTypes, evaluationScene(row))
    && includesWhenSelected(filters.statuses, String(row.status || ''))
    && includesWhenSelected(filters.evaluatorIds, row.evaluator_id)
    && includesWhenSelected(filters.evaluatorDepartments, String(row.evaluator_department || ''))
    && includesWhenSelected(filters.targetIds, row.target_id)
    && includesWhenSelected(filters.targetDepartments, String(row.target_department || ''))
  )
}

export function filterProgressRows<T extends RelationFilterRow>(
  rows: T[],
  filters: Pick<RelationFilters, 'evaluatorIds' | 'evaluatorDepartments' | 'statuses'>
): T[] {
  return filterRelationRows(rows, filters)
}
