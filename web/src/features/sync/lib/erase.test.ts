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

/** Cache Storage with only what the erase uses (open, put, delete). */
function stubCaches() {
  const names = new Map<string, Map<string, unknown>>()
  vi.stubGlobal('caches', {
    open: async (name: string) => {
      if (!names.has(name)) names.set(name, new Map())
      const entries = names.get(name)!
      return { put: async (k: string, v: unknown) => void entries.set(k, v) }
    },
    delete: async (name: string) => names.delete(name),
    has: async (name: string) => names.has(name),
  })
  return names
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
  const cacheStorage = stubCaches()
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
  // Reminders: the per-device prefs in localStorage and the schedule (routine
  // titles and times) the page hands to the service worker in Cache Storage.
  const { REMINDER_PREFS_KEY, saveReminderPrefs } = await import('../../reminders/lib/prefs')
  const { REMINDERS_CACHE } = await import('../../reminders/lib/background')
  saveReminderPrefs({ enabled: true, lastFired: '2026-09-01:dia1' })
  await (await caches.open(REMINDERS_CACHE)).put('reminders-schedule.json', new Response(JSON.stringify({ reminders: [{ title: 'Día 1' }] })))
  // The discipline selected on this device (S1, D3-A).
  const { DISCIPLINE_STORAGE_KEY, writeStoredDiscipline } = await import('../../../lib/disciplineSelection')
  writeStoredDiscipline('swim')
  for (const [store, dbName] of STORES) expect([store, idb.dump(store, dbName).size > 0]).toEqual([store, true])
  expect([...ls.keys()].sort()).toEqual(['fitplan:active-session', REMINDER_PREFS_KEY, DISCIPLINE_STORAGE_KEY].sort())
  expect(cacheStorage.has(REMINDERS_CACHE)).toBe(true)
  return { idb, ls, sdb, cacheStorage }
}

function expectErased({ idb, ls, cacheStorage }: {
  idb: ReturnType<typeof installMemoryIdb>
  ls: Map<string, string>
  cacheStorage: Map<string, unknown>
}) {
  for (const [store, dbName] of STORES) expect([store, idb.dump(store, dbName).size]).toEqual([store, 0])
  expect([...ls.keys()]).toEqual([])
  expect([...cacheStorage.keys()]).toEqual([])
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
describe('eraseLocalCopy without Cache Storage', () => {
  it('still erases everything else and never throws', async () => {
    const device = await seededDevice()
    vi.stubGlobal('caches', undefined)
    const { eraseLocalCopy } = await import('./erase')

    await expect(eraseLocalCopy()).resolves.toBeUndefined()

    for (const [store, dbName] of STORES) expect([store, device.idb.dump(store, dbName).size]).toEqual([store, 0])
    expect([...device.ls.keys()]).toEqual([])
  })

  it('does not throw when Cache Storage rejects', async () => {
    await seededDevice()
    vi.stubGlobal('caches', { delete: async () => { throw new Error('SecurityError') } })
    const { eraseLocalCopy } = await import('./erase')
    await expect(eraseLocalCopy()).resolves.toBeUndefined()
  })
})

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
