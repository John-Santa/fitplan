// Habit tracking (Atomic Habits): pure domain over sessions + config. No
// clock reads: every function receives `today` so results are deterministic.
import type { Config, Intention, Session } from '../../../lib/types'
import { todayISO } from '../../../lib/calc'

/** 'none' = before the person's first ever activity (neutral, never a miss). */
export type DayStatus = 'kept' | 'rest' | 'missed' | 'pending' | 'future' | 'none'

export interface HabitContext {
  sessions: readonly Session[]
  config: Config
  /** Local date, YYYY-MM-DD. */
  today: string
  /** Rest wildcards per calendar week (Monday..Sunday): the first days without
   *  activity in a week are rest, any day any week; past that they are missed.
   *  Defaults to the rest days of the configured week (2 in the default plan). */
  restAllowance?: number
}

export interface HabitCell {
  date: string
  status: DayStatus
}

export interface Streak {
  days: number
  atRisk: boolean
}

/** Longest walk back in days; a hard stop so a malformed context can never loop. */
const MAX_WALK_DAYS = 3660

const parse = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** ISO date `delta` days from `iso` (local calendar, DST-safe). */
const shift = (iso: string, delta: number): string => {
  const d = parse(iso)
  d.setDate(d.getDate() + delta)
  return todayISO(d)
}

const finishedDates = (ctx: HabitContext): Set<string> =>
  new Set(ctx.sessions.filter(s => s.finishedAt != null).map(s => s.date))

/** Earliest date with a finished session or a check-in; null with no activity. */
function firstActivity(ctx: HabitContext): string | null {
  const dates = [...finishedDates(ctx), ...ctx.config.habitCheckIns]
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b))
}

export function dayStatus(date: string, ctx: HabitContext): DayStatus {
  if (date > ctx.today) return 'future'
  if (finishedDates(ctx).has(date) || ctx.config.habitCheckIns.includes(date)) return 'kept'
  const first = firstActivity(ctx)
  if (date < ctx.today && (first === null || date < first)) return 'none'
  if (date === ctx.today) return 'pending'
  return restWildcardUsed(date, ctx, first) ? 'rest' : 'missed'
}

/** Rest days are not fixed weekdays: they are wildcards. A past day with no
 *  activity uses one of the week's wildcards while any are left. */
function restWildcardUsed(date: string, ctx: HabitContext, first: string | null): boolean {
  const allowance = ctx.restAllowance ?? ctx.config.weeklyRoutine.filter(d => d.kind === 'rest').length
  const sinceMonday = (parse(date).getDay() + 6) % 7
  const done = finishedDates(ctx)
  let usedBefore = 0
  for (let i = sinceMonday; i > 0; i--) {
    const d = shift(date, -i)
    if (first !== null && d < first) continue
    if (!done.has(d) && !ctx.config.habitCheckIns.includes(d)) usedBefore++
  }
  return usedBefore < allowance
}

/** `weeks` weeks, oldest first, each Monday..Sunday. The last one is the
 *  calendar week that contains today. */
export function habitGrid(ctx: HabitContext, weeks = 12): HabitCell[][] {
  const sinceMonday = (parse(ctx.today).getDay() + 6) % 7
  const currentMonday = shift(ctx.today, -sinceMonday)
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = shift(currentMonday, (w - (weeks - 1)) * 7 + d)
      return { date, status: dayStatus(date, ctx) }
    }),
  )
}

export function missedYesterday(ctx: HabitContext): boolean {
  return dayStatus(shift(ctx.today, -1), ctx) === 'missed'
}

/** Never miss twice: kept and rest days add to the chain, one isolated missed
 *  day is forgiven (adds nothing, breaks nothing), two in a row end it.
 *  Today only counts when kept or rest; a pending today neither counts nor
 *  breaks. atRisk: yesterday was missed and today is still pending (a rest
 *  day cannot be missed, so it is not at risk). */
export function streak(ctx: HabitContext): Streak {
  let days = 0
  let misses = 0
  for (let i = 0; i < MAX_WALK_DAYS; i++) {
    const status = dayStatus(shift(ctx.today, -i), ctx)
    if (status === 'kept' || status === 'rest') {
      days++
      misses = 0
    } else if (status === 'missed') {
      if (++misses >= 2) break
    } else if (status === 'none') {
      break
    } // pending: today without a verdict yet, skip
  }
  return { days, atRisk: missedYesterday(ctx) && dayStatus(ctx.today, ctx) === 'pending' }
}

/** Identity votes: each finished session, plus each check-in on a date that
 *  has no finished session (so a session and a check-in the same day are one
 *  vote per session, not two). */
export function votes(ctx: HabitContext): number {
  const finished = ctx.sessions.filter(s => s.finishedAt != null)
  const withSession = new Set(finished.map(s => s.date))
  return finished.length + ctx.config.habitCheckIns.filter(d => !withSession.has(d)).length
}

/** The implementation intention for a weekday (0 = Sunday), or null when
 *  neither time nor place is set. */
export function intentionFor(config: Config, dow: number): Intention | null {
  const i = config.intentions[dow]
  return i && (i.time !== '' || i.place !== '') ? i : null
}

/** Adds the date to habitCheckIns, or removes it if already there. */
export function toggleCheckIn(config: Config, date: string): Config {
  const has = config.habitCheckIns.includes(date)
  const next = has ? config.habitCheckIns.filter(d => d !== date) : [...config.habitCheckIns, date].sort()
  return { ...config, habitCheckIns: next }
}

/** Longest chain over all history, same never-miss-twice rule as `streak`,
 *  walked forward from the first activity to today. */
export function bestStreak(ctx: HabitContext): number {
  const first = firstActivity(ctx)
  if (first === null || first > ctx.today) return 0
  let best = 0
  let run = 0
  let misses = 0
  let date = first
  for (let i = 0; i < MAX_WALK_DAYS && date <= ctx.today; i++, date = shift(date, 1)) {
    const status = dayStatus(date, ctx)
    if (status === 'kept' || status === 'rest') {
      run++
      misses = 0
      if (run > best) best = run
    } else if (status === 'missed') {
      if (++misses >= 2) run = 0
    } else if (status === 'none') {
      run = 0
    }
  }
  return best
}

/** Share of kept days over kept + missed in the last `weeks` weeks, 0..100.
 *  Rest, pending, future and pre-activity days do not count. 0 with no data. */
export function consistency(ctx: HabitContext, weeks = 12): number {
  let kept = 0
  let missed = 0
  for (const week of habitGrid(ctx, weeks)) {
    for (const cell of week) {
      if (cell.status === 'kept') kept++
      else if (cell.status === 'missed') missed++
    }
  }
  return kept + missed === 0 ? 0 : Math.round((kept / (kept + missed)) * 100)
}
