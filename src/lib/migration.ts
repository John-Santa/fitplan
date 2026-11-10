// Migracion unica al plan editable (S5). La decision de que escribir es pura
// (planMigration); applyPlanMigration solo la lleva a IndexedDB. Nunca toca
// sesiones: solo escribe el registro del plan y, si hace falta, la config.
import type { Config, TrainingPlan } from '../types'
import * as db from './db'
import { defaultPlanWithLegacy } from './defaultPlan'
import { migrateLegacyConfig } from './legacyConfig'

export { OLD_BLOCK_START } from './legacyConfig'

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
  return { plan, config: migrateLegacyConfig(config, plan.weekTemplate) }
}

/** Corre la migracion contra IndexedDB y devuelve la config vigente. */
export async function applyPlanMigration(config: Config): Promise<Config> {
  const result = planMigration(await db.getPlan(), config)
  // Primero la config y al final el plan: el plan guardado es la marca de
  // "migracion hecha" (planMigration no hace nada si existe). Si la config
  // fallara despues de escribir el plan, quedaria con la semana y el bloque
  // anteriores para siempre; en este orden, un fallo a medias reintenta en el
  // siguiente arranque (la reescritura es idempotente).
  if (result.config) await db.saveConfig(result.config)
  if (result.plan) await db.savePlan(result.plan)
  return result.config ?? config
}
