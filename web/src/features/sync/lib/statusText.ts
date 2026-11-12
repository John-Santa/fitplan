import { AUTH_EXPIRED_ERROR, type SyncStatus } from './engine'

export const OFFLINE_TEXT = 'Sin conexión: se sincroniza al volver la señal'
/** 401 de la API: la cola espera, nada se pierde. */
export const AUTH_EXPIRED_TEXT = AUTH_EXPIRED_ERROR

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
  else if (s.state === 'auth_expired') lines.push(AUTH_EXPIRED_TEXT)
  else if ((s.state === 'error' || s.state === 'blocked') && s.lastError) lines.push(s.lastError)
  else if (s.lastSyncAt != null) lines.push(`Sincronizado ${ago(now - s.lastSyncAt)}`)
  else lines.push('Todavía no se sincroniza')
  if (s.pending > 0) lines.push(s.pending === 1 ? '1 cambio pendiente' : `${s.pending} cambios pendientes`)
  if (s.rejected > 0) {
    const head = s.rejected === 1 ? '1 cambio no se pudo subir' : `${s.rejected} cambios no se pudieron subir`
    lines.push(s.rejectedError ? `${head}: ${s.rejectedError}` : head)
  }
  return lines
}

export const BACKUP_NOTICE = 'Guardamos una copia de tus datos anteriores'

/** Texto bajo "Restaurar" en Ajustes. */
export const restoreHint = (signedIn: boolean) =>
  signedIn
    ? 'Se restaurará el respaldo en este teléfono y se combinará con tu cuenta; no se borra nada de la nube.'
    : 'Restaurar reemplaza todo lo que haya en este dispositivo.'

/** Las dos confirmaciones de "Borrar todos los datos". */
export const wipeConfirmTexts = (signedIn: boolean): [string, string] =>
  signedIn
    ? [
        'Esto borra todas las sesiones y mediciones de este teléfono. Tu cuenta las conserva y vuelven a este teléfono la próxima vez que inicies sesión. ¿Seguro?',
        'Última confirmación: lo que todavía no se haya sincronizado se pierde.',
      ]
    : [
        'Esto borra todas las sesiones y mediciones de este dispositivo. ¿Seguro?',
        'Última confirmación: no hay forma de deshacerlo sin un respaldo.',
      ]
