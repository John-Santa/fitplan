// Leaves the device as a fresh install: the two IndexedDB databases and the
// session draft in localStorage. It is what "Borrar dispositivo" (sign-out)
// and "Exportar y cambiar" (account switch) run; nothing else is kept, so the
// next account does not meet data of the previous one.
import { downloadBackupFile, exportBackup, wipeAll } from '../../../lib/db'
import type { Backup } from '../../../lib/types'
import { setSyncUser, syncNow } from '../../sync/lib/engine'
import { resetSyncState } from '../../sync/lib/syncDb'
import { saveActiveDraft } from '../../session/lib/activeSession'

export async function eraseDevice(): Promise<void> {
  // Stop the sync engine first and let a run in flight finish: a pull that
  // lands after the wipe would write the old account's data back.
  setSyncUser(null)
  await syncNow()
  await wipeAll()
  await resetSyncState()
  // wipeAll already removes the draft; kept explicit because the draft is part
  // of this operation's contract and must not depend on wipeAll's internals.
  saveActiveDraft(null)
}

/** Exports a backup (handed to `download`) and only then erases the device.
 *  If the export or the download throws, nothing is erased. */
export async function exportAndEraseDevice(download: (backup: Backup) => void | Promise<void> = downloadBackupFile): Promise<void> {
  await download(await exportBackup())
  await eraseDevice()
}
