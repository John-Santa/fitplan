// Reescritura de la config anterior al plan editable (supuestos A1 y A2 de
// S5). Es pura y no importa db.ts: la usan la migracion de arranque
// (migration.ts) y la importacion de respaldos sin plan (db.ts), y asi la
// condicion vive en un solo lugar sin ciclo entre ambos.
import type { Config, WeeklyRoutine } from './types'

/** Ids de las tres rutinas anteriores al plan editable. */
const LEGACY_ROUTINE_IDS: readonly string[] = ['dia1', 'dia2', 'dia3']

/** Inicio del bloque que traia la app antes de este plan. */
export const OLD_BLOCK_START = '2026-08-04'
/** Bloque de 12 semanas del plan nuevo (supuesto A2). */
export const NEW_BLOCK_START = '2026-11-16'
export const NEW_BLOCK_END = '2027-02-07'

/** Devuelve la config con la semana y el bloque anteriores reemplazados, o
 *  null si no hay nada que cambiar. `weekTemplate` es la semana del plan que
 *  queda activo. No muta `config`. */
export function migrateLegacyConfig(config: Config, weekTemplate: WeeklyRoutine): Config | null {
  let next: Config = config
  // A1: la semana se reemplaza solo si todavia apunta a rutinas anteriores.
  const usesLegacy = config.weeklyRoutine.some(
    d => d.kind === 'training' && LEGACY_ROUTINE_IDS.includes(d.routineId),
  )
  if (usesLegacy) next = { ...next, weeklyRoutine: weekTemplate }
  // A2: solo el bloque que traia la app; fechas editadas por la persona se respetan.
  if (config.blockStart === OLD_BLOCK_START) {
    next = { ...next, blockStart: NEW_BLOCK_START, blockEnd: NEW_BLOCK_END }
  }
  return next === config ? null : next
}
