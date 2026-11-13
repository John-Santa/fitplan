// Per-discipline habit (S4, D5-A): every screen builds the HabitContext of the
// selected discipline here instead of passing all sessions, so streak, votes,
// consistency and wildcards never mix Gimnasio and Natación. The rules in
// habit.ts (never miss twice, the wildcard walk) are reused unchanged.
import type { Config, Session, SessionKind, TrainingPlan } from '../../../lib/types'
import { finishedIn } from '../../../lib/disciplines'
import type { HabitContext } from './habit'
import { ALL_DATES, restAllowanceFor } from './week'

/** Finished sessions of one discipline over the whole history. */
export function sessionsOf(kind: SessionKind, sessions: readonly Session[]): Session[] {
  return finishedIn([...sessions], kind, ALL_DATES.start, ALL_DATES.end)
}

/** The HabitContext of one discipline. A day is kept by a finished session of
 *  that kind; walk check-ins keep the day for Gimnasio only (D4-A), so
 *  Natación sees no check-ins. Wildcards: Gimnasio's from the plan, as today;
 *  Natación's are 7 minus `swimWeeklyTarget` (D10-A), passed explicitly. */
export function habitContextFor(
  kind: SessionKind,
  sessions: readonly Session[],
  config: Config,
  plan: Pick<TrainingPlan, 'routines'>,
  today: string,
  swimWeeklyTarget: number,
): HabitContext {
  return {
    sessions: sessionsOf(kind, sessions),
    config: kind === 'strength' ? config : { ...config, habitCheckIns: [] },
    today,
    restAllowance: restAllowanceFor(kind, plan, swimWeeklyTarget),
  }
}
