import { describe, expect, it } from 'vitest'
import {
  evaluationPath,
  evaluationScene,
  requiresGradePreview,
} from './relationScene'

describe('relation scene', () => {
  it('classifies legacy staff-to-manager peer relations as upward', () => {
    const relation = {
      id: 1564,
      batch_id: 4,
      eval_type: 'peer',
      evaluator_level: 'staff',
      target_level: 'manager',
    }
    expect(evaluationScene(relation)).toBe('upward')
    expect(requiresGradePreview(relation)).toBe(false)
    expect(evaluationPath(relation, 4)).toBe('/upward-eval/4/1564')
  })

  it('keeps staff peers and manager downward evaluations graded', () => {
    expect(requiresGradePreview({
      eval_type: 'peer',
      evaluator_level: 'staff',
      target_level: 'staff',
    })).toBe(true)
    expect(requiresGradePreview({
      eval_type: 'downward',
      evaluator_level: 'manager',
      target_level: 'staff',
    })).toBe(true)
  })

  it('does not grade manager peer evaluations', () => {
    expect(requiresGradePreview({
      eval_type: 'peer',
      evaluator_level: 'manager',
      target_level: 'manager',
    })).toBe(false)
  })
})
