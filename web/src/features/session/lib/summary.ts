import type { Config, Session, StrengthSession } from '../../../lib/types'
import { doneSets, sessionVolume } from '../../../lib/calc'
import { isBefore, recordsBroken, type BrokenRecord } from '../../../lib/records'
import { streak } from '../../habit/lib/habit'

/** Totals against the previous finished session of the same routine (D4-A). */
export type SummaryComparison =
  | { kind: 'previous'; volumeDelta: number; setsDelta: number }
  /** No earlier session of this routine: "Primera vez con esta rutina". */
  | { kind: 'first' }

export interface SessionSummaryData {
  volume: number
  sets: number
  /** Finished minus started; null for a session that is not finished. */
  durationMs: number | null
  records: BrokenRecord[]
  /** Null when the comparison does not apply (a minimal session). */
  comparison: SummaryComparison | null
  /** Streak including the finished session's day. */
  streakDays: number
}

/** What the closing screen shows for a finished strength session. Everything
 *  is derived: `sessions` is the saved history, with or without `finished`
 *  (the store may not have it yet), so nothing here is stored. */
export function summarizeSession(
  finished: StrengthSession,
  sessions: readonly Session[],
  habit: { config: Config; today: string; restAllowance?: number },
): SessionSummaryData {
  const all = [...sessions.filter(s => s.id !== finished.id), finished]
  const volume = sessionVolume(finished)
  const sets = doneSets(finished)

  let comparison: SummaryComparison | null = null
  // Assumption (S2): a minimal session covers one exercise, so comparing its
  // totals says nothing; for the same reason a minimal one is never the base.
  if (!finished.minimal) {
    const previous = all
      .filter((s): s is StrengthSession =>
        s.kind === 'strength' && s.finishedAt != null && s.routineId === finished.routineId && !s.minimal && isBefore(s, finished))
      .reduce<StrengthSession | null>((a, s) => (a === null || isBefore(a, s) ? s : a), null)
    comparison = previous
      ? { kind: 'previous', volumeDelta: volume - sessionVolume(previous), setsDelta: sets - doneSets(previous) }
      : { kind: 'first' }
  }

  return {
    volume,
    sets,
    durationMs: finished.finishedAt != null ? finished.finishedAt - finished.startedAt : null,
    records: recordsBroken(finished, all),
    comparison,
    streakDays: streak({ sessions: all, config: habit.config, today: habit.today, restAllowance: habit.restAllowance }).days,
  }
}
