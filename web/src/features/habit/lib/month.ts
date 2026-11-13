// Monthly calendar: which days had strength, swim or a walk. Read-only over
// existing data. A walk is a habit check-in (same definition as the weekly
// summary). Dates are local YYYY-MM-DD strings; nothing here slices UTC.
import type { Session, SessionKind } from '../../../lib/types'
import { finishedIn } from '../../../lib/disciplines'

export type MonthActivityKind = 'strength' | 'swim' | 'walk'

/** Activities per day of the month; days without activity are absent. */
export type MonthActivity = Record<string, MonthActivityKind[]>

const ORDER: MonthActivityKind[] = ['strength', 'swim', 'walk']
const pad = (n: number) => String(n).padStart(2, '0')

/** `month` is 1-12. */
export const monthBounds = (year: number, month: number): { start: string; end: string } => {
  const last = new Date(year, month, 0).getDate()
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(last)}` }
}

/** With `kind` only that discipline is marked, plus walks under Gimnasio
 *  (D4-A: check-ins belong to Gimnasio). Without it every mark is returned. */
export function monthActivity(
  sessions: readonly Session[],
  checkIns: readonly string[],
  year: number,
  month: number,
  kind?: SessionKind,
): MonthActivity {
  const { start, end } = monthBounds(year, month)
  const all = [...sessions]
  const seen: Record<string, Set<MonthActivityKind>> = {}
  const mark = (date: string, kind: MonthActivityKind) => {
    ;(seen[date] ??= new Set()).add(kind)
  }
  if (kind === undefined || kind === 'strength') for (const s of finishedIn(all, 'strength', start, end)) mark(s.date, 'strength')
  if (kind === undefined || kind === 'swim') for (const s of finishedIn(all, 'swim', start, end)) mark(s.date, 'swim')
  if (kind === undefined || kind === 'strength') for (const d of checkIns) if (d >= start && d <= end) mark(d, 'walk')

  const out: MonthActivity = {}
  for (const date of Object.keys(seen).sort()) out[date] = ORDER.filter(k => seen[date].has(k))
  return out
}

/** Monday-first weeks of the month; `null` pads days outside the month. */
export function monthWeeks(year: number, month: number): (string | null)[][] {
  const days = new Date(year, month, 0).getDate()
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}
