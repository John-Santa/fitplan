// suggestLoad derives today's load for a set from the previous session and the
// week's phase; nothing is stored, so no persisted shape depends on it.
import { describe, expect, it } from 'vitest'
import type { Phase, PlanSlot, SetLog } from './types'
import { DEFAULT_PLAN } from './defaultPlan'
import { phaseForWeek } from './phases'
import { fmtKg, isHalfWeightPhase, suggestLoad } from './load'

const slot = (target: PlanSlot['target']): PlanSlot => ({ id: 's1', exerciseId: 'squat', sets: 3, target, restSec: 60, note: '' })
const reps = slot({ kind: 'reps', low: 10, high: 12 })
const prevSet = (setIndex: number, weight: number | null, repCount: number | null): SetLog => ({
  exerciseId: 'squat', setIndex, weight, reps: repCount, done: true,
})
const threeAt = (weight: number, repCount: number) => [0, 1, 2].map(i => prevSet(i, weight, repCount))

const base = phaseForWeek(DEFAULT_PLAN, 4) as Phase
const deload = phaseForWeek(DEFAULT_PLAN, 7) as Phase

describe('suggestLoad', () => {
  it('suggests one plate more when every expected set reached the top of the range', () => {
    expect(suggestLoad(threeAt(60, 12), 0, reps, 3, base)).toEqual({ weight: 62.5, reason: 'progress', text: 'Sube una placa' })
  })

  it('keeps the previous weight when the top of the range was not reached', () => {
    expect(suggestLoad(threeAt(60, 10), 0, reps, 3, base)).toEqual({ weight: 60, reason: 'same', text: 'Mismo peso, suma repeticiones' })
  })

  it('halves the previous weight in a phase whose load note says "la mitad de peso"', () => {
    expect(suggestLoad(threeAt(60, 10), 0, reps, 3, deload)).toEqual({
      weight: 30, reason: 'deload', text: 'Semana de descarga: la mitad de peso',
    })
  })

  it('lets the deload win over progression and rounds the half to a plate', () => {
    expect(suggestLoad(threeAt(60, 12), 1, reps, 3, deload)?.weight).toBe(30)
    expect(suggestLoad(threeAt(62.5, 10), 0, reps, 3, deload)?.weight).toBe(32.5)
  })

  it('suggests per set index and falls back to the last previous set when there were fewer', () => {
    const prev = [prevSet(0, 60, 10), prevSet(1, 65, 10)]
    expect(suggestLoad(prev, 1, reps, 2, base)?.weight).toBe(65)
    expect(suggestLoad(prev, 4, reps, 2, base)?.weight).toBe(65)
  })

  it('does not progress when the previous session had fewer sets than today expects', () => {
    expect(suggestLoad([prevSet(0, 60, 12), prevSet(1, 60, 12)], 0, reps, 3, base)?.reason).toBe('same')
  })

  it('has no suggestion on the first time or without a previous weight, and works without a phase', () => {
    expect(suggestLoad([], 0, reps, 3, base)).toBeNull()
    expect(suggestLoad([prevSet(0, null, 10)], 0, reps, 3, base)).toBeNull()
    expect(suggestLoad(threeAt(60, 10), 0, reps, 3, null)?.weight).toBe(60)
  })

  it('has no suggestion for time, distance and note targets', () => {
    const prev = threeAt(60, 10)
    expect(suggestLoad(prev, 0, slot({ kind: 'time', lowSec: 20, highSec: 30 }), 3, base)).toBeNull()
    expect(suggestLoad(prev, 0, slot({ kind: 'distance', meters: 30 }), 3, base)).toBeNull()
    expect(suggestLoad(prev, 0, slot({ kind: 'note' }), 3, base)).toBeNull()
  })
})

describe('isHalfWeightPhase', () => {
  it('matches the template phase text and nothing else', () => {
    expect(isHalfWeightPhase(deload)).toBe(true)
    expect(isHalfWeightPhase(base)).toBe(false)
    expect(isHalfWeightPhase(null)).toBe(false)
  })
})

describe('fmtKg', () => {
  it('prints a weight with a decimal comma only when it has a fraction', () => {
    expect(fmtKg(60)).toBe('60')
    expect(fmtKg(62.5)).toBe('62,5')
    expect(fmtKg(null)).toBe('—')
  })
})
