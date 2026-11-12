// Migracion unica e idempotente al plan editable (S5). Solo se prueba la
// parte pura: la decision de que escribir. El pegamento con IndexedDB es
// una linea por escritura.
import { describe, expect, it } from 'vitest'
import type { Config } from './types'
import { DEFAULT_PLAN, defaultPlanWithLegacy } from './defaultPlan'
import { OLD_BLOCK_START, planMigration } from './migration'
import { DEFAULT_CONFIG, DEFAULT_WEEKLY_ROUTINE } from './plan'

const legacyConfig: Config = {
  ...DEFAULT_CONFIG,
  blockStart: OLD_BLOCK_START,
  blockEnd: '2026-09-28',
  weeklyRoutine: DEFAULT_WEEKLY_ROUTINE,
}

describe('planMigration', () => {
  it('sin plan guardado escribe el plan por defecto con las rutinas archivadas', () => {
    const r = planMigration(undefined, DEFAULT_CONFIG)
    expect(r.plan).toEqual(defaultPlanWithLegacy())
    expect(r.plan?.routines.filter(x => x.archived).map(x => x.id)).toEqual(['dia1', 'dia2', 'dia3'])
  })

  it('una semana que apunta a rutinas anteriores se reemplaza por la del plan', () => {
    const r = planMigration(undefined, legacyConfig)
    expect(r.config?.weeklyRoutine).toEqual(DEFAULT_PLAN.weekTemplate)
  })

  it('una semana que no apunta a rutinas anteriores se conserva', () => {
    const custom = { ...DEFAULT_CONFIG, blockStart: '2026-12-01', weeklyRoutine: DEFAULT_PLAN.weekTemplate }
    const r = planMigration(undefined, custom)
    expect(r.config).toBeNull()
  })

  it('las fechas del bloque anterior pasan a las de 12 semanas', () => {
    const r = planMigration(undefined, legacyConfig)
    expect(r.config).toMatchObject({ blockStart: '2026-11-16', blockEnd: '2027-02-07' })
  })

  it('fechas distintas a las del bloque anterior se conservan', () => {
    const edited = { ...legacyConfig, blockStart: '2026-09-01', blockEnd: '2026-10-27' }
    const r = planMigration(undefined, edited)
    expect(r.config?.blockStart).toBe('2026-09-01')
    expect(r.config?.blockEnd).toBe('2026-10-27')
  })

  it('el resto de la configuracion no se toca', () => {
    const r = planMigration(undefined, { ...legacyConfig, heightCm: 180, poolLengthM: 50 })
    expect(r.config).toMatchObject({ heightCm: 180, poolLengthM: 50, goal: DEFAULT_CONFIG.goal })
  })

  it('con un plan ya guardado no escribe nada (segunda ejecucion = no-op)', () => {
    const first = planMigration(undefined, legacyConfig)
    expect(planMigration(first.plan, first.config ?? legacyConfig)).toEqual({ plan: null, config: null })
    // Aun con la semana vieja: si ya hay plan, la persona pudo reeditarla.
    expect(planMigration(first.plan, legacyConfig)).toEqual({ plan: null, config: null })
  })

  it('un plan guardado ilegible tampoco se sobreescribe', () => {
    expect(planMigration({ basura: true }, legacyConfig)).toEqual({ plan: null, config: null })
  })
})
