// Invariantes del plan por defecto ("espalda protegida") y de las rutinas
// anteriores archivadas.
import { describe, expect, it } from 'vitest'
import type { PlanRoutine, PlanSlot } from '../types'
import { DEFAULT_PLAN, LEGACY_ROUTINES, defaultPlanWithLegacy } from './defaultPlan'
import { EXERCISE_LIBRARY, libraryById } from './library'
import { ROUTINES } from './plan'

const allSlots = (r: PlanRoutine): PlanSlot[] => r.blocks.flatMap(b => b.slots)
const day = (n: number): PlanRoutine => DEFAULT_PLAN.routines[n - 1]
const slotAt = (n: number, i: number): PlanSlot => day(n).blocks[0].slots[i]

describe('DEFAULT_PLAN', () => {
  it('trae el nombre y las 12 semanas del plan', () => {
    expect(DEFAULT_PLAN.name).toBe('Plan de entrenamiento – 5 días (espalda protegida)')
    expect(DEFAULT_PLAN.weeks).toBe(12)
    expect(DEFAULT_PLAN.schemaVersion).toBe(1)
  })

  it('tiene 5 rutinas activas con ids espalda-d1..d5', () => {
    expect(DEFAULT_PLAN.routines).toHaveLength(5)
    expect(DEFAULT_PLAN.routines.map(r => r.id)).toEqual(['espalda-d1', 'espalda-d2', 'espalda-d3', 'espalda-d4', 'espalda-d5'])
    expect(DEFAULT_PLAN.routines.every(r => !r.archived && r.warmup)).toBe(true)
  })

  it('la semana mapea lunes a viernes a los dias 1-5 y sabado/domingo a descanso', () => {
    const w = DEFAULT_PLAN.weekTemplate
    for (let dow = 1; dow <= 5; dow++) {
      const d = w[dow]
      expect(d.kind).toBe('training')
      if (d.kind === 'training') expect(d.routineId).toBe(`espalda-d${dow}`)
    }
    for (const dow of [0, 6]) {
      expect(w[dow].kind).toBe('rest')
      expect(w[dow].title).toBe('')
      expect(w[dow].note).toBe('Descanso activo: tus 10.000 pasos')
    }
    expect(w[1].note).toBe('60 min')
    expect(w[3].note).toBe('45–50 min')
  })

  it('todo exerciseId de todo slot existe en la biblioteca', () => {
    for (const r of DEFAULT_PLAN.routines) {
      for (const s of allSlots(r)) expect(libraryById(s.exerciseId), `${r.id}/${s.id}`).toBeDefined()
    }
    for (const s of DEFAULT_PLAN.warmup.slots) expect(libraryById(s.exerciseId), s.id).toBeDefined()
    expect(EXERCISE_LIBRARY.length).toBeGreaterThan(0)
  })

  it('los ids de slot son unicos dentro de cada rutina', () => {
    for (const r of DEFAULT_PLAN.routines) {
      const ids = allSlots(r).map(s => s.id)
      expect(new Set(ids).size, r.id).toBe(ids.length)
    }
  })

  it('marca 2 ejercicios principales en los dias 1, 2, 4 y 5 y ninguno en el dia 3', () => {
    // Dia 4 #2 son dos variantes por rango de semanas: cuentan como una posicion.
    const positions = (r: PlanRoutine) => new Set(allSlots(r).filter(s => s.primary).map(s => (s.weeks ? 'variant' : s.id))).size
    expect(positions(day(1))).toBe(2)
    expect(positions(day(2))).toBe(2)
    expect(positions(day(4))).toBe(2)
    expect(positions(day(5))).toBe(2)
    expect(allSlots(day(3)).filter(s => s.primary)).toHaveLength(0)
  })

  it('el calentamiento tiene 7 items de 1 serie y el ultimo es una nota', () => {
    const w = DEFAULT_PLAN.warmup
    expect(w.title).toBe('Calentamiento fijo (10 min, antes de cada sesión)')
    expect(w.slots).toHaveLength(7)
    expect(w.slots.every(s => s.sets === 1)).toBe(true)
    expect(w.slots[6].target).toEqual({ kind: 'note' })
    expect(w.slots[4].target).toEqual({ kind: 'reps', low: 6, high: 6, perSide: true, holdSec: 5 })
  })

  it('Dia 1 #1 trae series, reps, descanso y claves tecnicas verbatim', () => {
    const s = slotAt(1, 0)
    expect(s.exerciseId).toBe('leg-press')
    expect(s.sets).toBe(3)
    expect(s.target).toEqual({ kind: 'reps', low: 10, high: 12 })
    expect(s.restSec).toBe(120)
    expect(s.note).toBe('Pies a media altura de la plataforma. Baja solo hasta antes de que la cola se despegue del respaldo; ese es tu rango.')
    expect(day(1).name).toBe('Día 1 – Tren inferior A')
    expect(day(1).focus).toBe('cuádriceps')
    expect(day(1).intro).toBe('Enfoque en cuádriceps y glúteo con la espalda apoyada o vertical, sin carga sobre los hombros.')
  })

  it('Dia 2 #8 es dead bug 3 x 8 por lado', () => {
    const s = slotAt(2, 7)
    expect(s.exerciseId).toBe('dead-bug')
    expect(s.target).toEqual({ kind: 'reps', low: 8, high: 8, perSide: true })
    expect(s.restSec).toBe(45)
  })

  it('Dia 3 tiene tres bloques; el cardio es 20-25 min con su texto como nota', () => {
    const d = day(3)
    expect(d.blocks.map(b => b.title)).toEqual([
      'Bloque 1 – Core ("Big 3" de McGill + cargadas), 20 min',
      'Bloque 2 – Cardio zona 2, 20–25 min',
      'Bloque 3 – Movilidad, 5–8 min',
    ])
    const cardio = d.blocks[1].slots
    expect(cardio).toHaveLength(1)
    expect(cardio[0].target).toEqual({ kind: 'time', lowSec: 1200, highSec: 1500 })
    expect(cardio[0].note.startsWith('Elíptica o caminadora inclinada (8–10 %, 5 km/h)')).toBe(true)
    expect(d.blocks[0].slots[0].target).toEqual({ kind: 'reps', low: 6, high: 6, holdSec: 10 })
    expect(d.blocks[0].slots[0].restSec).toBe(30)
    expect(d.blocks[0].slots[4].target).toEqual({ kind: 'distance', meters: 30, perSide: true })
    expect(d.blocks[2].slots).toHaveLength(4)
    expect(libraryById(d.blocks[2].slots[3].exerciseId)?.alternativeId).toBeDefined()
  })

  it('Dia 4 #2 son dos slots por rango de semanas, ambos principales', () => {
    const [pt, rdl] = day(4).blocks[0].slots.filter(s => s.weeks)
    expect(pt.exerciseId).toBe('cable-pull-through')
    expect(pt.weeks).toEqual({ from: 1, to: 4 })
    expect(rdl.exerciseId).toBe('romanian-deadlift-db')
    expect(rdl.weeks).toEqual({ from: 5 })
    expect(pt.primary && rdl.primary).toBe(true)
    expect(slotAt(4, 0).exerciseId).toBe('hip-thrust')
  })

  it('Dia 5 #7 es una superserie de dos slots con la misma nota; #8 son 2 rondas', () => {
    const slots = day(5).blocks[0].slots
    const ss = slots.filter(s => s.group === slots[6].group && s.group !== undefined)
    expect(ss).toHaveLength(2)
    expect(ss.every(s => s.sets === 2 && s.restSec === 60)).toBe(true)
    expect(ss[0].target).toEqual({ kind: 'reps', low: 12, high: 12 })
    expect(ss[0].note).toBe(ss[1].note)
    expect(ss[0].note).toBe('Tríceps: de espaldas a la polea, torso estable, sin arquear la zona baja.')
    const rounds = slots.slice(-2)
    expect(rounds[0].group).toBeDefined()
    expect(rounds[0].group).toBe(rounds[1].group)
    expect(rounds.every(s => s.sets === 2 && s.restSec === 30)).toBe(true)
  })

  it('las 5 fases copian la tabla de progresion y sus reglas', () => {
    const p = DEFAULT_PLAN.phases
    expect(p.map(x => [x.fromWeek, x.toWeek])).toEqual([[1, 2], [3, 6], [7, 7], [8, 11], [12, 12]])
    expect(p[0].sets).toBe('2 por ejercicio')
    expect(p[0].intensity).toBe('RIR 4 (bastante fácil)')
    expect(p.map(x => x.rule)).toEqual([
      { kind: 'cap', sets: 2 }, { kind: 'base' }, { kind: 'base' }, { kind: 'primaryBoost', sets: 4 }, { kind: 'half' },
    ])
    expect(p[2].loadNote).toBe('la mitad de peso')
  })

  it('trae los consejos del plan', () => {
    expect(DEFAULT_PLAN.tips).toContain('Si una semana solo puedes ir 4 días, quita el Día 3 y haz sus 3 ejercicios de core al final de las otras sesiones.')
  })
})

describe('LEGACY_ROUTINES', () => {
  it('estan archivadas y conservan ids de rutina y de ejercicio', () => {
    expect(LEGACY_ROUTINES.map(r => r.id)).toEqual(['dia1', 'dia2', 'dia3'])
    expect(LEGACY_ROUTINES.every(r => r.archived === true)).toBe(true)
    for (const legacy of ROUTINES) {
      const conv = LEGACY_ROUTINES.find(r => r.id === legacy.id)!
      expect(conv.blocks).toHaveLength(1)
      expect(conv.blocks[0].slots.map(s => s.exerciseId)).toEqual(legacy.exercises.map(e => e.id))
      expect(conv.name).toBe(legacy.name)
    }
  })

  it('defaultPlanWithLegacy agrega las anteriores al final sin mutar DEFAULT_PLAN', () => {
    const p = defaultPlanWithLegacy()
    expect(p.routines).toHaveLength(8)
    expect(p.routines.slice(5).every(r => r.archived)).toBe(true)
    expect(DEFAULT_PLAN.routines).toHaveLength(5)
    expect(p.customExercises).toEqual([])
    expect(p.customExercises).not.toBe(DEFAULT_PLAN.customExercises)
    p.routines[0].name = 'mutado'
    expect(DEFAULT_PLAN.routines[0].name).toBe('Día 1 – Tren inferior A')
  })
})
