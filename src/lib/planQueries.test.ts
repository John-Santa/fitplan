// Consultas del plan editable: reemplazan los helpers de plan.ts que leian la
// constante ROUTINES. Puro: sin React ni IndexedDB.
import { describe, expect, it } from 'vitest'
import type { PlanRoutine, PlanSlot, TrainingPlan } from '../types'
import { DEFAULT_PLAN, defaultPlanWithLegacy } from './defaultPlan'
import {
  activeRoutines,
  buildSessionSteps,
  dayTitleFor,
  findRoutine,
  groupLabel,
  nextWeekdayFor,
  planWeekStates,
  routineDaysLabel,
  routineForWeekday,
  routineSetCount,
  routineShortName,
  routineSlots,
  routineTitle,
  suggestRoutineIdFor,
  weekdaysForRoutine,
  weekLabel,
} from './planQueries'

const plan = defaultPlanWithLegacy()
const week = DEFAULT_PLAN.weekTemplate

describe('findRoutine / activeRoutines / routineTitle', () => {
  it('findRoutine incluye las archivadas; activeRoutines no', () => {
    expect(findRoutine(plan, 'dia1')?.archived).toBe(true)
    expect(activeRoutines(plan).map(r => r.id)).toEqual(['espalda-d1', 'espalda-d2', 'espalda-d3', 'espalda-d4', 'espalda-d5'])
    expect(findRoutine(plan, 'nada')).toBeUndefined()
  })

  it('routineTitle devuelve el nombre y, si el id no existe, "Rutina eliminada"', () => {
    expect(routineTitle(plan, 'espalda-d1')).toBe('Día 1 – Tren inferior A')
    expect(routineTitle(plan, 'dia1')).toBe('Día 1 — Pierna')
    expect(routineTitle(plan, 'borrada')).toBe('Rutina eliminada')
  })
})

describe('semana configurada', () => {
  it('routineForWeekday mapea lunes a viernes a los Dias 1 a 5 y el fin de semana a null', () => {
    expect(routineForWeekday(plan, week, 1)?.id).toBe('espalda-d1')
    expect(routineForWeekday(plan, week, 5)?.id).toBe('espalda-d5')
    expect(routineForWeekday(plan, week, 0)).toBeNull()
    expect(routineForWeekday(plan, week, 6)).toBeNull()
  })

  it('weekdaysForRoutine, nextWeekdayFor y routineDaysLabel leen la plantilla', () => {
    expect(weekdaysForRoutine(week, 'espalda-d3')).toEqual([3])
    expect(weekdaysForRoutine(week, 'dia1')).toEqual([])
    expect(nextWeekdayFor(week, 'espalda-d3', 1)).toBe(3)
    expect(nextWeekdayFor(week, 'espalda-d3', 4)).toBe(3)
    expect(nextWeekdayFor(week, 'dia1', 0)).toBeNull()
    expect(routineDaysLabel(week, 'espalda-d4')).toBe('Jueves')
    expect(routineDaysLabel(week, 'dia1')).toBe('Sin día asignado')
  })

  it('dayTitleFor usa el titulo, luego el nombre de la rutina del plan y luego la etiqueta del tipo', () => {
    expect(dayTitleFor(plan, week[1])).toBe('Día 1 – Tren inferior A')
    expect(dayTitleFor(plan, { kind: 'training', routineId: 'x', title: '', note: '' })).toBe('Entreno')
    expect(dayTitleFor(plan, { kind: 'training', routineId: 'x', title: 'Mi día', note: '' })).toBe('Mi día')
    expect(dayTitleFor(plan, { kind: 'rest', title: '', note: '' })).toBe('Descanso activo')
  })

  it('suggestRoutineIdFor propone una rutina activa sin dia y, si todas tienen, la primera', () => {
    const partial = [week[0], week[1], week[2], week[0], week[0], week[0], week[0]] as unknown as typeof week
    expect(suggestRoutineIdFor(plan, partial)).toBe('espalda-d3')
    expect(suggestRoutineIdFor(plan, week)).toBe('espalda-d1')
  })
})

describe('series por rutina', () => {
  const d1 = findRoutine(plan, 'espalda-d1')!

  it('routineSetCount cambia entre la semana 2 (tope de 2) y la 9 (4 en los dos primeros)', () => {
    expect(routineSetCount(plan, d1, 2)).toBe(14) // 7 ejercicios x 2
    expect(routineSetCount(plan, d1, 4)).toBe(21) // 7 x 3
    expect(routineSetCount(plan, d1, 9)).toBe(23) // 5 x 3 + 2 x 4
    expect(routineSetCount(plan, d1, 12)).toBe(14) // mitad redondeada hacia arriba: 7 x 2
  })

  it('routineSetCount excluye los items de solo nota', () => {
    const d3 = findRoutine(plan, 'espalda-d3')!
    const all = routineSlots(d3, 4)
    const notes = all.filter(s => s.target.kind === 'note').length
    expect(notes).toBeGreaterThan(0)
    const sum = all.filter(s => s.target.kind !== 'note').reduce((a, s) => a + s.sets, 0)
    expect(routineSetCount(plan, d3, 4)).toBe(sum)
  })

  it('routineSlots respeta weeks: pull-through hasta la semana 4 y peso muerto rumano desde la 5', () => {
    const d4 = findRoutine(plan, 'espalda-d4')!
    const ids = (w: number) => routineSlots(d4, w).map(s => s.exerciseId)
    const early = ids(3)
    const late = ids(6)
    expect(early).not.toEqual(late)
    expect(early.length).toBe(late.length)
  })
})

describe('textos del plan', () => {
  it('routineShortName corta tras la raya larga o corta', () => {
    expect(routineShortName({ name: 'Día 1 – Tren inferior A' })).toBe('Tren inferior A')
    expect(routineShortName({ name: 'Día 1 — Pierna' })).toBe('Pierna')
    expect(routineShortName({ name: 'Sin raya' })).toBe('Sin raya')
  })

  it('weekLabel dice "Semana N de 12" y tras el final "Plan completado"', () => {
    expect(weekLabel(12, 3)).toBe('Semana 3 de 12')
    expect(weekLabel(12, 12)).toBe('Semana 12 de 12')
    expect(weekLabel(12, 13)).toBe('Plan completado')
  })

  it('planWeekStates marca hechas, actual y proximas para todo el plan', () => {
    const states = planWeekStates(12, 3)
    expect(states).toHaveLength(12)
    expect(states.slice(0, 2).every(w => w.state === 'done')).toBe(true)
    expect(states[2]).toEqual({ week: 3, state: 'current' })
    expect(states[11].state).toBe('upcoming')
    expect(planWeekStates(12, 20).every(w => w.state === 'done')).toBe(true)
  })
})

describe('buildSessionSteps', () => {
  const d5 = findRoutine(plan, 'espalda-d5')!

  it('une los slots consecutivos con el mismo group en un solo paso', () => {
    const steps = buildSessionSteps(d5, 4)
    const grouped = steps.filter(s => s.group !== null)
    expect(grouped).toHaveLength(2)
    expect(grouped.every(s => s.slots.length === 2)).toBe(true)
    expect(steps).toHaveLength(8)
  })

  it('marca el primer paso de cada bloque y conserva el titulo del bloque', () => {
    const d3 = findRoutine(plan, 'espalda-d3')!
    const steps = buildSessionSteps(d3, 4)
    expect(steps.filter(s => s.firstInBlock)).toHaveLength(3)
    expect(steps[0].blockTitle).toContain('Bloque 1')
  })

  it('groupLabel: superserie de dos levantamientos, circuito con rondas si hay tiempo o sostenidos', () => {
    const lift = (id: string): PlanSlot => ({ id, exerciseId: 'x', sets: 2, target: { kind: 'reps', low: 12, high: 12 }, restSec: 60, note: '', group: 'g' })
    const hold = (id: string): PlanSlot => ({ id, exerciseId: 'y', sets: 2, target: { kind: 'time', lowSec: 20, highSec: 30 }, restSec: 30, note: '', group: 'g' })
    expect(groupLabel([lift('a'), lift('b')], 2)).toBe('Superserie')
    expect(groupLabel([lift('a'), hold('b')], 2)).toBe('Circuito · 2 rondas')
    expect(groupLabel([hold('a'), hold('b')], 1)).toBe('Circuito · 1 ronda')
  })
})

describe('plan sin rutinas activas', () => {
  it('suggestRoutineIdFor cae a la primera rutina aunque este archivada', () => {
    const r: PlanRoutine = { ...DEFAULT_PLAN.routines[0], archived: true }
    const onlyArchived = { ...DEFAULT_PLAN, routines: [r] } as TrainingPlan
    expect(suggestRoutineIdFor(onlyArchived, week)).toBe(r.id)
  })
})
