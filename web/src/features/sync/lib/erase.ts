// The one helper that erases the local copy of an account: every 'fitplan'
// store (wipeAll), every 'magnifit-sync' store (outbox, meta with the
// config-merge base, pushed stamp and conflict notice, rejected) and the
// workout draft in localStorage, plus the reminders' per-device prefs
// (localStorage) and schedule (Cache Storage, it holds routine titles and
// times). Every erase path runs it: "Borrar
// dispositivo" and "Exportar y cambiar" (account/lib/eraseDevice), the danger
// zone after deleting the account or the cloud data, and the engine when the
// API answers 410 (the account was deleted from another device).
import { wipeAll } from '../../../lib/db'
import { saveActiveDraft } from '../../session/lib/activeSession'
import { resetSyncState } from './syncDb'
import { REMINDER_PREFS_KEY } from '../../reminders/lib/prefs'
import { REMINDERS_CACHE } from '../../reminders/lib/background'

export async function eraseLocalCopy(): Promise<void> {
  await wipeAll()
  // The in-progress workout lives in localStorage, outside IndexedDB: without
  // this it reopens after the reload that follows an account deletion.
  saveActiveDraft(null)
  // Sin datos locales tampoco hay dueño: la próxima cuenta empieza de cero.
  await resetSyncState()
  removeReminderData()
  await deleteReminderSchedule()
}

function removeReminderData() {
  try {
    localStorage.removeItem(REMINDER_PREFS_KEY)
  } catch {
    // Storage blocked: nothing was saved there either.
  }
}

/** Cache Storage is missing outside secure contexts and in some private
 *  modes; the erase must never fail because of it. */
async function deleteReminderSchedule() {
  try {
    if (typeof caches !== 'undefined' && caches) await caches.delete(REMINDERS_CACHE)
  } catch {
    // Same: an unavailable cache holds no schedule.
  }
}
