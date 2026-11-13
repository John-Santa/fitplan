// Semaforo de dolor del plan (regla de oro 5): se muestra con texto, no solo color.
import { describe, expect, it } from 'vitest'
import { PAIN_MAX, isPainValue, painByExerciseWeek, painVerdict } from './pain'
import type { Session, StrengthSession } from './types'

describe('painVerdict', () => {
  it.each([
    [0, 'ok', 'Bien'],
    [2, 'ok', 'Bien'],
    [3, 'adjust', 'Baja peso o rango'],
    [5, 'adjust', 'Baja peso o rango'],
    [6, 'change', 'Cambia el ejercicio'],
    [10, 'change', 'Cambia el ejercicio'],
  ] as const)('dolor %i es nivel %s: "%s"', (value, level, label) => {
    const v = painVerdict(value)
    expect(v.level).toBe(level)
    expect(v.label).toBe(label)
    expect(v.detail.length).toBeGreaterThan(0)
  })
})

describe('isPainValue', () => {
  it('acepta enteros de 0 a 10 y rechaza el resto', () => {
    expect(PAIN_MAX).toBe(10)
    expect(isPainValue(0)).toBe(true)
    expect(isPainValue(10)).toBe(true)
    expect(isPainValue(11)).toBe(false)
    expect(isPainValue(-1)).toBe(false)
    expect(isPainValue(2.5)).toBe(false)
    expect(isPainValue('3')).toBe(false)
  })
})

const strength = (date: string, pain?: Record<string, number>, over: Partial<StrengthSession> = {}): StrengthSession => ({
  id: `s-${date}-${Math.random()}`, kind: 'strength', routineId: 'r1', date, startedAt: 1, finishedAt: 2, notes: '', sets: [], pain, ...over,
})

describe('painByExerciseWeek', () => {
  it('uses the max pain of the calendar week (Monday) for one exercise', () => {
    const sessions: Session[] = [strength('2026-11-17', { squat: 2 }), strength('2026-11-19', { squat: 4 })]
    expect(painByExerciseWeek(sessions)).toEqual([{ exerciseId: 'squat', weeks: [{ monday: '2026-11-16', max: 4 }] }])
  })

  it('lists weeks newest first and splits Sunday from the next Monday', () => {
    const sessions: Session[] = [strength('2026-11-22', { squat: 3 }), strength('2026-11-23', { squat: 6 })]
    expect(painByExerciseWeek(sessions)[0].weeks).toEqual([
      { monday: '2026-11-23', max: 6 },
      { monday: '2026-11-16', max: 3 },
    ])
  })

  it('omits exercises without pain and ignores invalid values and non-strength sessions', () => {
    const swim = { id: 'w', kind: 'swim', date: '2026-11-17', startedAt: 1, finishedAt: 2, notes: '' } as unknown as Session
    const sessions: Session[] = [strength('2026-11-17'), strength('2026-11-17', { a: 11, b: -1, c: 2.5 }), swim]
    expect(painByExerciseWeek(sessions)).toEqual([])
  })

  it('keeps pain of 0 (recorded, no pain) and sorts exercises by id', () => {
    const out = painByExerciseWeek([strength('2026-11-17', { b: 0, a: 5 })])
    expect(out.map(e => e.exerciseId)).toEqual(['a', 'b'])
    expect(out[1].weeks).toEqual([{ monday: '2026-11-16', max: 0 }])
  })
})
