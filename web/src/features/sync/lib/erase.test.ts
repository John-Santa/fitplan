import { afterEach, describe, expect, it, vi } from 'vitest'
import { installMemoryIdb } from '../../../lib/testing/memoryIdb'

function stubLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  })
  return store
}

afterEach(() => vi.unstubAllGlobals())

const session = {
  id: 's1', kind: 'strength', routineId: 'dia1', date: '2026-09-01', startedAt: 1, finishedAt: 2, notes: '',
  sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 10, done: true }],
}

const STORES = [
  ['sessions', 'fitplan'], ['measurements', 'fitplan'], ['exerciseMeta', 'fitplan'], ['config', 'fitplan'],
  ['outbox', 'magnifit-sync'], ['meta', 'magnifit-sync'], ['rejected', 'magnifit-sync'],
] as const

/** A signed-in device with data in every store, the config-merge state
 *  (base, last pushed stamp, conflict notice) and a workout in progress. */
async function seededDevice() {
  vi.resetModules()
  const idb = installMemoryIdb()
  const ls = stubLocalStorage()
  const db = await import('../../../lib/db')
  const sdb = await import('./syncDb')
  const { saveActiveDraft } = await import('../../session/lib/activeSession')
  await db.saveSession(session as never)
  await db.saveMeasurement({ date: '2026-09-01', weightKg: 80 } as never)
  await db.saveExerciseMeta({ exerciseId: 'leg-press', note: 'x' } as never)
  await db.saveLastBackupAt(5)
  await sdb.enqueueUpsert('session', 's1', session)
  await sdb.rejectOutboxEntry({ entity: 'measurement', key: 'k', body: {}, updatedAt: 1, deletedAt: null }, 'bad')
  await sdb.updateMeta({ userId: 'user_A', cursor: 7 })
  await sdb.savePreBootstrapBackup(await db.exportBackup())
  await sdb.saveConfigBase({ heightCm: 180 })
  await sdb.saveConfigPushedAt(42)
  await sdb.addConfigConflict(['heightCm'])
  saveActiveDraft({ ...session, finishedAt: null } as never)
  for (const [store, dbName] of STORES) expect([store, idb.dump(store, dbName).size > 0]).toEqual([store, true])
  expect(ls.size).toBe(1)
  return { idb, ls, sdb }
}

function expectErased({ idb, ls }: { idb: ReturnType<typeof installMemoryIdb>; ls: Map<string, string> }) {
  for (const [store, dbName] of STORES) expect([store, idb.dump(store, dbName).size]).toEqual([store, 0])
  expect(ls.size).toBe(0)
}

describe('eraseLocalCopy', () => {
  it('also removes the in-progress workout draft, so it does not reopen after a reload', async () => {
    vi.resetModules()
    installMemoryIdb()
    const ls = stubLocalStorage()
    const { saveActiveDraft, loadActiveDraft } = await import('../../session/lib/activeSession')
    const { eraseLocalCopy } = await import('./erase')
    saveActiveDraft({ id: 'draft', startedAt: Date.now(), finishedAt: null } as never)
    expect(ls.size).toBe(1)

    await eraseLocalCopy()

    expect(loadActiveDraft()).toBeNull()
    expect(ls.size).toBe(0)
  })

  it('empties every fitplan and magnifit-sync store, the config-merge state included', async () => {
    const device = await seededDevice()
    const { eraseLocalCopy } = await import('./erase')

    await eraseLocalCopy()

    expectErased(device)
    expect(await device.sdb.getConfigBase()).toBeUndefined()
    expect(await device.sdb.getConfigPushedAt()).toBeUndefined()
    expect(await device.sdb.getConfigConflict()).toBeUndefined()
  })
})

// The three ways to erase the device ("Borrar dispositivo", the danger zone and
// the 410 answer of the API) run the same helper, so none of them can forget a
// store the others clear.
describe('one erase helper for every erase path', () => {
  it('"Borrar dispositivo" (eraseDevice) erases exactly what eraseLocalCopy erases', async () => {
    const device = await seededDevice()
    const erase = await import('./erase')
    const spy = vi.spyOn(erase, 'eraseLocalCopy')
    const { eraseDevice } = await import('../../account/lib/eraseDevice')

    await eraseDevice()

    expect(spy).toHaveBeenCalledTimes(1)
    expectErased(device)
  })
})
