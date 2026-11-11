// Pruebas del motor de fases de 12 semanas. Puro: sin React ni IndexedDB.
import { describe, expect, it } from 'vitest'
import type { Phase, PlanSlot, RoutineBlock, TrainingPlan } from '../types'
import { blockPhase } from './plan'
import { blockWeekNumber, formatTarget, phaseForWeek, setsForSlot, slotsForWeek } from './phases'

const phase = (fromWeek: number, toWeek: number, rule: Phase['rule']): Phase => ({
  fromWeek, toWeek, sets: '', intensity: '', goal: '', rule, loadNote: '',
})

const slot = (over: Partial<PlanSlot> = {}): PlanSlot => ({
  id: 's1', exerciseId: 'leg-press', sets: 3,
  target: { kind: 'reps', low: 10, high: 12 }, restSec: 120, note: '', ...over,
})

const plan = {
  phases: [
    phase(1, 2, { kind: 'cap', sets: 2 }),
    phase(3, 6, { kind: 'base' }),
    phase(7, 7, { kind: 'base' }),
    phase(8, 11, { kind: 'primaryBoost', sets: 4 }),
    phase(12, 12, { kind: 'half' }),
  ],
} as TrainingPlan

describe('blockWeekNumber', () => {
  it('cuenta desde 1 y avanza cada 7 dias', () => {
    expect(blockWeekNumber(new Date('2026-11-16T09:00:00'), '2026-11-16')).toBe(1)
    expect(blockWeekNumber(new Date('2026-11-22T23:00:00'), '2026-11-16')).toBe(1)
    expect(blockWeekNumber(new Date('2026-11-23T00:00:00'), '2026-11-16')).toBe(2)
  })

  it('una fecha anterior al inicio cae en la semana 1', () => {
    expect(blockWeekNumber(new Date('2026-11-01T00:00:00'), '2026-11-16')).toBe(1)
  })

  it('usa la misma cuenta de semanas que blockPhase (sin tope de 8)', () => {
    for (const d of ['2026-11-16', '2026-12-20', '2027-01-04']) {
      const today = new Date(d + 'T12:00:00')
      const w = blockWeekNumber(today, '2026-11-16')
      expect(Math.min(w, 8)).toBe(blockPhase(today, '2026-11-16').week)
    }
    expect(blockWeekNumber(new Date('2027-01-18T00:00:00'), '2026-11-16')).toBe(10)
  })
})

describe('phaseForWeek', () => {
  it.each([
    [1, 1], [2, 1], [3, 2], [6, 2], [7, 3], [8, 4], [11, 4], [12, 5],
  ])('semana %i cae en la fila %i de la tabla', (week, row) => {
    expect(phaseForWeek(plan, week)).toBe(plan.phases[row - 1])
  })

  it('antes del inicio (semana < 1) y despues de la 12 no hay fase', () => {
    expect(phaseForWeek(plan, 0)).toBeNull()
    expect(phaseForWeek(plan, 13)).toBeNull()
  })
})

describe('setsForSlot', () => {
  const base = slot({ sets: 3 })
  const main = slot({ sets: 3, primary: true })

  it('cap: nunca pasa del tope', () => {
    expect(setsForSlot(base, phase(1, 2, { kind: 'cap', sets: 2 }))).toBe(2)
    expect(setsForSlot(slot({ sets: 1 }), phase(1, 2, { kind: 'cap', sets: 2 }))).toBe(1)
  })

  it('base: respeta las series del slot', () => {
    expect(setsForSlot(base, phase(3, 6, { kind: 'base' }))).toBe(3)
  })

  it('primaryBoost: sube solo los principales', () => {
    const rule = { kind: 'primaryBoost', sets: 4 } as const
    expect(setsForSlot(main, phase(8, 11, rule))).toBe(4)
    expect(setsForSlot(base, phase(8, 11, rule))).toBe(3)
    expect(setsForSlot(slot({ sets: 5, primary: true }), phase(8, 11, rule))).toBe(5)
  })

  it('half: la mitad redondeada hacia arriba, minimo 1', () => {
    const p = phase(12, 12, { kind: 'half' })
    expect(setsForSlot(slot({ sets: 3 }), p)).toBe(2)
    expect(setsForSlot(slot({ sets: 2 }), p)).toBe(1)
    expect(setsForSlot(slot({ sets: 1 }), p)).toBe(1)
  })

  it('sin fase devuelve las series del slot', () => {
    expect(setsForSlot(base, null)).toBe(3)
  })
})

describe('slotsForWeek', () => {
  const pullThrough = slot({ id: 'pt', exerciseId: 'cable-pull-through', weeks: { from: 1, to: 4 } })
  const rdl = slot({ id: 'rdl', exerciseId: 'dumbbell-romanian-deadlift', weeks: { from: 5 } })
  const always = slot({ id: 'a' })
  const block: RoutineBlock = { id: 'b', title: '', note: '', slots: [pullThrough, rdl, always] }

  it('incluye el pull-through en la semana 4 y no el rumano', () => {
    expect(slotsForWeek(block, 4).map(s => s.id)).toEqual(['pt', 'a'])
  })

  it('incluye el rumano desde la semana 5 y no el pull-through', () => {
    expect(slotsForWeek(block, 5).map(s => s.id)).toEqual(['rdl', 'a'])
    expect(slotsForWeek(block, 12).map(s => s.id)).toEqual(['rdl', 'a'])
  })

  it('un slot sin weeks aparece siempre', () => {
    expect(slotsForWeek(block, 1).map(s => s.id)).toContain('a')
  })
})

describe('formatTarget', () => {
  it('repeticiones', () => {
    expect(formatTarget({ kind: 'reps', low: 10, high: 12 })).toBe('10–12')
    expect(formatTarget({ kind: 'reps', low: 15, high: 15 })).toBe('15')
  })

  it('por lado / por pierna', () => {
    expect(formatTarget({ kind: 'reps', low: 8, high: 10, perSide: true, sideUnit: 'pierna' })).toBe('8–10 por pierna')
    expect(formatTarget({ kind: 'reps', low: 8, high: 10, perSide: true })).toBe('8–10 por lado')
  })

  it('repeticiones con sostenido', () => {
    expect(formatTarget({ kind: 'reps', low: 6, high: 6, holdSec: 10 })).toBe('6 × 10 s')
    expect(formatTarget({ kind: 'reps', low: 6, high: 6, perSide: true, holdSec: 8 })).toBe('6 × 8 s por lado')
  })

  it('tiempo', () => {
    expect(formatTarget({ kind: 'time', lowSec: 20, highSec: 30, perSide: true })).toBe('20–30 s por lado')
    expect(formatTarget({ kind: 'time', lowSec: 45, highSec: 45 })).toBe('45 s')
  })

  it('distancia', () => {
    expect(formatTarget({ kind: 'distance', meters: 30, perSide: true })).toBe('30 m por lado')
  })

  it('nota', () => {
    expect(formatTarget({ kind: 'note' })).toBe('')
  })
})
