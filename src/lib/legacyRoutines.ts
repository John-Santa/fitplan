// Personalizaciones del editor de rutinas anterior al plan editable (PR #1).
// Ese editor guardaba en config.routineExercises la lista completa de
// ejercicios de cada rutina dia1..dia3, con ejercicios propios de id `custom-…`.
// Ninguna de estas funciones borra nada: llevan esas listas al plan para que
// el historial conserve nombres y prescripciones.
import type { Exercise, LibraryExercise, PlanRoutine, PlanSlot, RoutineOverrides, TrainingPlan } from '../types'
import { resolveExercise } from './library'

/** Ejercicio propio del editor anterior como ejercicio del plan. Solo se sabe
 *  su nombre y su slug: musculos, pasos y claves quedan vacios. */
function toCustomExercise(e: Exercise): LibraryExercise {
  return {
    id: e.id,
    name: e.name,
    category: 'strength',
    equipment: '',
    primaryMuscles: [],
    secondaryMuscles: [],
    steps: [],
    cues: [],
    musclewiki: { slug: e.mwSlug || null, id: null },
    custom: true,
  }
}

function toSlot(routineId: string, e: Exercise): PlanSlot {
  return {
    id: `${routineId}-${e.id}`,
    exerciseId: e.id,
    sets: e.sets,
    target: { kind: 'reps', low: e.repsLow, high: e.repsHigh },
    restSec: e.restSec,
    note: e.cue,
    ...(e.main ? { primary: true } : {}),
  }
}

function overrideLists(overrides: RoutineOverrides): [string, Exercise[]][] {
  return Object.entries(overrides).filter((entry): entry is [string, Exercise[]] => Array.isArray(entry[1]) && entry[1].length > 0)
}

/** Agrega a customExercises los ejercicios de las listas que el plan no
 *  resuelve (ni la biblioteca ni un ejercicio propio ya guardado). No toca las
 *  rutinas. Devuelve el mismo plan si no falta ninguno. */
export function addLegacyCustomExercises(plan: TrainingPlan, overrides: RoutineOverrides): TrainingPlan {
  const added: LibraryExercise[] = []
  const seen = new Set<string>()
  for (const [, list] of overrideLists(overrides)) {
    for (const e of list) {
      if (seen.has(e.id) || resolveExercise(plan, e.id)) continue
      seen.add(e.id)
      added.push(toCustomExercise(e))
    }
  }
  return added.length === 0 ? plan : { ...plan, customExercises: [...plan.customExercises, ...added] }
}

/** Migracion: cada rutina personalizada toma su lista (orden y prescripcion)
 *  en un solo bloque, y los ejercicios propios pasan al plan. Pensada para el
 *  plan recien creado con las rutinas anteriores archivadas. */
export function applyLegacyRoutineExercises(plan: TrainingPlan, overrides: RoutineOverrides): TrainingPlan {
  const lists = new Map(overrideLists(overrides))
  if (lists.size === 0) return plan
  const routines = plan.routines.map((r): PlanRoutine => {
    const list = lists.get(r.id)
    if (!list) return r
    const [first] = r.blocks
    const block = { id: first?.id ?? `${r.id}-ejercicios`, title: first?.title ?? 'Ejercicios', note: first?.note ?? '', slots: list.map(e => toSlot(r.id, e)) }
    return { ...r, blocks: [block] }
  })
  return addLegacyCustomExercises({ ...plan, routines }, overrides)
}
