import type { SyncStatus } from './engine'

export const OFFLINE_TEXT = 'Sin conexión: se sincroniza al volver la señal'

function ago(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return h === 1 ? 'hace 1 hora' : `hace ${h} horas`
  const d = Math.floor(h / 24)
  return d === 1 ? 'hace 1 día' : `hace ${d} días`
}

/** Líneas de estado para la tarjeta "Cuenta" de Ajustes. */
export function syncStatusLines(s: SyncStatus, now = Date.now()): string[] {
  const lines: string[] = []
  if (s.state === 'syncing') lines.push('Sincronizando…')
  else if (s.state === 'offline') lines.push(OFFLINE_TEXT)
  else if ((s.state === 'error' || s.state === 'blocked') && s.lastError) lines.push(s.lastError)
  else if (s.lastSyncAt != null) lines.push(`Sincronizado ${ago(now - s.lastSyncAt)}`)
  else lines.push('Todavía no se sincroniza')
  if (s.pending > 0) lines.push(s.pending === 1 ? '1 cambio pendiente' : `${s.pending} cambios pendientes`)
  return lines
}
