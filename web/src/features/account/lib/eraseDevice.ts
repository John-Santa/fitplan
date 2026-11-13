// Leaves the device as a fresh install: the two IndexedDB databases and the
// per-device localStorage keys (session draft, reminder prefs, selected
// discipline), all through eraseLocalCopy. It is what "Borrar dispositivo" (sign-out)
// and "Exportar y cambiar" (account switch) run; nothing else is kept, so the
// next account does not meet data of the previous one.
import { downloadBackupFile, exportBackup } from '../../../lib/db'
import type { Backup } from '../../../lib/types'
import { setSyncUser, syncNow } from '../../sync/lib/engine'
import { eraseLocalCopy } from '../../sync/lib/erase'

export async function eraseDevice(): Promise<void> {
  // Stop the sync engine first and let a run in flight finish: a pull that
  // lands after the wipe would write the old account's data back.
  setSyncUser(null)
  await syncNow()
  // The same helper the danger zone and the 410 answer use: every fitplan and
  // magnifit-sync store plus the workout draft.
  await eraseLocalCopy()
}

/** Exports a backup (handed to `download`) and only then erases the device.
 *  If the export or the download throws, nothing is erased. */
export async function exportAndEraseDevice(download: (backup: Backup) => void | Promise<void> = downloadBackupFile): Promise<void> {
  await download(await exportBackup())
  await eraseDevice()
}
