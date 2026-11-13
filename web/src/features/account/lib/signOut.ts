// What happens when the person signs out. The dialog (components/SignOutDialog)
// asks; this module does: sync first, count what would be lost, then keep the
// data or erase the device. Clerk's signOut is injected so this file does not
// import the SDK (it only loads with a Clerk key).
import { syncNow } from '../../sync/lib/engine'
import { getOutbox } from '../../sync/lib/syncDb'
import { eraseDevice } from './eraseDevice'

/** Tries to upload what is pending and returns how many changes are still
 *  waiting afterwards (all of them when offline). Nothing is attempted when
 *  the outbox is empty. */
export async function prepareSignOut(sync: () => Promise<void> = syncNow): Promise<{ pending: number }> {
  if ((await getOutbox()).length === 0) return { pending: 0 }
  await sync()
  return { pending: (await getOutbox()).length }
}

/** Warning shown when erasing the device would lose unsynced changes. */
export function signOutWarning(pending: number): string | null {
  if (pending <= 0) return null
  return pending === 1
    ? '1 cambio todavía no se sincronizó y se perderá si borras el dispositivo.'
    : `${pending} cambios todavía no se sincronizaron y se perderán si borras el dispositivo.`
}

/** "Mantener datos": the account leaves, the data stays on the device. */
export async function signOutKeepingData(signOut: () => Promise<unknown>): Promise<void> {
  await signOut()
}

/** "Borrar dispositivo": erase first, so a failure leaves the person signed
 *  in (and able to retry) instead of signed out with the old data still here. */
export async function signOutErasingDevice(
  signOut: () => Promise<unknown>,
  erase: () => Promise<void> = eraseDevice,
): Promise<void> {
  await erase()
  await signOut()
}
