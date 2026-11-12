// "Borrar dispositivo": nothing of the previous user may remain in IndexedDB
// (fitplan + magnifit-sync) or localStorage.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installMemoryIdb } from '../../../lib/testing/memoryIdb'

function memoryLocalStorage() {
  const rows = new Map<string, string>()
  return {
    rows,
    getItem: (k: string) => rows.get(k) ?? null,
    setItem: (k: string, v: string) => void rows.set(k, v),
    removeItem: (k: string) => void rows.delete(k),
  }
}

const session = {
  id: 's1', kind: 'strength', routineId: 'dia1', date: '2026-09-01', startedAt: 1, finishedAt: 2, notes: '',
  sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 10, done: true }],
}

async function fresh() {
  vi.resetModules()
  const idb = installMemoryIdb()
  const storage = memoryLocalStorage()
  vi.stubGlobal('localStorage', storage)
  const db = await import('../../../lib/db')
  const sdb = await import('../../sync/lib/syncDb')
  const erase = await import('./eraseDevice')
  // A signed-in user with data, a pending change, a rejected one, the sync
  // owner, the pre-bootstrap copy and a workout in progress.
  await db.saveSession(session as never)
  await db.saveMeasurement({ date: '2026-09-01', weightKg: 80 } as never)
  await db.saveExerciseMeta({ exerciseId: 'leg-press', note: 'x' } as never)
  await db.saveLastBackupAt(5)
  await sdb.enqueueUpsert('session', 's1', session)
  await sdb.rejectOutboxEntry({ entity: 'measurement', key: 'k', body: {}, updatedAt: 1, deletedAt: null }, 'bad')
  await sdb.updateMeta({ userId: 'user_A', cursor: 7 })
  await sdb.savePreBootstrapBackup(await db.exportBackup())
  storage.setItem('fitplan:active-session', JSON.stringify({ ...session, finishedAt: null }))
  return { db, sdb, erase, idb, storage }
}

afterEach(() => vi.unstubAllGlobals())

describe('eraseDevice', () => {
  it('leaves no data of the previous user in IndexedDB nor in localStorage', async () => {
    const { erase, idb, storage } = await fresh()
    await erase.eraseDevice()
    for (const [store, dbName] of [
      ['sessions', 'fitplan'], ['measurements', 'fitplan'], ['exerciseMeta', 'fitplan'], ['config', 'fitplan'],
      ['outbox', 'magnifit-sync'], ['meta', 'magnifit-sync'], ['rejected', 'magnifit-sync'],
    ] as const) {
      expect([store, idb.dump(store, dbName).size]).toEqual([store, 0])
    }
    expect(storage.rows.size).toBe(0)
  })

  it('lets the next account start from zero (no sync owner left behind)', async () => {
    const { erase, sdb } = await fresh()
    await erase.eraseDevice()
    expect((await sdb.getMeta()).userId).toBeNull()
    expect(await sdb.getOutbox()).toEqual([])
  })
})

describe('exportAndEraseDevice', () => {
  it('hands the backup to the download before erasing, then erases', async () => {
    const { erase, db } = await fresh()
    let downloaded: { sessions: unknown[] } | null = null
    await erase.exportAndEraseDevice(async b => {
      downloaded = b as never
      // At download time the data must still be there.
      expect((await db.getSessions()).sessions).toHaveLength(1)
    })
    expect(downloaded!.sessions).toHaveLength(1)
    expect((await db.getSessions()).sessions).toHaveLength(0)
  })

  it('does not erase anything when the export fails', async () => {
    const { erase, db } = await fresh()
    await expect(erase.exportAndEraseDevice(() => { throw new Error('download blocked') })).rejects.toThrow('download blocked')
    expect((await db.getSessions()).sessions).toHaveLength(1)
  })
})
