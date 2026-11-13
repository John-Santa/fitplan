// Flexible week: routines are not tied to weekdays. The goal is to do every
// active routine once per calendar week (Monday..Sunday), on any day and in
// any order; the remaining days are rest wildcards used whenever you want.
import type { PlanRoutine, Session, SessionKind, TrainingPlan } from '../../../lib/types'
import { sessionVolume, todayISO } from '../../../lib/calc'
import { finishedIn, swimDistance } from '../../../lib/disciplines'
import { blockWeekNumber, phaseForWeek } from '../../../lib/phases'
import { blockWeekVolume } from '../../today/lib/blockEnd'

const parse = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Monday..Sunday ISO dates of the calendar week that contains `today`. */
export function weekDays(today: string): string[] {
  const t = parse(today)
  const monday = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => todayISO(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)))
}

/** Active routines in plan order: the week's rotation. */
export function weekRotation(plan: Pick<TrainingPlan, 'routines'>): PlanRoutine[] {
  return plan.routines.filter(r => !r.archived)
}

/** Workouts per week: one per active routine, capped at 7. */
export function weeklyTarget(plan: Pick<TrainingPlan, 'routines'>): number {
  return Math.min(7, weekRotation(plan).length)
}

/** Rest wildcards per week: the days the target leaves free. */
export function restAllowance(plan: Pick<TrainingPlan, 'routines'>): number {
  return Math.max(0, 7 - weeklyTarget(plan))
}

/** Bounds that make `finishedIn` match every date of the history. */
export const ALL_DATES = { start: '0000-01-01', end: '9999-12-31' } as const

/** A weekly target as a whole number of days, 0..7 (non-numbers are 0). */
const clampTarget = (n: number): number => (Number.isFinite(n) ? Math.min(7, Math.max(0, Math.round(n))) : 0)

/** Workouts per week of one discipline (D10-A): Gimnasio's comes from the
 *  plan (`weeklyTarget`), Natación's is the swim weekly target. */
export function weeklyTargetFor(kind: SessionKind, plan: Pick<TrainingPlan, 'routines'>, swimWeeklyTarget: number): number {
  return kind === 'strength' ? weeklyTarget(plan) : clampTarget(swimWeeklyTarget)
}

/** Rest wildcards per week of one discipline: 7 minus its target. */
export function restAllowanceFor(kind: SessionKind, plan: Pick<TrainingPlan, 'routines'>, swimWeeklyTarget: number): number {
  return kind === 'strength' ? restAllowance(plan) : 7 - clampTarget(swimWeeklyTarget)
}

/** Routine ids with a finished strength session in today's calendar week. */
export function routinesDoneThisWeek(sessions: readonly Session[], today: string): Set<string> {
  const days = weekDays(today)
  return new Set(
    sessions
      .filter(s => s.kind === 'strength' && s.finishedAt != null && s.date >= days[0] && s.date <= days[6])
      .map(s => (s.kind === 'strength' ? s.routineId : '')),
  )
}

/** Suggested next workout: the first routine of the rotation not done this
 *  week; null when the week's routines are all done. */
export function nextRoutine(plan: Pick<TrainingPlan, 'routines'>, sessions: readonly Session[], today: string): PlanRoutine | null {
  const done = routinesDoneThisWeek(sessions, today)
  return weekRotation(plan).find(r => !done.has(r.id)) ?? null
}

export interface WeekSummary {
  target: number
  /** Distinct rotation routines finished this week. */
  done: number
  restAllowance: number
  /** Past days of this week with no activity (wildcards spent), capped. */
  restUsed: number
}

export function weekSummary(plan: Pick<TrainingPlan, 'routines'>, sessions: readonly Session[], checkIns: readonly string[], today: string): WeekSummary {
  const days = weekDays(today)
  const rotation = new Set(weekRotation(plan).map(r => r.id))
  const done = [...routinesDoneThisWeek(sessions, today)].filter(id => rotation.has(id)).length
  const active = new Set(sessions.filter(s => s.finishedAt != null).map(s => s.date))
  const allowance = restAllowance(plan)
  const empty = days.filter(d => d < today && !active.has(d) && !checkIns.includes(d)).length
  return { target: weeklyTarget(plan), done, restAllowance: allowance, restUsed: Math.min(empty, allowance) }
}

/** `weekSummary` for one discipline (S4, D5-A). A day is active only with a
 *  finished session of that kind; walk check-ins count for Gimnasio only
 *  (D4-A), so a swim-only day spends a Gimnasio wildcard. Gimnasio's target
 *  and "done" are the plan's routines, as in `weekSummary`; Natación's done is
 *  the number of distinct days with a finished swim this week. */
export function weekSummaryFor(
  kind: SessionKind,
  plan: Pick<TrainingPlan, 'routines'>,
  sessions: readonly Session[],
  checkIns: readonly string[],
  today: string,
  swimWeeklyTarget: number,
): WeekSummary {
  const days = weekDays(today)
  const own = finishedIn([...sessions], kind, days[0], days[6])
  const active = new Set<string>(own.map(s => s.date))
  const walks = kind === 'strength' ? checkIns : []
  const allowance = restAllowanceFor(kind, plan, swimWeeklyTarget)
  const empty = days.filter(d => d < today && !active.has(d) && !walks.includes(d)).length
  const done = kind === 'strength' ? weekSummary(plan, own, [], today).done : active.size
  return { target: weeklyTargetFor(kind, plan, swimWeeklyTarget), done, restAllowance: allowance, restUsed: Math.min(empty, allowance) }
}

/** Hoy's one-line reminder that resting is allowed: shown while wildcards
 *  remain, nothing was done today and a routine is suggested. Informational:
 *  the flexible week already moves the routine to tomorrow by itself. */
export function restHint(o: { restLeft: number; activeToday: boolean; blockEnded: boolean; routineName: string | null }): string | null {
  if (o.restLeft <= 0 || o.activeToday || o.blockEnded || o.routineName == null) return null
  return `¿Hoy no puedes? Descansa: usas un comodín y mañana sigue ${o.routineName}.`
}

const addDays = (iso: string, days: number): string => {
  const d = parse(iso)
  return todayISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days))
}

export interface ClosedWeekSummary {
  /** Monday of the week (ISO date). */
  monday: string
  target: number
  /** Distinct rotation routines finished that week. */
  done: number
  /** Distinct walk check-in days of that week. */
  walks: number
  /** Strength volume (kg) of that week and of the week before. */
  volume: number
  prevVolume: number
}

/** Numbers of any calendar week (Monday..Sunday) that contains `day`; unlike
 *  weekSummary it does not depend on today. */
export function closedWeekSummary(plan: Pick<TrainingPlan, 'routines'>, sessions: readonly Session[], checkIns: readonly string[], day: string): ClosedWeekSummary {
  const days = weekDays(day)
  const rotation = new Set(weekRotation(plan).map(r => r.id))
  const volumeOf = (week: string[]) =>
    finishedIn([...sessions], 'strength', week[0], week[6]).reduce((a, s) => a + sessionVolume(s), 0)
  return {
    monday: days[0],
    target: weeklyTarget(plan),
    done: [...routinesDoneThisWeek(sessions, day)].filter(id => rotation.has(id)).length,
    walks: new Set(checkIns.filter(d => d >= days[0] && d <= days[6])).size,
    volume: volumeOf(days),
    prevVolume: volumeOf(weekDays(addDays(days[0], -7))),
  }
}

/** Natación's numbers for a closed week (S7): sessions as distinct swim days
 *  against the swim target, and distance (m) of that week and the one before. */
export interface ClosedSwimWeekSummary {
  monday: string
  target: number
  /** Distinct days with a finished swim that week. */
  done: number
  distance: number
  prevDistance: number
}

export type DisciplineClosedWeek =
  | ({ kind: 'strength' } & ClosedWeekSummary)
  | ({ kind: 'swim' } & ClosedSwimWeekSummary)

/** `closedWeekSummary` for one discipline: Gimnasio's is exactly today's
 *  (routines, walks, volume); Natación's has no walks and no volume. */
export function closedWeekSummaryFor(
  kind: SessionKind,
  plan: Pick<TrainingPlan, 'routines'>,
  sessions: readonly Session[],
  checkIns: readonly string[],
  day: string,
  swimWeeklyTarget: number,
): DisciplineClosedWeek {
  if (kind === 'strength') return { kind, ...closedWeekSummary(plan, sessions, checkIns, day) }
  const days = weekDays(day)
  const prev = weekDays(addDays(days[0], -7))
  const distanceOf = (week: string[]) => finishedIn([...sessions], 'swim', week[0], week[6]).reduce((a, s) => a + swimDistance(s), 0)
  return {
    kind,
    monday: days[0],
    target: weeklyTargetFor(kind, plan, swimWeeklyTarget),
    done: new Set(finishedIn([...sessions], 'swim', days[0], days[6]).map(s => s.date)).size,
    distance: distanceOf(days),
    prevDistance: distanceOf(prev),
  }
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "Semana del 16 al 22 nov" (month on both ends when the week spans two). */
export function weekTitle(monday: string): string {
  const a = parse(monday)
  const b = parse(addDays(monday, 6))
  const end = `${b.getDate()} ${MONTHS[b.getMonth()]}`
  return a.getMonth() === b.getMonth() ? `Semana del ${a.getDate()} al ${end}` : `Semana del ${a.getDate()} ${MONTHS[a.getMonth()]} al ${end}`
}

/** Rounded percent change against a base; null when there is no base. */
export function deltaPct(current: number, base: number): number | null {
  return base > 0 ? Math.round(((current - base) / base) * 100) : null
}

export interface BlockReview {
  text: string
  /** Block week the reviewed week falls in (0 once the block ended). */
  week: number
  /** Strength volume (kg) of the block's week 1. */
  firstVolume: number
}

/** "Bloque" line of a reviewed week: block week and phase goal; null before
 *  the block starts, "Bloque terminado" after it ends. */
export function blockReview(
  plan: Pick<TrainingPlan, 'weeks' | 'phases'>,
  block: { blockStart: string; blockEnd: string },
  sessions: readonly Session[],
  monday: string,
): BlockReview | null {
  if (addDays(monday, 6) < block.blockStart) return null
  const firstVolume = blockWeekVolume([...sessions], block.blockStart, 1)
  if (monday > block.blockEnd) return { text: 'Bloque terminado', week: 0, firstVolume }
  const week = blockWeekNumber(parse(monday), block.blockStart)
  const phase = phaseForWeek(plan, week)
  return { text: `Semana ${week} de ${plan.weeks}${phase ? ` · ${phase.goal}` : ''}`, week, firstVolume }
}
