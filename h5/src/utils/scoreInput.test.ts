import { describe, expect, it } from 'vitest'
import { clampScore, formatScoreInput, sanitizeScoreInput } from './scoreInput'

describe('score input', () => {
  it('keeps one decimal place and rejects unrelated characters', () => {
    expect(sanitizeScoreInput('12.34', 20)).toEqual({ text: '12.3', value: 12.3 })
    expect(sanitizeScoreInput('a8。6分', 20)).toEqual({ text: '8.6', value: 8.6 })
  })

  it('supports an in-progress decimal and empty input', () => {
    expect(sanitizeScoreInput('7.', 10)).toEqual({ text: '7.', value: 7 })
    expect(sanitizeScoreInput('', 10)).toEqual({ text: '', value: 0 })
  })

  it('clamps scores to the question range', () => {
    expect(sanitizeScoreInput('18', 10)).toEqual({ text: '10.0', value: 10 })
    expect(clampScore(-2, 10)).toBe(0)
    expect(clampScore(7.26, 10)).toBe(7.3)
  })

  it('formats persisted scores consistently', () => {
    expect(formatScoreInput(7, 10)).toBe('7.0')
    expect(formatScoreInput(7.28, 10)).toBe('7.3')
  })
})
