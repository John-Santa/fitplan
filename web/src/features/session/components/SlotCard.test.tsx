// completionPatch is what "Completar serie" and "Completar ejercicio" log; refFor
// is the previous-session reference for a set index.
import { describe, expect, it } from 'vitest'
import type { PlanSlot, SetLog } from '../../../lib/types'
import { completionPatch, refFor } from './SlotCard'

const slot = (target: PlanSlot['target']): PlanSlot => ({ id: 's1', exerciseId: 'squat', sets: 3, target, restSec: 60, note: '' })
const reps = slot({ kind: 'reps', low: 10, high: 12 })
const log = (weight: number | null, reps: number | null): SetLog => ({ exerciseId: 'squat', setIndex: 0, weight, reps, done: false })

describe('completionPatch', () => {
  it('logs typed weight and reps for a reps target', () => {
    expect(completionPatch(reps, log(55, 9), log(60, 10))).toEqual({ done: true, weight: 55, reps: 9 })
  })

  it('falls back to the previous session weight and the top of the range when nothing was typed', () => {
    expect(completionPatch(reps, undefined, log(60, 10))).toEqual({ done: true, weight: 60, reps: 12 })
  })

  it('logs no weight when there is neither a typed weight nor a reference', () => {
    expect(completionPatch(reps, undefined, undefined)).toEqual({ done: true, weight: null, reps: 12 })
  })

  it('logs the typed or minimum seconds for a time target', () => {
    const t = slot({ kind: 'time', lowSec: 20, highSec: 30 })
    expect(completionPatch(t, undefined, undefined)).toEqual({ done: true, durationSec: 20 })
    expect(completionPatch(t, { ...log(null, null), durationSec: 28 }, undefined)).toEqual({ done: true, durationSec: 28 })
  })

  it('logs the target metres for a distance target and only done for a note', () => {
    expect(completionPatch(slot({ kind: 'distance', meters: 30 }), undefined, undefined)).toEqual({ done: true, distanceM: 30 })
    expect(completionPatch(slot({ kind: 'note' }), undefined, undefined)).toEqual({ done: true })
  })
})

describe('refFor', () => {
  const prev = { session: {} as never, sets: [log(60, 12), { ...log(62.5, 10), setIndex: 1 }] }

  it('returns the previous set at the same index and falls back to the last set', () => {
    expect(refFor(prev, 1)?.weight).toBe(62.5)
    expect(refFor(prev, 5)?.weight).toBe(62.5)
    expect(refFor(null, 0)).toBeUndefined()
  })
})
