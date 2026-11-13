// Local boot of StoreProvider (prepareLocalData) over an in-memory IndexedDB.
// The provider runs exactly this function on mount; the vitest environment is
// 'node', so the effect itself is not rendered here.
import { describe, expect, it, vi } from 'vitest'
import type { Config } from './types'
import { installMemoryIdb, type MemoryIdb } from './testing/memoryIdb'

let idb: MemoryIdb

async function fresh() {
  vi.resetModules()
  idb = installMemoryIdb()
  const db = await import('./db')
  const store = await import('./store')
  const plan = await import('./plan')
  return { db, store, plan }
}

describe('first open without a stored config', () => {
  it('writes neither DEFAULT_CONFIG nor BASELINE until the welcome finishes', async () => {
    const { store, db, plan } = await fresh()
    const result = await store.prepareLocalData()

    expect(result.needsOnboarding).toBe(true)
    expect(await db.getConfig()).toBeUndefined()
    expect(await db.getPlan()).toBeUndefined()
    expect(idb.dump('measurements', 'fitplan').size).toBe(0)
    expect(idb.dump('measurements', 'fitplan').has(plan.BASELINE.date)).toBe(false)
    // Opening again before finishing still writes nothing.
    expect((await store.prepareLocalData()).needsOnboarding).toBe(true)
    expect(await db.getConfig()).toBeUndefined()
  })
})

describe('existing install (config already stored)', () => {
  it('never needs the welcome', async () => {
    const { store, db, plan } = await fresh()
    await db.saveConfig(plan.DEFAULT_CONFIG)
    expect((await store.prepareLocalData()).needsOnboarding).toBe(false)
  })

  it('keeps completing an older config and running the plan migration as before', async () => {
    const { store, db, plan } = await fresh()
    // Older config: no intentions or check-ins, and the pre-plan block start.
    const older = structuredClone({ ...plan.DEFAULT_CONFIG, blockStart: '2026-08-04', blockEnd: '2026-09-28' }) as Partial<Config>
    delete older.intentions
    delete older.habitCheckIns
    await db.saveConfig(older as Config)
    await db.saveMeasurement({ date: '2026-09-01', weight: 80 })

    await store.prepareLocalData()

    const stored = (await db.getConfig()) as Config
    expect(stored.intentions).toHaveLength(7)
    expect(stored.habitCheckIns).toEqual([])
    expect(stored.blockStart).toBe('2026-11-16')
    expect(stored.heightCm).toBe(plan.DEFAULT_CONFIG.heightCm)
    expect((await db.getPlan()) as { id: string }).toMatchObject({ id: 'espalda-protegida' })
    expect([...idb.dump('measurements', 'fitplan').keys()]).toEqual(['2026-09-01'])
  })

  it('leaves an already current config byte-for-byte unchanged', async () => {
    const { store, db, plan } = await fresh()
    await db.saveConfig(plan.DEFAULT_CONFIG)
    await store.prepareLocalData()
    const first = JSON.stringify(await db.getConfig())
    await store.prepareLocalData()
    expect(JSON.stringify(await db.getConfig())).toBe(first)
  })
})

// S10: booting today's data (no disciplines, no swimWeeklyTarget) changes no
// existing stored record and queues nothing for sync. D2-A is stored once,
// locally, while the raw config still shows it has no list.
describe("boot with today's IndexedDB data", () => {
  async function todaysDevice(withSwim: boolean) {
    const { store, db, plan } = await fresh()
    const local = await import('../features/sync/lib/localWrites')
    const sdb = await import('../features/sync/lib/syncDb')
    local.setTrackingForTests(true)
    const { DEFAULT_PLAN } = await import('./defaultPlan')
    const todays = structuredClone(plan.DEFAULT_CONFIG) as Partial<Config>
    delete todays.disciplines
    delete todays.swimWeeklyTarget
    await db.saveConfig(todays as Config)
    await db.savePlan(DEFAULT_PLAN)
    await db.saveSession({ id: 'g1', kind: 'strength', routineId: 'dia1', date: '2026-11-10', startedAt: 1, finishedAt: 2, notes: '', sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 10, done: true }] })
    if (withSwim) await db.saveSession({ id: 's1', kind: 'swim', date: '2026-11-11', startedAt: 3, finishedAt: 4, notes: '', poolLengthM: 25, blocks: [{ index: 0, stroke: 'free', distanceM: 100, timeSec: 120, done: true }] } as never)
    await db.saveMeasurement({ date: '2026-11-01', weight: 80 })
    return { store, db, local, sdb, todays }
  }
  const snapshot = (name: string) => JSON.stringify([...idb.dump(name, 'fitplan').entries()])

  it('with a swim session: stores ["strength", "swim"] locally, queues no outbox entry and keeps every other record byte-identical', async () => {
    const { store, db, local, sdb, todays } = await todaysDevice(true)
    const before = { sessions: snapshot('sessions'), measurements: snapshot('measurements'), plan: JSON.stringify(await db.getPlan()) }

    await store.prepareLocalData()

    expect(snapshot('sessions')).toBe(before.sessions)
    expect(snapshot('measurements')).toBe(before.measurements)
    expect(JSON.stringify(await db.getPlan())).toBe(before.plan)
    const stored = structuredClone(await db.getConfig()) as Partial<Config>
    expect(stored.disciplines).toEqual(['strength', 'swim'])
    expect(stored.swimWeeklyTarget).toBe(2)
    delete stored.disciplines
    delete stored.swimWeeklyTarget
    expect(JSON.stringify(stored)).toBe(JSON.stringify(todays))
    expect(await sdb.getOutbox()).toEqual([])
    local.setTrackingForTests(false)
  })

  it('gym only: stores ["strength"]', async () => {
    const { store, db, local } = await todaysDevice(false)
    await store.prepareLocalData()
    expect((await db.getConfig())?.disciplines).toEqual(['strength'])
    local.setTrackingForTests(false)
  })

  it('runs once: a list stored after it (Natación hidden) survives the next boot', async () => {
    const { store, db, local, sdb } = await todaysDevice(true)
    await store.prepareLocalData()
    await db.saveConfig({ ...(await db.getConfig())!, disciplines: ['strength'] })
    const first = JSON.stringify(await db.getConfig())
    await store.prepareLocalData()
    expect(JSON.stringify(await db.getConfig())).toBe(first)
    expect(await sdb.getOutbox()).toEqual([])
    local.setTrackingForTests(false)
  })
})

describe('restoring a backup from the welcome', () => {
  it('a backup with a config ends the welcome with the restored data', async () => {
    const { store, db, plan } = await fresh()
    expect((await store.prepareLocalData()).needsOnboarding).toBe(true)
    const config = { ...plan.DEFAULT_CONFIG, heightCm: 181 }
    await db.importBackup({
      app: 'fitplan', version: 2, exportedAt: '', sessions: [],
      measurements: [{ date: '2026-10-01', weight: 70 }], exerciseMeta: [], config,
    })

    expect((await store.prepareLocalData()).needsOnboarding).toBe(false)
    expect(((await db.getConfig()) as Config).heightCm).toBe(181)
    expect((await db.getPlan()) as { id: string }).toMatchObject({ id: 'espalda-protegida' })
    expect([...idb.dump('measurements', 'fitplan').keys()]).toEqual(['2026-10-01'])
  })
})
