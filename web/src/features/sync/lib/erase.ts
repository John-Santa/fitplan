// Borrado de la copia local de una cuenta: los datos de 'fitplan' (wipeAll) y
// el estado de sincronización (outbox, meta y rechazados). Lo usan la zona de
// peligro de Ajustes después de borrar la cuenta o los datos en la nube, y el
// motor cuando la API responde 410 (la cuenta se eliminó desde otro
// dispositivo).
import { wipeAll } from '../../../lib/db'
import { saveActiveDraft } from '../../session/lib/activeSession'
import { resetSyncState } from './syncDb'

export async function eraseLocalCopy(): Promise<void> {
  await wipeAll()
  // The in-progress workout lives in localStorage, outside IndexedDB: without
  // this it reopens after the reload that follows an account deletion.
  saveActiveDraft(null)
  // Sin datos locales tampoco hay dueño: la próxima cuenta empieza de cero.
  await resetSyncState()
}
