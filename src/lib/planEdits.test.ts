// Operaciones puras de edicion del plan: nunca mutan la entrada y nunca
// cambian el exerciseId de un slot existente salvo swapExercise.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrainingPlan } from '../types'
import { DEFAULT_PLAN } from './defaultPlan'
import {
  addCustomExercise, addRoutine, addSlot, archiveRoutine, moveSlot, removeSlot, renameRoutine,
  resetToTemplate, restoreRoutine, routineExerciseIds, swapExercise, updateSlot,
} from './planEdits'

const base = (): TrainingPlan => structuredClone(DEFAULT_PLAN)
const R = 'espalda-d1'
const blockOf = (p: TrainingPlan, rid = R) => p.routines.find(r => r.id === rid)!.blocks[0]
const slotIds = (p: TrainingPlan, rid = R) => blockOf(p, rid).slots.map(s => s.id)

afterEach(() => vi.useRealTimers())

describe('renameRoutine', () => {
  it('cambia solo los campos dados', () => {
    const p = base()
    const next = renameRoutine(p, R, { name: 'Pierna A', duration: '45 min' })
    const r = next.routines.find(x => x.id === R)!
    expect(r.name).toBe('Pierna A')
    expect(r.duration).toBe('45 min')
    expect(r.focus).toBe(p.routines[0].focus)
    expect(r.intro).toBe(p.routines[0].intro)
  })
  it('no muta la entrada', () => {
    const p = base()
    const snap = structuredClone(p)
    renameRoutine(p, R, { name: 'X', focus: 'Y', intro: 'Z' })
    expect(p).toEqual(snap)
  })
  it('un nombre vacio se rechaza y el plan queda igual', () => {
    const p = base()
    expect(renameRoutine(p, R, { name: '   ' })).toBe(p)
  })
  it('una rutina desconocida deja el plan igual', () => {
    const p = base()
    expect(renameRoutine(p, 'nope', { name: 'X' })).toBe(p)
  })
})

describe('addSlot', () => {
  it('agrega al final con la prescripcion por defecto de fuerza', () => {
    const p = base()
    const next = addSlot(p, R, blockOf(p).id, 'chest-press')
    const s = blockOf(next).slots.at(-1)!
    expect(blockOf(next).slots).toHaveLength(blockOf(p).slots.length + 1)
    expect(s).toMatchObject({ exerciseId: 'chest-press', sets: 3, restSec: 90, target: { kind: 'reps', low: 10, high: 12 } })
  })
  it('core: 3 x 10 con 45 s de descanso', () => {
    const p = base()
    const s = blockOf(addSlot(p, R, blockOf(p).id, 'glute-bridge')).slots.at(-1)!
    expect(s).toMatchObject({ sets: 3, restSec: 45, target: { kind: 'reps', low: 10, high: 10 } })
  })
  it('movilidad: 1 x 30 s sin descanso', () => {
    const p = base()
    const s = blockOf(addSlot(p, R, blockOf(p).id, 'cat-camel')).slots.at(-1)!
    expect(s).toMatchObject({ sets: 1, restSec: 0, target: { kind: 'time', lowSec: 30, highSec: 30 } })
  })
  it('cardio: 1 x 20-25 min', () => {
    const p = base()
    const s = blockOf(addSlot(p, R, blockOf(p).id, 'zone2-cardio')).slots.at(-1)!
    expect(s).toMatchObject({ sets: 1, restSec: 0, target: { kind: 'time', lowSec: 1200, highSec: 1500 } })
  })
  it('inserta en el indice dado', () => {
    const p = base()
    const next = addSlot(p, R, blockOf(p).id, 'leg-press', 0)
    expect(blockOf(next).slots[0].exerciseId).toBe('leg-press')
  })
  it('el id del slot es unico dentro de la rutina aun al repetir el ejercicio', () => {
    let p = base()
    const bid = blockOf(p).id
    p = addSlot(p, R, bid, 'leg-press')
    p = addSlot(p, R, bid, 'leg-press')
    const ids = p.routines.find(r => r.id === R)!.blocks.flatMap(b => b.slots.map(s => s.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('un ejercicio propio usa los valores por defecto de su categoria', () => {
    let p = addCustomExercise(base(), { name: 'Estiramiento mio', category: 'mobility', primaryMuscles: ['Cuello'] })
    const id = p.customExercises[0].id
    p = addSlot(p, R, blockOf(p).id, id)
    expect(blockOf(p).slots.at(-1)).toMatchObject({ exerciseId: id, target: { kind: 'time' } })
  })
  it('un ejercicio desconocido deja el plan igual', () => {
    const p = base()
    expect(addSlot(p, R, blockOf(p).id, 'no-existe')).toBe(p)
  })
  it('no muta la entrada', () => {
    const p = base()
    const snap = structuredClone(p)
    addSlot(p, R, blockOf(p).id, 'leg-press', 1)
    expect(p).toEqual(snap)
  })
})

describe('removeSlot', () => {
  it('quita solo ese slot', () => {
    const p = base()
    const [first, ...rest] = slotIds(p)
    expect(slotIds(removeSlot(p, R, blockOf(p).id, first))).toEqual(rest)
  })
  it('no muta la entrada', () => {
    const p = base()
    const snap = structuredClone(p)
    removeSlot(p, R, blockOf(p).id, slotIds(p)[0])
    expect(p).toEqual(snap)
  })
  it('un slot desconocido deja el plan igual', () => {
    const p = base()
    expect(removeSlot(p, R, blockOf(p).id, 'nope')).toBe(p)
  })
})

describe('moveSlot', () => {
  it('baja un slot una posicion', () => {
    const p = base()
    const [a, b, ...rest] = slotIds(p)
    expect(slotIds(moveSlot(p, R, blockOf(p).id, a, 1))).toEqual([b, a, ...rest])
  })
  it('sube un slot una posicion', () => {
    const p = base()
    const [a, b, ...rest] = slotIds(p)
    expect(slotIds(moveSlot(p, R, blockOf(p).id, b, -1))).toEqual([b, a, ...rest])
  })
  it('en los bordes no hace nada', () => {
    const p = base()
    const ids = slotIds(p)
    expect(moveSlot(p, R, blockOf(p).id, ids[0], -1)).toBe(p)
    expect(moveSlot(p, R, blockOf(p).id, ids.at(-1)!, 1)).toBe(p)
  })
  it('no muta la entrada', () => {
    const p = base()
    const snap = structuredClone(p)
    moveSlot(p, R, blockOf(p).id, slotIds(p)[0], 1)
    expect(p).toEqual(snap)
  })
})

describe('updateSlot', () => {
  const first = (p: TrainingPlan) => blockOf(p).slots[0]
  it('aplica un parche valido y no devuelve error', () => {
    const p = base()
    const { plan, error } = updateSlot(p, R, blockOf(p).id, first(p).id, {
      sets: 4, restSec: 120, note: 'Nota nueva', primary: false, target: { kind: 'reps', low: 8, high: 10 },
    })
    expect(error).toBeNull()
    expect(first(plan)).toMatchObject({ sets: 4, restSec: 120, note: 'Nota nueva', primary: false, target: { kind: 'reps', low: 8, high: 10 } })
  })
  it('rechaza low > high con error y el plan queda igual', () => {
    const p = base()
    const r = updateSlot(p, R, blockOf(p).id, first(p).id, { target: { kind: 'reps', low: 12, high: 8 } })
    expect(r.error).toMatch(/.+/)
    expect(r.plan).toBe(p)
  })
  it('rechaza 0 series', () => {
    const p = base()
    const r = updateSlot(p, R, blockOf(p).id, first(p).id, { sets: 0 })
    expect(r.error).toMatch(/.+/)
    expect(r.plan).toBe(p)
  })
  it('rechaza series fuera de 1..10 o no enteras', () => {
    const p = base()
    for (const sets of [11, 2.5, Number.NaN]) {
      expect(updateSlot(p, R, blockOf(p).id, first(p).id, { sets }).error).toMatch(/.+/)
    }
  })
  it('rechaza numeros no finitos o no positivos en el objetivo', () => {
    const p = base()
    const bad = [
      { kind: 'reps', low: 0, high: 5 },
      { kind: 'reps', low: 5, high: Number.POSITIVE_INFINITY },
      { kind: 'time', lowSec: 40, highSec: 20 },
      { kind: 'time', lowSec: -1, highSec: 20 },
      { kind: 'distance', meters: 0 },
      { kind: 'reps', low: 5, high: 6, holdSec: 0 },
    ] as const
    for (const target of bad) {
      const r = updateSlot(p, R, blockOf(p).id, first(p).id, { target })
      expect(r.error).toMatch(/.+/)
      expect(r.plan).toBe(p)
    }
  })
  it('acepta descanso 0 pero rechaza negativo', () => {
    const p = base()
    expect(updateSlot(p, R, blockOf(p).id, first(p).id, { restSec: 0 }).error).toBeNull()
    expect(updateSlot(p, R, blockOf(p).id, first(p).id, { restSec: -5 }).error).toMatch(/.+/)
  })
  it('no cambia el exerciseId', () => {
    const p = base()
    const { plan } = updateSlot(p, R, blockOf(p).id, first(p).id, { sets: 2 })
    expect(first(plan).exerciseId).toBe(first(p).exerciseId)
  })
  it('no muta la entrada', () => {
    const p = base()
    const snap = structuredClone(p)
    updateSlot(p, R, blockOf(p).id, first(p).id, { sets: 5 })
    updateSlot(p, R, blockOf(p).id, first(p).id, { sets: 0 })
    expect(p).toEqual(snap)
  })
})

describe('swapExercise', () => {
  it('cambia el ejercicio y conserva series, objetivo y descanso', () => {
    const p = base()
    const before = blockOf(p).slots[0]
    const next = swapExercise(p, R, blockOf(p).id, before.id, 'single-leg-press')
    const after = blockOf(next).slots[0]
    expect(after.exerciseId).toBe('single-leg-press')
    expect(after.id).toBe(before.id)
    expect(after.sets).toBe(before.sets)
    expect(after.target).toEqual(before.target)
    expect(after.restSec).toBe(before.restSec)
  })
  it('descarta la etiqueta del slot: otro ejercicio no hereda el nombre anterior', () => {
    const p = base()
    const slot = blockOf(p).slots[0]
    slot.label = 'Nombre propio'
    const next = swapExercise(p, R, blockOf(p).id, slot.id, 'single-leg-press')
    expect(blockOf(next).slots[0]).not.toHaveProperty('label')
  })
  it('un ejercicio desconocido deja el plan igual', () => {
    const p = base()
    expect(swapExercise(p, R, blockOf(p).id, blockOf(p).slots[0].id, 'no-existe')).toBe(p)
  })
  it('no muta la entrada', () => {
    const p = base()
    const snap = structuredClone(p)
    swapExercise(p, R, blockOf(p).id, blockOf(p).slots[0].id, 'leg-extension')
    expect(p).toEqual(snap)
  })
})

describe('el exerciseId es llave de historial', () => {
  it('ninguna operacion salvo swapExercise cambia el exerciseId de un slot existente', () => {
    const p = base()
    const bid = blockOf(p).id
    const ids = new Map(blockOf(p).slots.map(s => [s.id, s.exerciseId]))
    let next = renameRoutine(p, R, { name: 'Otra' })
    next = addSlot(next, R, bid, 'leg-press', 0)
    next = moveSlot(next, R, bid, blockOf(next).slots[2].id, -1)
    next = updateSlot(next, R, bid, blockOf(next).slots[1].id, { sets: 5 }).plan
    next = archiveRoutine(next, R)
    next = restoreRoutine(next, R)
    for (const s of blockOf(next).slots) {
      if (ids.has(s.id)) expect(s.exerciseId).toBe(ids.get(s.id))
    }
  })
})

describe('addRoutine', () => {
  it('crea una rutina vacia con un bloque "Ejercicios" y calentamiento', () => {
    const next = addRoutine(base(), 'Hombros')
    const r = next.routines.at(-1)!
    expect(r.name).toBe('Hombros')
    expect(r.id).toMatch(/^custom-[0-9a-z]+-\d+$/)
    expect(r.warmup).toBe(true)
    expect(r.archived).toBeFalsy()
    expect(r.blocks).toHaveLength(1)
    expect(r.blocks[0]).toMatchObject({ title: 'Ejercicios', slots: [] })
  })
  it('ids unicos en dos llamadas del mismo milisegundo', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-16T10:00:00Z'))
    const next = addRoutine(addRoutine(base(), 'A'), 'B')
    const ids = next.routines.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(next.routines.slice(-2).map(r => r.name)).toEqual(['A', 'B'])
  })
  it('no muta la entrada', () => {
    const p = base()
    const snap = structuredClone(p)
    addRoutine(p, 'X')
    expect(p).toEqual(snap)
  })
})

describe('archiveRoutine / restoreRoutine', () => {
  it('archivar conserva la rutina y sus slots', () => {
    const p = base()
    const next = archiveRoutine(p, R)
    const r = next.routines.find(x => x.id === R)!
    expect(next.routines).toHaveLength(p.routines.length)
    expect(r.archived).toBe(true)
    expect(r.blocks).toEqual(p.routines[0].blocks)
  })
  it('restaurar la deja activa', () => {
    const next = restoreRoutine(archiveRoutine(base(), R), R)
    expect(next.routines.find(x => x.id === R)!.archived).toBeFalsy()
  })
  it('no muta la entrada', () => {
    const p = base()
    const snap = structuredClone(p)
    archiveRoutine(p, R)
    expect(p).toEqual(snap)
    const a = archiveRoutine(p, R)
    const snapA = structuredClone(a)
    restoreRoutine(a, R)
    expect(a).toEqual(snapA)
  })
})

describe('addCustomExercise', () => {
  it('crea un ejercicio propio con pasos y claves vacios', () => {
    const next = addCustomExercise(base(), { name: ' Remo en anillas ', category: 'strength', primaryMuscles: ['Dorsal'], musclewikiSlug: 'rings-row' })
    const e = next.customExercises.at(-1)!
    expect(e).toMatchObject({
      name: 'Remo en anillas', category: 'strength', primaryMuscles: ['Dorsal'], secondaryMuscles: [],
      steps: [], cues: [], custom: true, musclewiki: { slug: 'rings-row', id: null },
    })
    expect(e.id).toMatch(/^custom-ex-/)
  })
  it('sin slug guarda null (abre busqueda)', () => {
    const e = addCustomExercise(base(), { name: 'X', category: 'core', primaryMuscles: [] }).customExercises[0]
    expect(e.musclewiki.slug).toBeNull()
  })
  it('ids unicos en dos llamadas del mismo milisegundo', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-16T10:00:00Z'))
    const next = addCustomExercise(addCustomExercise(base(), { name: 'A', category: 'core', primaryMuscles: [] }), { name: 'B', category: 'core', primaryMuscles: [] })
    const ids = next.customExercises.map(e => e.id)
    expect(new Set(ids).size).toBe(2)
  })
  it('un nombre vacio deja el plan igual', () => {
    const p = base()
    expect(addCustomExercise(p, { name: '  ', category: 'core', primaryMuscles: [] })).toBe(p)
  })
  it('no muta la entrada', () => {
    const p = base()
    const snap = structuredClone(p)
    addCustomExercise(p, { name: 'X', category: 'core', primaryMuscles: [] })
    expect(p).toEqual(snap)
  })
})

describe('resetToTemplate', () => {
  it('restaura el Dia 1 despues de editarlo', () => {
    let p = base()
    p = removeSlot(p, R, blockOf(p).id, blockOf(p).slots[0].id)
    p = renameRoutine(p, R, { name: 'Cambiado' })
    p = archiveRoutine(p, R)
    const next = resetToTemplate(p)
    const r = next.routines.find(x => x.id === R)!
    expect(r).toEqual(DEFAULT_PLAN.routines[0])
    expect(r.archived).toBeFalsy()
  })
  it('vuelve a agregar las rutinas de la plantilla que faltan', () => {
    const p = base()
    p.routines = p.routines.filter(r => r.id !== 'espalda-d3')
    expect(resetToTemplate(p).routines.map(r => r.id)).toContain('espalda-d3')
  })
  it('conserva rutinas propias archivadas y los ejercicios propios', () => {
    let p = addCustomExercise(base(), { name: 'Mio', category: 'core', primaryMuscles: [] })
    p = addRoutine(p, 'Extra')
    const extraId = p.routines.at(-1)!.id
    p = archiveRoutine(p, extraId)
    const next = resetToTemplate(p)
    expect(next.routines.find(r => r.id === extraId)).toEqual(p.routines.at(-1))
    expect(next.customExercises).toEqual(p.customExercises)
  })
  it('entrega copias frescas: editar el resultado no toca la plantilla', () => {
    const next = resetToTemplate(base())
    next.routines[0].name = 'mutado'
    expect(DEFAULT_PLAN.routines[0].name).not.toBe('mutado')
  })
  it('no muta la entrada', () => {
    const p = archiveRoutine(base(), R)
    const snap = structuredClone(p)
    resetToTemplate(p)
    expect(p).toEqual(snap)
  })
})

// El registro de series se agrupa por exerciseId + setIndex: un mismo ejercicio
// dos veces en una rutina compartiria series. Por eso es una regla del plan.
describe('un ejercicio aparece una sola vez por rutina', () => {
  it('addSlot no agrega un ejercicio que ya esta en la rutina', () => {
    const p = base()
    expect(addSlot(p, R, blockOf(p).id, 'leg-press')).toBe(p)
  })
  it('swapExercise no cambia a un ejercicio que ya esta en la rutina', () => {
    const p = base()
    const [first, second] = blockOf(p).slots
    expect(swapExercise(p, R, blockOf(p).id, second.id, first.exerciseId)).toBe(p)
  })
  it('routineExerciseIds lista los ejercicios de todos los bloques', () => {
    const p = base()
    const ids = routineExerciseIds(p, 'espalda-d3')
    expect(ids.has('mcgill-curl-up')).toBe(true)
    expect(ids.has('zone2-cardio')).toBe(true)
    expect(ids.has('leg-press')).toBe(false)
  })
  it('ninguna rutina del plan por defecto repite un ejercicio', () => {
    for (const r of DEFAULT_PLAN.routines) {
      const all = r.blocks.flatMap(b => b.slots.map(s => s.exerciseId))
      expect(new Set(all).size, r.id).toBe(all.length)
    }
  })
})
