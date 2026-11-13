import { describe, expect, it } from 'vitest'
import type { SetLog, StrengthSession, SwimSession } from './types'
import { formatKg, personalRecords, recordLine, recordToast, recordsBroken } from './records'

const set = (exerciseId: string, setIndex: number, weight: number | null, reps: number | null, done = true): SetLog => ({
  exerciseId, setIndex, weight, reps, done,
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

describe('personalRecords', () => {
  it('returns the heaviest done weight and the highest per-session volume (D3-A)', () => {
    const a = session('2026-11-02', [set('leg-press', 0, 80, 8), set('leg-press', 1, 60, 12)]) // 640 + 720 = 1360
    const b = session('2026-11-09', [set('leg-press', 0, 70, 12), set('leg-press', 1, 70, 12)]) // 1680
    const r = personalRecords([a, b], 'leg-press')
    expect(r.bestWeight).toEqual({ weight: 80, reps: 8, date: '2026-11-02', sessionId: a.id })
    expect(r.bestVolume).toEqual({ volume: 1680, date: '2026-11-09', sessionId: b.id })
  })

  it('counts the same exercise logged in two routines as one record set', () => {
    const a = session('2026-11-02', [set('leg-press', 0, 80, 8)])
    const b = session('2026-11-03', [set('leg-press', 0, 90, 5)], { routineId: 'espalda-d4' })
    expect(personalRecords([a, b], 'leg-press').bestWeight?.weight).toBe(90)
  })

  it('ignores sets that are not done or lack weight or reps, unfinished sessions and swim sessions', () => {
    const a = session('2026-11-02', [
      set('leg-press', 0, 100, 8, false),
      set('leg-press', 1, 95, null),
      set('leg-press', 2, null, 10),
      set('leg-press', 3, 50, 10),
    ])
    const open = session('2026-11-03', [set('leg-press', 0, 120, 10)], { finishedAt: null })
    const swim: SwimSession = { id: 'w', kind: 'swim', date: '2026-11-04', startedAt: 0, finishedAt: 1, notes: '', poolLengthM: 25, blocks: [], rpe: null }
    const r = personalRecords([a, open, swim], 'leg-press')
    expect(r.bestWeight?.weight).toBe(50)
    expect(r.bestVolume?.volume).toBe(500)
  })

  it('returns no records for an exercise never done', () => {
    expect(personalRecords([session('2026-11-02', [set('leg-press', 0, 80, 8)])], 'leg-curl')).toEqual({ bestWeight: null, bestVolume: null })
  })

  it('only looks at sessions dated before the given one when asked', () => {
    const early = session('2026-11-02', [set('leg-press', 0, 60, 10)])
    const later = session('2026-11-09', [set('leg-press', 0, 90, 10)])
    const backDated = session('2026-11-05', [set('leg-press', 0, 70, 10)], { startedAt: Date.parse('2026-11-12T10:00:00') })
    expect(personalRecords([early, later, backDated], 'leg-press', backDated).bestWeight?.weight).toBe(60)
  })
})

describe('recordsBroken', () => {
  const history = [session('2026-11-02', [set('leg-press', 0, 60, 10), set('leg-press', 1, 60, 10)])] // 60 kg, 1200 kg

  it('returns a weight record when a done set is strictly heavier than every earlier session', () => {
    const today = session('2026-11-09', [set('leg-press', 0, 65, 8)], { finishedAt: null })
    expect(recordsBroken(today, history)).toEqual([{ exerciseId: 'leg-press', kind: 'weight', value: 65, reps: 8, previous: 60 }])
  })

  it('returns a volume record when the session volume for the exercise is strictly greater', () => {
    const today = session('2026-11-09', [set('leg-press', 0, 60, 12), set('leg-press', 1, 60, 12)]) // 1440
    expect(recordsBroken(today, history)).toEqual([{ exerciseId: 'leg-press', kind: 'volume', value: 1440, previous: 1200 }])
  })

  it('treats equal to the record as no record', () => {
    const today = session('2026-11-09', [set('leg-press', 0, 60, 10), set('leg-press', 1, 60, 10)])
    expect(recordsBroken(today, history)).toEqual([])
  })

  it('returns none for the first session with an exercise', () => {
    const today = session('2026-11-09', [set('leg-curl', 0, 40, 10)])
    expect(recordsBroken(today, history)).toEqual([])
  })

  it('ignores sets not done yet', () => {
    const today = session('2026-11-09', [set('leg-press', 0, 100, 10, false)], { finishedAt: null })
    expect(recordsBroken(today, history)).toEqual([])
  })

  it('compares a back-dated session only with the sessions dated before it', () => {
    const later = session('2026-11-20', [set('leg-press', 0, 90, 10)])
    const backDated = session('2026-11-10', [set('leg-press', 0, 70, 10)], { startedAt: Date.parse('2026-11-25T10:00:00') })
    expect(recordsBroken(backDated, [...history, later, backDated]).map(r => r.kind)).toEqual(['weight'])
  })
})

describe('record copy', () => {
  it('formats kilograms without a trailing ",0" and volumes with thousands separators', () => {
    expect(formatKg(65)).toBe('65')
    expect(formatKg(62.5)).toBe('62,5')
    expect(recordToast({ exerciseId: 'leg-press', kind: 'weight', value: 65, reps: 8, previous: 60 }, 'Prensa')).toBe('Nuevo récord: 65 kg en Prensa')
    expect(recordToast({ exerciseId: 'leg-press', kind: 'volume', value: 2400, previous: 2000 }, 'Prensa')).toBe('Nuevo récord de volumen: 2.400 kg en Prensa')
    expect(recordLine({ exerciseId: 'leg-press', kind: 'weight', value: 65, reps: 8, previous: 60 }, 'Prensa')).toBe('Prensa: 65 kg, nuevo mejor peso')
    expect(recordLine({ exerciseId: 'leg-press', kind: 'volume', value: 2400, previous: 2000 }, 'Prensa')).toBe('Prensa: 2.400 kg, nuevo mejor volumen')
  })
})
