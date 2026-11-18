import type { GeneratedModel } from '../types'

export function guessStyle(fileName: string, ratio: number): GeneratedModel['styleHint'] {
  const lower = fileName.toLowerCase()
  if (lower.includes('chibi') || lower.includes('q版')) return 'chibi'
  if (lower.includes('mascot') || lower.includes('吉祥物')) return 'mascot'
  if (lower.includes('anime') || lower.includes('二次元')) return 'anime'
  if (ratio > 1.8) return 'anime'
  return 'unknown'
}
