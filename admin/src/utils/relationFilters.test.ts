import { describe, expect, it } from 'vitest'
import {
  buildDepartmentOptions,
  buildPersonOptions,
  filterProgressRows,
  filterRelationRows,
  type RelationFilterRow,
} from './relationFilters'

const rows: RelationFilterRow[] = [
  {
    evaluator_id: 1,
    evaluator_name: '同名人员',
    evaluator_department: '综合部',
    target_id: 11,
    target_name: '甲',
    target_department: '研发部',
    eval_type: 'peer',
    status: 'pending',
  },
  {
    evaluator_id: 2,
    evaluator_name: '同名人员',
    evaluator_department: '研发部',
    target_id: 12,
    target_name: '乙',
    target_department: '综合部',
    eval_type: 'downward',
    status: 'draft',
  },
  {
    evaluator_id: 3,
    evaluator_name: '丙',
    evaluator_department: '综合部',
    target_id: 3,
    target_name: '丙',
    target_department: '综合部',
    eval_type: 'self',
    status: 'completed',
  },
]

describe('relation filters', () => {
  it('returns every row when no filter is selected', () => {
    expect(filterRelationRows(rows, {})).toEqual(rows)
  })

  it('uses OR within a filter and AND across filters', () => {
    expect(filterRelationRows(rows, {
      evalTypes: ['peer', 'downward'],
      statuses: ['draft'],
      evaluatorDepartments: ['研发部', '综合部'],
    })).toEqual([rows[1]])
  })

  it('keeps people with the same name as separate ID options', () => {
    const options = buildPersonOptions(rows, 'evaluator')
    expect(options.filter(option => option.name === '同名人员')).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 1, department: '综合部' }),
      expect.objectContaining({ value: 2, department: '研发部' }),
    ]))
  })

  it('deduplicates department options', () => {
    expect(buildDepartmentOptions(rows, 'evaluator')).toHaveLength(2)
    expect(buildDepartmentOptions(rows, 'evaluator')).toEqual(expect.arrayContaining(['综合部', '研发部']))
  })

  it('filters progress by evaluator, including self relations', () => {
    expect(filterProgressRows(rows, { evaluatorIds: [3], statuses: ['completed'] })).toEqual([rows[2]])
    expect(filterProgressRows(rows, { evaluatorIds: [1, 2] })).toEqual([rows[0], rows[1]])
  })
})
