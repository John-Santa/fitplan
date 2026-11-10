// Pruebas de la biblioteca de ejercicios: integridad de ids, referencias y
// slugs de MuscleWiki.
import { describe, expect, it } from 'vitest'
import type { LibraryExercise } from '../types'
import { EXERCISE_LIBRARY, libraryById, resolveExercise } from './library'
import { ROUTINES } from './plan'

/** Slugs verificados por busqueda en MuscleWiki. Cualquier otro valor debe ser
 *  null (la interfaz cae a una busqueda). */
const VERIFIED_SLUGS = [
  'machine-leg-press', 'dumbbell-goblet-squat', 'smith-machine-split-squat', 'machine-leg-extension',
  'machine-seated-leg-curl', 'machine-seated-calf-raises', 'cable-pallof-press', 'machine-chest-press',
  'machine-pulldown', 'neutral-pulldown', 'narrow-pulldown', 'machine-seated-cable-row',
  'machine-overhand-overhead-press', 'machine-face-pulls', 'dumbbell-incline-curl', 'dead-bug',
  'elbow-side-plank', 'bird-dog', 'smith-machine-hip-thrust', 'machine-plate-loaded-hip-thrust',
  'barbell-hip-thrust', 'dumbbell-glute-bridge', 'glute-bridge', 'cable-pull-through',
  'dumbbell-romanian-deadlift', 'dumbbell-step-up', 'machine-single-leg-leg-press', 'machine-hip-abduction',
  'forearm-plank', 'dumbbell-incline-bench-press', 'dumbbell-single-arm-row', 'machine-pec-fly',
  'seated-lateral-raise', 'machine-reverse-fly', 'dumbbell-seated-hammer-curl',
]

describe('EXERCISE_LIBRARY', () => {
  it('los ids son unicos', () => {
    const ids = EXERCISE_LIBRARY.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('todo musclewiki.slug es verificado, heredado de una rutina anterior, o null', () => {
    const legacy = ROUTINES.flatMap(r => r.exercises).map(e => e.mwSlug)
    const allowed = new Set([...VERIFIED_SLUGS, ...legacy])
    for (const e of EXERCISE_LIBRARY) {
      expect(e.musclewiki.slug === null || allowed.has(e.musclewiki.slug), e.id).toBe(true)
    }
  })

  it('musclewiki.id queda reservado: siempre null', () => {
    expect(EXERCISE_LIBRARY.every(e => e.musclewiki.id === null)).toBe(true)
  })

  it('todo alternativeId resuelve a un ejercicio de la biblioteca', () => {
    for (const e of EXERCISE_LIBRARY) {
      if (e.alternativeId !== undefined) expect(libraryById(e.alternativeId), e.id).toBeDefined()
    }
  })

  it('toda entrada trae pasos y claves de seguridad', () => {
    for (const e of EXERCISE_LIBRARY) {
      expect(e.steps.length, e.id).toBeGreaterThanOrEqual(3)
      expect(e.steps.length, e.id).toBeLessThanOrEqual(5)
      expect(e.cues.length, e.id).toBeGreaterThanOrEqual(1)
      expect(e.primaryMuscles.length, e.id).toBeGreaterThanOrEqual(1)
    }
  })

  it('conserva todo ejercicio de las rutinas anteriores con su mismo id', () => {
    for (const legacy of ROUTINES.flatMap(r => r.exercises)) {
      expect(libraryById(legacy.id), legacy.id).toBeDefined()
    }
  })

  it('libraryById devuelve undefined para un id desconocido', () => {
    expect(libraryById('no-existe')).toBeUndefined()
  })
})

describe('resolveExercise', () => {
  const custom: LibraryExercise = {
    id: 'mi-ejercicio', name: 'Mi ejercicio', category: 'strength', equipment: '', primaryMuscles: ['Pecho'],
    secondaryMuscles: [], steps: [], cues: [], musclewiki: { slug: null, id: null }, custom: true,
  }
  const plan = { customExercises: [custom, { ...custom, id: 'leg-press', name: 'Prensa propia' }] }

  it('busca primero en los ejercicios propios y luego en la biblioteca', () => {
    expect(resolveExercise(plan, 'mi-ejercicio')).toBe(custom)
    expect(resolveExercise(plan, 'leg-extension')).toBe(libraryById('leg-extension'))
    expect(resolveExercise(plan, 'leg-press')?.name).toBe('Prensa propia')
    expect(resolveExercise(plan, 'no-existe')).toBeUndefined()
  })
})
