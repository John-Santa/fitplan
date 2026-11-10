// El editor de rutinas anterior al plan editable (PR #1) guardaba en
// config.routineExercises la lista completa de ejercicios de cada rutina
// dia1..dia3, con ejercicios propios de id `custom-…`. Al migrar al plan esas
// listas no se pierden: viven en las rutinas archivadas y los ejercicios
// propios pasan a plan.customExercises, para que el historial los nombre.
import { describe, expect, it } from 'vitest'
import type { Exercise } from '../types'
import { defaultPlanWithLegacy } from './defaultPlan'
import { addLegacyCustomExercises, applyLegacyRoutineExercises } from './legacyRoutines'
import { resolveExercise } from './library'

const bulgara: Exercise = {
  id: 'custom-abc123', name: 'Sentadilla búlgara', sets: 4, repsLow: 8, repsHigh: 10, restSec: 120,
  cue: 'Pie de atrás en el banco.', mwSlug: '',
}
const prensa: Exercise = {
  id: 'leg-press', name: 'Prensa de piernas 45°', sets: 5, repsLow: 6, repsHigh: 8, restSec: 150,
  cue: 'Cue propio', mwSlug: 'machine-leg-press', main: true,
}
const dia1 = (p: ReturnType<typeof defaultPlanWithLegacy>) => p.routines.find(r => r.id === 'dia1')!

describe('applyLegacyRoutineExercises', () => {
  it('la rutina archivada toma la lista personalizada, en su orden y con su prescripcion', () => {
    const next = applyLegacyRoutineExercises(defaultPlanWithLegacy(), { dia1: [bulgara, prensa] })
    const slots = dia1(next).blocks.flatMap(b => b.slots)
    expect(slots.map(s => s.exerciseId)).toEqual(['custom-abc123', 'leg-press'])
    expect(slots[1]).toMatchObject({ sets: 5, restSec: 150, note: 'Cue propio', primary: true, target: { kind: 'reps', low: 6, high: 8 } })
    expect(dia1(next).archived).toBe(true)
  })

  it('los ejercicios propios pasan a customExercises con su nombre y slug', () => {
    const next = applyLegacyRoutineExercises(defaultPlanWithLegacy(), { dia1: [bulgara, prensa] })
    expect(resolveExercise(next, 'custom-abc123')).toMatchObject({ name: 'Sentadilla búlgara', custom: true, musclewiki: { slug: null, id: null } })
    // Un ejercicio de la biblioteca no se duplica como propio.
    expect(next.customExercises.map(e => e.id)).toEqual(['custom-abc123'])
  })

  it('una rutina sin personalizar queda como estaba', () => {
    const base = defaultPlanWithLegacy()
    const next = applyLegacyRoutineExercises(base, { dia1: [bulgara] })
    expect(next.routines.find(r => r.id === 'dia2')).toEqual(base.routines.find(r => r.id === 'dia2'))
  })

  it('sin personalizaciones devuelve el mismo plan y nunca muta la entrada', () => {
    const base = defaultPlanWithLegacy()
    expect(applyLegacyRoutineExercises(base, {})).toBe(base)
    const snap = structuredClone(base)
    applyLegacyRoutineExercises(base, { dia1: [bulgara] })
    expect(base).toEqual(snap)
  })
})

describe('addLegacyCustomExercises', () => {
  it('agrega solo los ejercicios propios que el plan no conoce', () => {
    const base = applyLegacyRoutineExercises(defaultPlanWithLegacy(), { dia1: [bulgara] })
    const otro: Exercise = { ...bulgara, id: 'custom-zzz', name: 'Remo con banda' }
    const next = addLegacyCustomExercises(base, { dia1: [bulgara, prensa], dia2: [otro] })
    expect(next.customExercises.map(e => e.id)).toEqual(['custom-abc123', 'custom-zzz'])
    // No toca las rutinas.
    expect(next.routines).toEqual(base.routines)
  })

  it('si no falta ninguno devuelve el mismo plan', () => {
    const base = applyLegacyRoutineExercises(defaultPlanWithLegacy(), { dia1: [bulgara] })
    expect(addLegacyCustomExercises(base, { dia1: [bulgara] })).toBe(base)
  })
})

describe('lectura del plan migrado', () => {
  it('normalizePlan conserva las rutinas personalizadas y los ejercicios propios (ida y vuelta)', async () => {
    const { normalizePlan } = await import('./planStorage')
    const migrated = applyLegacyRoutineExercises(defaultPlanWithLegacy(), { dia1: [bulgara, prensa] })
    expect(normalizePlan(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated)
  })
})
