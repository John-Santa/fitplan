// Pegamento con IndexedDB (db.ts + migration.ts) sobre un IndexedDB en
// memoria: actualizacion in situ, respaldos v2/v3 y escrituras que fallan a
// medias. La logica pura de cada decision esta en persistence.regression.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config, TrainingPlan } from '../types'
import { installMemoryIdb, type MemoryIdb } from './testing/memoryIdb'

// Configuracion que traia la app antes del plan editable (commit 4d0c2c0):
// semana dia1..dia3 y bloque 2026-08-04..2026-09-28.
async function oldShippedConfig(): Promise<Config> {
  const { DEFAULT_CONFIG, DEFAULT_WEEKLY_ROUTINE } = await import('./plan')
  return structuredClone({
    ...DEFAULT_CONFIG,
    blockStart: '2026-08-04',
    blockEnd: '2026-09-28',
    weeklyRoutine: DEFAULT_WEEKLY_ROUTINE,
  })
}

const legacySession = {
  id: 's1', kind: 'strength', routineId: 'dia1', date: '2026-09-01', startedAt: 1, finishedAt: 2, notes: '',
  sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 10, done: true }],
}

let idb: MemoryIdb

/** Modulos nuevos y base vacia en cada prueba (db.ts guarda la conexion en
 *  una variable de modulo). `boot` replica la secuencia de arranque del
 *  efecto de inicio de StoreProvider (store.tsx): sembrar o completar la
 *  config y correr la migracion. Si esa secuencia cambia, cambia aqui. */
async function fresh() {
  vi.resetModules()
  idb = installMemoryIdb()
  const db = await import('./db')
  const plan = await import('./plan')
  const migration = await import('./migration')
  const defaults = await import('./defaultPlan')
  async function boot() {
    const stored = await db.getConfig()
    let current = plan.DEFAULT_CONFIG
    if (!stored) await db.saveConfig(plan.DEFAULT_CONFIG)
    else {
      current = plan.mergeConfig(stored)
      if (JSON.stringify(stored) !== JSON.stringify(current)) await db.saveConfig(current)
    }
    await migration.applyPlanMigration(current)
  }
  return { db, defaults, boot, oldConfig: await oldShippedConfig() }
}

const v2Backup = (config: Config | null) => ({
  app: 'fitplan', version: 2, exportedAt: '', sessions: [legacySession], measurements: [], exerciseMeta: [], config,
})

const trainingIds = (c: Config) =>
  c.weeklyRoutine.filter(d => d.kind === 'training').map(d => (d as { routineId: string }).routineId)

describe('persistencia sobre IndexedDB en memoria', () => {
  beforeEach(() => idb?.failPuts(null))

  it('actualizacion in situ: migra semana y fechas, escribe el plan y el segundo arranque no cambia nada', async () => {
    const { db, defaults, boot, oldConfig } = await fresh()
    await db.saveConfig(oldConfig)
    await db.saveSession(legacySession as never)
    await boot()
    const cfg = (await db.getConfig())!
    expect(cfg.weeklyRoutine).toEqual(defaults.DEFAULT_PLAN.weekTemplate)
    expect(cfg.blockStart).toBe('2026-11-16')
    expect(cfg.blockEnd).toBe('2027-02-07')
    expect(await db.getPlan()).toEqual(defaults.defaultPlanWithLegacy())
    expect((await db.getSessions()).sessions).toHaveLength(1)
    await boot()
    expect(await db.getConfig()).toEqual(cfg)
  })

  it('exportar v3 e importar conserva el plan editado', async () => {
    const { db, boot } = await fresh()
    await boot()
    const plan = (await db.getPlan()) as TrainingPlan
    plan.routines[0].name = 'Editado'
    await db.savePlan(plan)
    const backup = await db.exportBackup()
    expect(backup.version).toBe(3)
    expect(backup.plan?.routines[0].name).toBe('Editado')
    await db.savePlan({ ...plan, routines: [] })
    await db.importBackup(JSON.parse(JSON.stringify(backup)), 'replace')
    expect(((await db.getPlan()) as TrainingPlan).routines[0].name).toBe('Editado')
  })

  it('importar un respaldo v3 deja su config tal cual (la escribio esta version)', async () => {
    const { db, boot, oldConfig } = await fresh()
    await boot()
    const backup = JSON.parse(JSON.stringify(await db.exportBackup()))
    backup.config = oldConfig // semana vieja a proposito: no se reescribe
    await db.importBackup(backup, 'replace')
    expect((await db.getConfig())!.blockStart).toBe('2026-08-04')
    expect(trainingIds((await db.getConfig())!)).toEqual(['dia1', 'dia2', 'dia3'])
  })

  it('importar un respaldo v2 con reemplazo conserva el plan editado y las sesiones', async () => {
    const { db, boot, oldConfig } = await fresh()
    await boot()
    const plan = (await db.getPlan()) as TrainingPlan
    plan.routines[0].name = 'Editado'
    await db.savePlan(plan)
    await db.importBackup(v2Backup(oldConfig), 'replace')
    expect(((await db.getPlan()) as TrainingPlan).routines[0].name).toBe('Editado')
    expect((await db.getSessions()).sessions).toHaveLength(1)
  })

  it('B1: restaurar un respaldo v2 sobre una instalacion nueva migra la semana y las fechas', async () => {
    const { db, defaults, boot, oldConfig } = await fresh()
    await boot() // instalacion nueva: siembra config y plan
    await db.importBackup(v2Backup(oldConfig), 'replace')
    await boot() // siguiente arranque
    const cfg = (await db.getConfig())!
    expect(cfg.weeklyRoutine).toEqual(defaults.DEFAULT_PLAN.weekTemplate)
    expect(cfg.blockStart).toBe('2026-11-16')
    expect(cfg.blockEnd).toBe('2027-02-07')
    // El historial del respaldo sigue ahi, intacto.
    expect((await db.getSessions()).sessions).toHaveLength(1)
  })

  it('B1: la semana que se usa es la del plan que queda activo, no la de fabrica', async () => {
    const { db, boot, oldConfig } = await fresh()
    await boot()
    const plan = (await db.getPlan()) as TrainingPlan
    const week = plan.weekTemplate.map(d => ({ ...d }))
    week[1] = { kind: 'rest', title: '', note: 'editado' } as never
    await db.savePlan({ ...plan, weekTemplate: week as never })
    await db.importBackup(v2Backup(oldConfig), 'replace')
    expect((await db.getConfig())!.weeklyRoutine).toEqual(week)
  })

  it('B1: un respaldo v2 sin config no toca la config guardada', async () => {
    const { db, boot } = await fresh()
    await boot()
    const before = await db.getConfig()
    await db.importBackup(v2Backup(null), 'merge')
    expect(await db.getConfig()).toEqual(before)
  })

  it('si falla la escritura de la config, el plan no se escribe y el siguiente arranque converge', async () => {
    const { db, defaults, boot, oldConfig } = await fresh()
    await db.saveConfig(oldConfig)
    idb.failPuts((store, key) => store === 'config' && key === 'config')
    await expect(boot()).rejects.toThrow('QuotaExceeded')
    // El plan es la marca de "migracion hecha": sin ella se reintenta.
    expect(await db.getPlan()).toBeUndefined()
    idb.failPuts(null)
    await boot()
    const cfg = (await db.getConfig())!
    expect(cfg.weeklyRoutine).toEqual(defaults.DEFAULT_PLAN.weekTemplate)
    expect(cfg.blockStart).toBe('2026-11-16')
    expect(await db.getPlan()).toEqual(defaults.defaultPlanWithLegacy())
  })

  it('si falla la escritura del plan, la config ya migrada queda y el siguiente arranque converge', async () => {
    const { db, defaults, boot, oldConfig } = await fresh()
    await db.saveConfig(oldConfig)
    idb.failPuts((store, key) => store === 'config' && key === 'plan')
    await expect(boot()).rejects.toThrow('QuotaExceeded')
    expect(await db.getPlan()).toBeUndefined()
    idb.failPuts(null)
    await boot()
    const cfg = (await db.getConfig())!
    expect(cfg.weeklyRoutine).toEqual(defaults.DEFAULT_PLAN.weekTemplate)
    expect(cfg.blockStart).toBe('2026-11-16')
    expect(await db.getPlan()).toEqual(defaults.defaultPlanWithLegacy())
  })

  // PR #1: la app publicada guardaba ejercicios personalizados por rutina en
  // config.routineExercises. Actualizar no debe perderlos.
  const bulgara = {
    id: 'custom-abc123', name: 'Sentadilla búlgara', sets: 4, repsLow: 8, repsHigh: 10, restSec: 120, cue: '', mwSlug: '',
  }

  it('actualizar con rutinas personalizadas: la archivada conserva la lista y el ejercicio propio queda en el plan', async () => {
    const { db, boot, oldConfig } = await fresh()
    await db.saveConfig({ ...oldConfig, routineExercises: { dia1: [bulgara] } })
    await boot()
    const plan = (await db.getPlan()) as TrainingPlan
    const dia1 = plan.routines.find(r => r.id === 'dia1')!
    expect(dia1.archived).toBe(true)
    expect(dia1.blocks.flatMap(b => b.slots).map(s => s.exerciseId)).toEqual(['custom-abc123'])
    expect(plan.customExercises).toMatchObject([{ id: 'custom-abc123', name: 'Sentadilla búlgara', custom: true }])
    // El dato heredado sigue en la config: la migracion lo lee, no lo borra.
    expect((await db.getConfig())!.routineExercises).toEqual({ dia1: [bulgara] })
  })

  it('restaurar un respaldo v2 con ejercicios propios los agrega al plan sin tocar las rutinas del plan nuevo', async () => {
    const { db, boot, oldConfig } = await fresh()
    await boot()
    const before = (await db.getPlan()) as TrainingPlan
    await db.importBackup(v2Backup({ ...oldConfig, routineExercises: { dia2: [bulgara] } }), 'replace')
    const after = (await db.getPlan()) as TrainingPlan
    expect(after.customExercises.map(e => e.id)).toEqual(['custom-abc123'])
    expect(after.routines.filter(r => !r.archived)).toEqual(before.routines.filter(r => !r.archived))
    // La archivada sin tocar desde la migracion toma la lista del respaldo.
    expect(after.routines.find(r => r.id === 'dia2')!.blocks.flatMap(b => b.slots).map(s => s.exerciseId)).toEqual(['custom-abc123'])
  })

  // Restaurar sobre un dispositivo recien migrado (sin personalizaciones al
  // actualizar): las rutinas archivadas sin tocar toman la lista del respaldo.
  it('restaurar un respaldo v2 sobre un dispositivo recien migrado lleva las listas y etiquetas a las archivadas', async () => {
    const { db, boot, oldConfig } = await fresh()
    await boot()
    const before = (await db.getPlan()) as TrainingPlan
    const renamed = { ...bulgara, id: 'leg-curl', name: 'Curl femoral acostado (renombrado)', mwSlug: '' }
    await db.importBackup(v2Backup({ ...oldConfig, routineExercises: { dia1: [bulgara, renamed] } }), 'replace')
    const after = (await db.getPlan()) as TrainingPlan
    const dia1 = after.routines.find(r => r.id === 'dia1')!
    expect(dia1.blocks.flatMap(b => b.slots).map(s => [s.exerciseId, s.label])).toEqual([
      ['custom-abc123', undefined], ['leg-curl', 'Curl femoral acostado (renombrado)'],
    ])
    expect(after.routines.filter(r => r.id !== 'dia1')).toEqual(before.routines.filter(r => r.id !== 'dia1'))
  })

  it('restaurar un respaldo v2 cuando la rutina archivada ya se edito solo agrega los ejercicios propios', async () => {
    const { db, boot, oldConfig } = await fresh()
    await boot()
    const edited = structuredClone((await db.getPlan()) as TrainingPlan)
    edited.routines.find(r => r.id === 'dia1')!.blocks[0].slots[0].sets += 2
    await db.savePlan(edited)
    await db.importBackup(v2Backup({ ...oldConfig, routineExercises: { dia1: [bulgara] } }), 'replace')
    const after = (await db.getPlan()) as TrainingPlan
    expect(after.routines).toEqual(edited.routines)
    expect(after.customExercises.map(e => e.id)).toEqual(['custom-abc123'])
  })

  it('restaurar un respaldo v2 con el plan guardado corrupto no escribe un plan', async () => {
    const { db, boot, oldConfig } = await fresh()
    await boot()
    await db.savePlan({ garbage: true } as never)
    await db.importBackup(v2Backup({ ...oldConfig, routineExercises: { dia1: [bulgara] } }), 'replace')
    expect(await db.getPlan()).toEqual({ garbage: true })
  })

  it('exportar con un plan guardado corrupto omite el plan', async () => {
    const { db, boot } = await fresh()
    await boot()
    await db.savePlan({ garbage: true } as never)
    const backup = await db.exportBackup()
    expect('plan' in backup).toBe(false)
  })
})
