// Fin del bloque de 12 semanas (F8): comparacion y arranque de un bloque nuevo.
import type { Config, Session } from '../../../lib/types'
import { sessionVolume, todayISO } from '../../../lib/calc'

const addDays = (iso: string, days: number): string => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return todayISO(d)
}

/** Volumen de fuerza (kg) de la semana `n` (base 1) del bloque. */
export function blockWeekVolume(sessions: Session[], blockStart: string, n: number): number {
  const from = addDays(blockStart, (n - 1) * 7)
  const to = addDays(blockStart, n * 7 - 1)
  return sessions.reduce((acc, s) => (s.kind === 'strength' && s.finishedAt != null && s.date >= from && s.date <= to ? acc + sessionVolume(s) : acc), 0)
}

/** Volumen de fuerza (kg) de la primera y de la ultima semana del bloque. */
export function weekVolumes(sessions: Session[], blockStart: string, weeks: number): { first: number; last: number } {
  return { first: blockWeekVolume(sessions, blockStart, 1), last: blockWeekVolume(sessions, blockStart, weeks) }
}

/** Config con fechas nuevas: el lunes de hoy o el siguiente, 12 semanas. Las
 *  metas y el resto de la config pasan tal cual; las sesiones no se tocan. */
export function startNewBlock(config: Config, today: Date, weeks = 12): Config {
  const toMonday = (8 - today.getDay()) % 7
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + toMonday)
  const blockStart = todayISO(start)
  return { ...config, blockStart, blockEnd: addDays(blockStart, weeks * 7 - 1) }
}
