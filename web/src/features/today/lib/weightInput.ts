import type { Measurement } from '../../../lib/types'

/** Shown when the quick weight field does not hold a usable weight. */
export const WEIGHT_ERROR = 'Escribe tu peso en kg'

/** The weight typed in the quick log, or null when it is empty, zero,
 *  negative or not a number. A comma counts as the decimal separator. */
export function parseWeight(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Prefill for the quick log: the weight of the latest measurement as the
 *  input text, or empty when nothing was recorded yet. `measurements` comes
 *  sorted by date, oldest first. */
export function lastWeight(measurements: readonly Measurement[]): string {
  const last = measurements[measurements.length - 1]
  return last ? String(last.weight) : ''
}
