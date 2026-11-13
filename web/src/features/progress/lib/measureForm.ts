import type { Measurement } from '../../../lib/types'
import { MEASUREMENT_KEYS } from '../../../lib/plan'

/** The "Nueva medición" form: one text value per input, keyed like
 *  Measurement ('date' plus every MEASUREMENT_KEYS field). */
export type MeasureForm = Record<string, string>

const storedFor = (date: string, measurements: readonly Measurement[]) => measurements.find(m => m.date === date)

/** The form for `date`. A date that already has a measurement shows its
 *  stored values, so what is on screen is what will be saved. Moving to a new
 *  date keeps what was typed, unless the form was showing another date's
 *  stored values: those belong to that date and are cleared. */
export function formForDate(date: string, measurements: readonly Measurement[], current?: MeasureForm): MeasureForm {
  const stored = storedFor(date, measurements)
  if (stored) {
    const form: MeasureForm = { date }
    for (const k of MEASUREMENT_KEYS) if (stored[k] != null) form[k] = String(stored[k])
    return form
  }
  if (!current || storedFor(current.date ?? '', measurements)) return { date }
  return { ...current, date }
}

/** The measurement exactly as the form shows it: an empty field is left out,
 *  so saving it over a stored record removes that field. Null when the date
 *  or a numeric weight is missing. */
export function measurementFromForm(form: MeasureForm): Measurement | null {
  const weight = Number(form.weight)
  if (!form.date || !form.weight || Number.isNaN(weight)) return null
  const m: Measurement = { date: form.date, weight }
  for (const k of MEASUREMENT_KEYS) {
    if (k === 'weight') continue
    const raw = form[k]
    const v = Number(raw)
    if (raw != null && raw !== '' && !Number.isNaN(v)) m[k] = v
  }
  return m
}
