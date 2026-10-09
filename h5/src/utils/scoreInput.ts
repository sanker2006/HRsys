export function clampScore(value: number, max: number): number {
  const safeMax = Number.isFinite(max) && max >= 0 ? max : 0
  if (!Number.isFinite(value)) return 0
  return Math.min(safeMax, Math.max(0, Math.round(value * 10) / 10))
}

export function formatScoreInput(value: number, max: number): string {
  return clampScore(value, max).toFixed(1)
}

export function sanitizeScoreInput(raw: string, max: number): { text: string; value: number } {
  let text = String(raw ?? '')
    .replace(/[，。]/g, '.')
    .replace(/[^\d.]/g, '')

  const decimalIndex = text.indexOf('.')
  if (decimalIndex >= 0) {
    text = `${text.slice(0, decimalIndex)}.${text.slice(decimalIndex + 1).replace(/\./g, '').slice(0, 1)}`
  }
  if (text.startsWith('.')) text = `0${text}`
  if (!text) return { text: '', value: 0 }

  const value = Number(text)
  if (!Number.isFinite(value)) return { text: '', value: 0 }
  const clamped = clampScore(value, max)
  if (value > clamped) return { text: formatScoreInput(clamped, max), value: clamped }
  return { text, value: clamped }
}
