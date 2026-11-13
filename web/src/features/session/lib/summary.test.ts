import { describe, expect, it } from 'vitest'
import type { SetLog, StrengthSession } from '../../../lib/types'
import { DEFAULT_CONFIG } from '../../../lib/plan'
import { summarizeSession } from './summary'

const set = (exerciseId: string, setIndex: number, weight: number | null, reps: number | null): SetLog => ({
  exerciseId, setIndex, weight, reps, done: true,
})

let seq = 0
const session = (date: string, sets: SetLog[], extra: Partial<StrengthSession> = {}): StrengthSession => ({
  id: `s${++seq}`,
  kind: 'strength',
  routineId: 'espalda-d1',
  date,
  startedAt: Date.parse(date + 'T10:00:00'),
  finishedAt: Date.parse(date + 'T11:00:00'),
  notes: '',
  sets,
  ...extra,
})

/** `n` sets of 60 kg × reps (one per index) for leg press. */
const sets = (n: number, reps: number, weight = 60): SetLog[] =>
  Array.from({ length: n }, (_, i) => set('leg-press', i, weight, reps))

const habit = (today: string) => ({ config: { ...DEFAULT_CONFIG, habitCheckIns: [] }, today, restAllowance: 2 })

describe('summarizeSession', () => {
  it('returns the volume and the delta against the previous session of the same routine', () => {
    const prev = session('2026-11-05', sets(6, 12, 57.5)) // 6 × 690 = 4140
    const done = session('2026-11-12', sets(6, 12)) // 6 × 720 = 4320
    const s = summarizeSession(done, [prev, done], habit('2026-11-12'))
    expect(s.volume).toBe(4320)
    expect(s.comparison).toEqual({ kind: 'previous', volumeDelta: 180, setsDelta: 0 })
  })

  it('counts the sets done and their delta', () => {
    const prev = session('2026-11-05', sets(4, 10))
    const done = session('2026-11-12', sets(6, 10))
    const s = summarizeSession(done, [prev, done], habit('2026-11-12'))
    expect(s.sets).toBe(6)
    expect(s.comparison).toMatchObject({ setsDelta: 2 })
  })

  it('compares only with the same routine', () => {
    const other = session('2026-11-10', sets(3, 10), { routineId: 'espalda-d2' })
    const done = session('2026-11-12', sets(3, 10))
    expect(summarizeSession(done, [other, done], habit('2026-11-12')).comparison).toEqual({ kind: 'first' })
  })

  it('compares a back-dated session with the one before it by date', () => {
    const early = session('2026-11-01', sets(2, 10))
    const later = session('2026-11-10', sets(5, 10))
    const backDated = session('2026-11-05', sets(3, 10), { startedAt: Date.parse('2026-11-12T10:00:00'), finishedAt: Date.parse('2026-11-12T11:00:00') })
    const s = summarizeSession(backDated, [early, later, backDated], habit('2026-11-12'))
    expect(s.comparison).toEqual({ kind: 'previous', volumeDelta: 600, setsDelta: 1 })
  })

  it('skips the comparison for a minimal session', () => {
    const prev = session('2026-11-05', sets(6, 10))
    const done = session('2026-11-12', sets(2, 10), { minimal: true })
    expect(summarizeSession(done, [prev, done], habit('2026-11-12')).comparison).toBeNull()
  })

  it("lists today's records against earlier sessions", () => {
    const prev = session('2026-11-05', sets(3, 10, 60))
    const done = session('2026-11-12', sets(3, 10, 65))
    expect(summarizeSession(done, [prev, done], habit('2026-11-12')).records).toEqual([
      { exerciseId: 'leg-press', kind: 'weight', value: 65, reps: 10, previous: 60 },
      { exerciseId: 'leg-press', kind: 'volume', value: 1950, previous: 1800 },
    ])
  })

  it('counts today in the streak even before the store has the saved session', () => {
    const yesterday = session('2026-11-11', sets(3, 10), { routineId: 'espalda-d2' })
    const done = session('2026-11-12', sets(3, 10))
    expect(summarizeSession(done, [yesterday], habit('2026-11-12')).streakDays).toBe(2)
  })

  it('reports the duration and a zero volume for a session without weights', () => {
    const done = session('2026-11-12', [{ exerciseId: 'plank', setIndex: 0, weight: null, reps: null, durationSec: 30, done: true }])
    const s = summarizeSession(done, [done], habit('2026-11-12'))
    expect(s.volume).toBe(0)
    expect(s.durationMs).toBe(3_600_000)
  })
})
