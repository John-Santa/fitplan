// Pins lastPerformance and shouldProgress: the "la vez pasada" reference and the
// double-progression rule that the session screen is built on.
import { describe, expect, it } from 'vitest'
import type { SetLog, StrengthSession } from './types'
import { bySessionTime, lastPerformance, shouldProgress } from './calc'

const set = (exerciseId: string, setIndex: number, weight: number | null, reps: number | null, done = true): SetLog => ({
  exerciseId, setIndex, weight, reps, done,
})

function session(id: string, startedAt: number, sets: SetLog[], overrides: Partial<StrengthSession> = {}): StrengthSession {
  return {
    kind: 'strength', id, routineId: 'dia1', date: '2026-01-05', startedAt, finishedAt: startedAt + 1000, sets, notes: '', ...overrides,
  }
}

describe('lastPerformance', () => {
  it('returns the done sets of the most recent finished session, ordered by set index', () => {
    const older = session('a', 1000, [set('squat', 0, 50, 10)])
    const newer = session('b', 2000, [set('squat', 1, 62.5, 8), set('squat', 0, 60, 10)])
    const got = lastPerformance([older, newer], 'squat')
    expect(got?.session.id).toBe('b')
    expect(got?.sets.map(s => s.setIndex)).toEqual([0, 1])
    expect(got?.sets.map(s => s.weight)).toEqual([60, 62.5])
  })

  it('skips unfinished sessions, the excluded session, and sessions without that exercise', () => {
    const unfinished = session('u', 4000, [set('squat', 0, 90, 5)], { finishedAt: null })
    const excluded = session('x', 3000, [set('squat', 0, 80, 5)])
    const other = session('o', 2500, [set('press', 0, 40, 10)])
    const valid = session('v', 1000, [set('squat', 0, 60, 10)])
    expect(lastPerformance([unfinished, excluded, other, valid], 'squat', 'x')?.session.id).toBe('v')
  })

  it('ignores sets that are not done or have no weight', () => {
    const s = session('a', 1000, [set('squat', 0, 60, 10, false), set('squat', 1, null, 10)])
    expect(lastPerformance([s], 'squat')).toBeNull()
  })

  it('returns null when there is no history', () => {
    expect(lastPerformance([], 'squat')).toBeNull()
  })
})

describe('lastPerformance with back-dated sessions', () => {
  // A session logged afterwards for a past date gets startedAt = now, so it
  // must still count by the date it was done on, not by when it was typed in.
  it('treats a session logged late for an earlier date as older than a session done after that date', () => {
    const doneOnTheFifth = session('real', 1000, [set('squat', 0, 60, 10)], { date: '2026-01-05' })
    const loggedLateForTheFirst = session('late', 9000, [set('squat', 0, 40, 10)], { date: '2026-01-01' })
    expect(lastPerformance([doneOnTheFifth, loggedLateForTheFirst], 'squat')?.session.id).toBe('real')
  })

  it('for a session being logged for a past date, only sessions before it count as "la vez pasada"', () => {
    const before = session('nov3', 1000, [set('squat', 0, 50, 10)], { date: '2026-11-03' })
    const after = session('nov10', 2000, [set('squat', 0, 70, 10)], { date: '2026-11-10' })
    const current = session('nov5', 9000, [], { date: '2026-11-05', finishedAt: null })
    expect(lastPerformance([before, after, current], 'squat', current.id, current)?.session.id).toBe('nov3')
    // Without the current session the reference stays the latest one, as before.
    expect(lastPerformance([before, after, current], 'squat', current.id)?.session.id).toBe('nov10')
  })

  it('falls back to startedAt when two sessions share a date', () => {
    const morning = session('am', 1000, [set('squat', 0, 50, 10)], { date: '2026-01-05' })
    const evening = session('pm', 2000, [set('squat', 0, 60, 10)], { date: '2026-01-05' })
    expect(lastPerformance([evening, morning], 'squat')?.session.id).toBe('pm')
  })

  it('does not reorder the array it is given', () => {
    const list = [session('a', 1000, [set('squat', 0, 50, 10)]), session('b', 2000, [set('squat', 0, 60, 10)])]
    lastPerformance(list, 'squat')
    expect(list.map(s => s.id)).toEqual(['a', 'b'])
  })
})

describe('bySessionTime', () => {
  // The one chronological order every screen uses: the session date first (a
  // back-dated session sits on its own day), then startedAt on the same day.
  it('sorts by session date, then by start time, oldest first', () => {
    const lateForTheFirst = session('late', 9000, [], { date: '2026-01-01' })
    const fifthEvening = session('pm', 2000, [], { date: '2026-01-05' })
    const fifthMorning = session('am', 1000, [], { date: '2026-01-05' })
    expect([fifthEvening, lateForTheFirst, fifthMorning].sort(bySessionTime).map(s => s.id)).toEqual(['late', 'am', 'pm'])
  })
})

describe('shouldProgress', () => {
  const three = (reps: number[]) => reps.map((r, i) => set('squat', i, 60, r))

  it('is true when every expected set reached the top of the range', () => {
    expect(shouldProgress(three([12, 12, 12]), 3, 12)).toBe(true)
  })

  it('is false when one set is under the top of the range', () => {
    expect(shouldProgress(three([12, 11, 12]), 3, 12)).toBe(false)
  })

  it('is false when fewer sets were done than expected', () => {
    expect(shouldProgress(three([12, 12]), 3, 12)).toBe(false)
  })

  it('counts only done sets that have reps', () => {
    const sets = [...three([12, 12, 12]), set('squat', 3, 60, 5, false)]
    expect(shouldProgress(sets, 3, 12)).toBe(true)
    expect(shouldProgress([set('squat', 0, 60, null), set('squat', 1, 60, 12), set('squat', 2, 60, 12)], 3, 12)).toBe(false)
  })
})
