// Account entry points outside Perfil (F19/F20): the welcome's invitation and
// the "Respalda tus datos" notice in Hoy share these texts.
import type { SyncStatus } from '../../sync/lib/engine'

export const BACKUP_INVITE_TITLE = 'Respalda tus datos'

export const BACKUP_INVITE_TEXT =
  'Hoy tus datos viven solo en este dispositivo. Con una cuenta se respaldan y puedes usarlos en otro teléfono.'

/** Shown when login exists but Clerk did not load (no connection). */
export const SIGN_IN_OFFLINE_TEXT = 'Para crear tu cuenta o iniciar sesión necesitas conexión.'

/** Hint while the first sync after signing in waits for the API, which can
 *  take close to a minute when the free server wakes up (cold start). null
 *  when there is nothing to say. */
export function connectingText(status: SyncStatus | null): string | null {
  if (!status || status.state !== 'syncing' || status.lastSyncAt != null) return null
  return 'Conectando con el servidor… la primera vez puede tardar hasta un minuto.'
}
