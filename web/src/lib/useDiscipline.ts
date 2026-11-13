import { useContext } from 'react'
import { DisciplineCtx } from './store'
import type { DisciplineApi } from './disciplineSelection'

export type { DisciplineApi } from './disciplineSelection'

/** The user's disciplines and the selected one (S1):
 *  `{ active, list, select, add, hide }`. The state lives in StoreProvider,
 *  so a `select` re-renders every screen that reads it. `select` writes only
 *  this device's localStorage; `add` and `hide` save Config through the
 *  store's saveConfig (synced). */
export function useDiscipline(): DisciplineApi {
  const d = useContext(DisciplineCtx)
  if (!d) throw new Error('useDiscipline fuera de StoreProvider')
  return d
}
