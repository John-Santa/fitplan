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
