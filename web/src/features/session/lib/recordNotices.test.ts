import { describe, expect, it } from 'vitest'
import type { SetLog, StrengthSession } from '../../../lib/types'
import { recordNotices } from './recordNotices'

const set = (setIndex: number, weight: number, reps: number, done = true): SetLog => ({
  exerciseId: 'leg-press', setIndex, weight, reps, done,
})

const session = (id: string, date: string, sets: SetLog[], finished = true): StrengthSession => ({
  id,
  kind: 'strength',
  routineId: 'espalda-d1',
  date,
  startedAt: Date.parse(date + 'T10:00:00'),
  finishedAt: finished ? Date.parse(date + 'T11:00:00') : null,
  notes: '',
  sets,
})

// Earlier best: 60 kg, 1800 kg of volume (3 × 60 × 10).
const history = [session('h', '2026-11-02', [set(0, 60, 10), set(1, 60, 10), set(2, 60, 10)])]
const slots = [{ exerciseId: 'leg-press', name: 'Prensa', target: 3 }]

describe('recordNotices', () => {
  it('announces a weight record as soon as the set that beats it is done', () => {
    const live = session('live', '2026-11-09', [set(0, 65, 10), set(1, 0, 0, false)], false)
    expect(recordNotices(live, history, slots, new Set())).toEqual([
      { key: 'leg-press:weight:65', text: 'Nuevo récord: 65 kg en Prensa' },
    ])
  })

  it('waits for the last set of the exercise before announcing a volume record', () => {
    const two = session('live', '2026-11-09', [set(0, 60, 12), set(1, 60, 12)], false) // 1440, 2 of 3
    expect(recordNotices(two, history, slots, new Set())).toEqual([])
    const three = session('live', '2026-11-09', [set(0, 60, 12), set(1, 60, 12), set(2, 60, 12)], false) // 2160
    expect(recordNotices(three, history, slots, new Set())).toEqual([
      { key: 'leg-press:volume:2160', text: 'Nuevo récord de volumen: 2.160 kg en Prensa' },
    ])
  })

  it('skips records already announced', () => {
    const live = session('live', '2026-11-09', [set(0, 65, 10)], false)
    expect(recordNotices(live, history, slots, new Set(['leg-press:weight:65']))).toEqual([])
  })

  it('announces nothing the first time an exercise is done', () => {
    const live = session('live', '2026-11-09', [set(0, 65, 10), set(1, 65, 10), set(2, 65, 10)], false)
    expect(recordNotices(live, [], slots, new Set())).toEqual([])
  })
})
