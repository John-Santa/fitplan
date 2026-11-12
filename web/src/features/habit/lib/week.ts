// Flexible week: routines are not tied to weekdays. The goal is to do every
// active routine once per calendar week (Monday..Sunday), on any day and in
// any order; the remaining days are rest wildcards used whenever you want.
import type { PlanRoutine, Session, TrainingPlan } from '../../../lib/types'
import { todayISO } from '../../../lib/calc'

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
