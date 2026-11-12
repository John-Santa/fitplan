// Validacion defensiva del plan leido de IndexedDB: lo guardado puede venir
// de otra version del codigo o estar corrupto, y nunca debe reventar la app.
import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN, defaultPlanWithLegacy } from './defaultPlan'
import { normalizePlan, planFromBackup } from './planStorage'

describe('normalizePlan', () => {
  it('hace round-trip del plan por defecto sin cambios', () => {
    expect(normalizePlan(DEFAULT_PLAN)).toEqual(DEFAULT_PLAN)
  })

  it('hace round-trip del plan con rutinas archivadas, incluso tras JSON', () => {
    const plan = defaultPlanWithLegacy()
    expect(normalizePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan)
  })

  it('basura devuelve null sin reventar', () => {
    for (const junk of [null, undefined, 42, 'plan', [], {}, { schemaVersion: 1 }]) {
      expect(normalizePlan(junk)).toBeNull()
    }
  })

  it('un schemaVersion desconocido devuelve null', () => {
    expect(normalizePlan({ ...DEFAULT_PLAN, schemaVersion: 2 })).toBeNull()
  })

  it('arreglos faltantes o ids que no son texto devuelven null', () => {
    expect(normalizePlan({ ...DEFAULT_PLAN, routines: undefined })).toBeNull()
    expect(normalizePlan({ ...DEFAULT_PLAN, routines: [{ ...DEFAULT_PLAN.routines[0], id: 7 }] })).toBeNull()
    const badSlot = structuredClone(DEFAULT_PLAN)
    ;(badSlot.routines[0].blocks[0].slots[0] as unknown as { id: unknown }).id = null
    expect(normalizePlan(badSlot)).toBeNull()
  })

  it('un numero no finito devuelve null', () => {
    expect(normalizePlan({ ...DEFAULT_PLAN, weeks: Number.NaN })).toBeNull()
    const bad = structuredClone(DEFAULT_PLAN)
    bad.routines[0].blocks[0].slots[0].sets = Number.POSITIVE_INFINITY
    expect(normalizePlan(bad)).toBeNull()
  })

  it('customExercises faltante se completa con []', () => {
    const { customExercises: _c, ...legacy } = DEFAULT_PLAN
    expect(normalizePlan(legacy)?.customExercises).toEqual([])
  })

  it('descarta campos desconocidos', () => {
    const noisy = { ...DEFAULT_PLAN, extra: 'x', routines: [{ ...DEFAULT_PLAN.routines[0], mystery: 1 }] }
    const out = normalizePlan(noisy) as unknown as Record<string, unknown>
    expect(out.extra).toBeUndefined()
    expect((out.routines as Record<string, unknown>[])[0].mystery).toBeUndefined()
  })

  it('conserva una rutina archivada y un ejercicio propio valido', () => {
    const plan = defaultPlanWithLegacy()
    plan.customExercises = [{
      id: 'mi-ejercicio', name: 'Mi ejercicio', category: 'strength', equipment: 'Mancuernas',
      primaryMuscles: ['Glúteo'], secondaryMuscles: [], steps: [], cues: [],
      musclewiki: { slug: null, id: null }, custom: true,
    }]
    const out = normalizePlan(plan)
    expect(out?.routines.filter(r => r.archived)).toHaveLength(3)
    expect(out?.customExercises).toEqual(plan.customExercises)
  })
})

describe('normalizePlan: etiqueta del slot', () => {
  const withLabel = (label: unknown) => {
    const plan = structuredClone(defaultPlanWithLegacy()) as unknown as { routines: { blocks: { slots: Record<string, unknown>[] }[] }[] }
    plan.routines[0].blocks[0].slots[0].label = label
    return normalizePlan(plan)?.routines[0].blocks[0].slots[0]
  }

  it('la etiqueta sobrevive a normalizePlan (recortada) y una vacia se omite', () => {
    expect(withLabel('  Mi nombre ')?.label).toBe('Mi nombre')
    expect(withLabel('   ')).not.toHaveProperty('label')
    expect(withLabel(42)).not.toHaveProperty('label')
  })
})

describe('planFromBackup', () => {
  it('un respaldo v3 con plan valido devuelve ese plan', () => {
    expect(planFromBackup({ app: 'fitplan', version: 3, plan: DEFAULT_PLAN })).toEqual(DEFAULT_PLAN)
  })

  it('un respaldo v1/v2 sin plan devuelve null: se conserva el plan actual', () => {
    expect(planFromBackup({ app: 'fitplan', version: 2 })).toBeNull()
    expect(planFromBackup({ app: 'fitplan', version: 1 })).toBeNull()
  })

  it('un plan ilegible en el respaldo devuelve null en vez de pisar el actual', () => {
    expect(planFromBackup({ app: 'fitplan', version: 3, plan: { basura: 1 } })).toBeNull()
  })
})
