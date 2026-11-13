// Natación's Hoy (S5): the week's count, distance and last session for the
// hero, as a pure function so the acceptance needs no Home render. The habit
// rules (target, wildcards, "done" as distinct swim days) are weekSummaryFor's;
// distance and "finished" are disciplines.ts's.
import type { Config, Session, SwimSession } from '../../../lib/types'
import { finishedIn, swimDistance, swimSessionPaceSecPer100m } from '../../../lib/disciplines'
import { todayISO } from '../../../lib/calc'
import { weekDays, weekSummaryFor } from '../../habit/lib/week'

/** 4320 -> "4.320". */
export const fmtThousands = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** Seconds as "m:ss": 125 -> "2:05". */
export function mmss(sec: number): string {
  const total = Math.round(sec)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export interface SwimToday {
  /** Distinct days with a finished swim this calendar week. */
  done: number
  /** `swimWeeklyTarget`, clamped as the habit rules do. */
  target: number
  /** Metres swum this calendar week. */
  distance: number
  /** Metres of the last 5 calendar weeks, oldest first, this week last. */
  weekDistances: number[]
  /** 'week-met': the target is reached ("Semana cumplida"); else 'start'. */
  state: 'start' | 'week-met'
  /** A swim is finished today, and its metres. */
  doneToday: boolean
  todayDistance: number
  /** The latest finished swim; null before the first one. */
  last: { distanceM: number; paceSecPer100m: number | null } | null
}

const shiftDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number)
  return todayISO(new Date(y, m - 1, d + days))
}

export function swimToday(sessions: readonly Session[], config: Pick<Config, 'swimWeeklyTarget'>, today: string): SwimToday {
  const all: SwimSession[] = finishedIn([...sessions], 'swim', '0000-01-01', '9999-12-31')
  const metresIn = (days: string[]) => all.filter(s => s.date >= days[0] && s.date <= days[6]).reduce((a, s) => a + swimDistance(s), 0)

  const summary = weekSummaryFor('swim', { routines: [] }, sessions, [], today, config.swimWeeklyTarget)
  const days = weekDays(today)
  const weekDistances = [4, 3, 2, 1, 0].map(back => metresIn(weekDays(shiftDays(today, -7 * back))))
  const todays = all.filter(s => s.date === today)
  const latest = [...all].sort((a, b) => (a.date === b.date ? (a.finishedAt ?? 0) - (b.finishedAt ?? 0) : a.date < b.date ? -1 : 1)).pop()

  return {
    done: summary.done,
    target: summary.target,
    distance: metresIn(days),
    weekDistances,
    state: summary.target > 0 && summary.done >= summary.target ? 'week-met' : 'start',
    doneToday: todays.length > 0,
    todayDistance: todays.reduce((a, s) => a + swimDistance(s), 0),
    last: latest ? { distanceM: swimDistance(latest), paceSecPer100m: swimSessionPaceSecPer100m(latest) } : null,
  }
}
