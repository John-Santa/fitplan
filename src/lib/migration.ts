// Migracion unica al plan editable (S5). La decision de que escribir es pura
// (planMigration); applyPlanMigration solo la lleva a IndexedDB. Nunca toca
// sesiones: solo escribe el registro del plan y, si hace falta, la config.
import type { Config, TrainingPlan } from '../types'
import * as db from './db'
import { defaultPlanWithLegacy } from './defaultPlan'

/** Ids de las tres rutinas anteriores al plan editable. */
const LEGACY_ROUTINE_IDS: readonly string[] = ['dia1', 'dia2', 'dia3']

/** Inicio del bloque que traia la app antes de este plan. */
export const OLD_BLOCK_START = '2026-08-04'
/** Bloque de 12 semanas del plan nuevo (supuesto A2). */
const NEW_BLOCK_START = '2026-11-16'
const NEW_BLOCK_END = '2027-02-07'

export interface MigrationResult {
  /** Plan a escribir, o null si no hay nada que escribir. */
  plan: TrainingPlan | null
  /** Config a escribir, o null si queda como esta. */
  config: Config | null
}

const NOTHING: MigrationResult = { plan: null, config: null }

/** Decide que escribir. `storedPlanRaw` es lo que hay en disco bajo la llave
 *  del plan (undefined = nunca se guardo uno). Con cualquier valor guardado,
 *  aunque sea ilegible, no se hace nada: la migracion corre una sola vez, la
 *  persona pudo reeditar la semana despues, y un plan corrupto no se pisa
 *  (el store usa el de por defecto en memoria hasta que se edite). */
export function planMigration(storedPlanRaw: unknown, config: Config): MigrationResult {
  if (storedPlanRaw !== undefined) return NOTHING
  const plan = defaultPlanWithLegacy()
  let next: Config = config
  // A1: la semana se reemplaza solo si todavia apunta a rutinas anteriores.
  const usesLegacy = config.weeklyRoutine.some(
    d => d.kind === 'training' && LEGACY_ROUTINE_IDS.includes(d.routineId),
  )
  if (usesLegacy) next = { ...next, weeklyRoutine: plan.weekTemplate }
  // A2: solo el bloque que traia la app; fechas editadas por la persona se respetan.
  if (config.blockStart === OLD_BLOCK_START) next = { ...next, blockStart: NEW_BLOCK_START, blockEnd: NEW_BLOCK_END }
  return { plan, config: next === config ? null : next }
}

/** Corre la migracion contra IndexedDB y devuelve la config vigente. */
export async function applyPlanMigration(config: Config): Promise<Config> {
  const result = planMigration(await db.getPlan(), config)
  if (result.plan) await db.savePlan(result.plan)
  if (result.config) await db.saveConfig(result.config)
  return result.config ?? config
}
