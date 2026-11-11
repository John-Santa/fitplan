// Personalizaciones del editor de rutinas anterior al plan editable (PR #1).
// Ese editor guardaba en config.routineExercises la lista completa de
// ejercicios de cada rutina dia1..dia3, con ejercicios propios de id `custom-…`.
// Ninguna de estas funciones borra nada: llevan esas listas al plan para que
// el historial conserve nombres y prescripciones.
import type { Exercise, LibraryExercise, PlanRoutine, PlanSlot, RoutineOverrides, TrainingPlan } from '../types'
import { LEGACY_ROUTINES } from './defaultPlan'
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

/** El editor anterior dejaba renombrar cualquier ejercicio, de la biblioteca
 *  incluido. Si el nombre guardado difiere del que resuelve el plan, el slot
 *  lo conserva como etiqueta: asi se renombra solo en esa rutina. */
function toSlot(plan: Pick<TrainingPlan, 'customExercises'>, routineId: string, e: Exercise): PlanSlot {
  const label = e.name.trim()
  const differs = label !== '' && label !== resolveExercise(plan, e.id)?.name
  return {
    id: `${routineId}-${e.id}`,
    exerciseId: e.id,
    sets: e.sets,
    target: { kind: 'reps', low: e.repsLow, high: e.repsHigh },
    restSec: e.restSec,
    note: e.cue,
    ...(e.main ? { primary: true } : {}),
    ...(differs ? { label } : {}),
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
  // Con los ejercicios propios ya agregados, para comparar nombres contra lo
  // que el plan resuelve de verdad.
  const resolved = addLegacyCustomExercises(plan, overrides)
  const routines = resolved.routines.map((r): PlanRoutine => {
    const list = lists.get(r.id)
    if (!list) return r
    const [first] = r.blocks
    const block = { id: first?.id ?? `${r.id}-ejercicios`, title: first?.title ?? 'Ejercicios', note: first?.note ?? '', slots: list.map(e => toSlot(resolved, r.id, e)) }
    return { ...r, blocks: [block] }
  })
  return { ...resolved, routines }
}

/** Igualdad profunda sin importar el orden de las llaves; una llave con valor
 *  undefined equivale a una ausente. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  }
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)])
  return [...keys].every(k => deepEqual(ra[k], rb[k]))
}

/** Verdadero si cada rutina archivada dia1..dia3 presente en el plan sigue
 *  igual que al migrar (LEGACY_ROUTINES), o sea, nadie la edito despues. Un
 *  plan sin ninguna de ellas tambien cuenta como intacto. */
export function legacyRoutinesUntouched(plan: Pick<TrainingPlan, 'routines'>): boolean {
  return LEGACY_ROUTINES.every(legacy => {
    const stored = plan.routines.find(r => r.id === legacy.id)
    return stored === undefined || deepEqual(stored, legacy)
  })
}
