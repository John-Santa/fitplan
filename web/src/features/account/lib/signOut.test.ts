// Sign-out choices: sync what is pending first, warn about what would be
// lost, then either keep the data or erase the device.
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
  const out = await import('./signOut')
  await db.saveSession(session as never)
  await sdb.updateMeta({ userId: 'user_A' })
  storage.setItem('fitplan:active-session', JSON.stringify({ ...session, finishedAt: null }))
  return { db, sdb, out, idb, storage }
}

afterEach(() => vi.unstubAllGlobals())

describe('prepareSignOut', () => {
  it('does not touch the network when nothing is pending', async () => {
    const { out } = await fresh()
    const sync = vi.fn(async () => {})
    expect(await out.prepareSignOut(sync)).toEqual({ pending: 0 })
    expect(sync).not.toHaveBeenCalled()
  })

  it('syncs the pending changes first and reports none left when it works', async () => {
    const { out, sdb } = await fresh()
    await sdb.enqueueUpsert('session', 's1', session)
    await sdb.enqueueUpsert('measurement', '2026-09-01', { date: '2026-09-01' })
    const sync = vi.fn(async () => {
      for (const e of await sdb.getOutbox()) await sdb.removeOutboxEntry(e.entity, e.key)
    })
    expect(await out.prepareSignOut(sync)).toEqual({ pending: 0 })
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('offline: reports how many changes would be lost', async () => {
    const { out, sdb } = await fresh()
    await sdb.enqueueUpsert('session', 's1', session)
    await sdb.enqueueUpsert('measurement', '2026-09-01', { date: '2026-09-01' })
    expect(await out.prepareSignOut(async () => {})).toEqual({ pending: 2 })
  })
})

describe('signOutWarning', () => {
  it('words the number of changes that would be lost', async () => {
    const { out } = await fresh()
    expect(out.signOutWarning(0)).toBeNull()
    expect(out.signOutWarning(1)).toBe('1 cambio todavía no se sincronizó y se perderá si borras el dispositivo.')
    expect(out.signOutWarning(3)).toBe('3 cambios todavía no se sincronizaron y se perderán si borras el dispositivo.')
  })
})

describe('the two ways out', () => {
  it('"Mantener datos" signs out and leaves every piece of data in place', async () => {
    const { out, db, sdb, storage } = await fresh()
    const signOut = vi.fn(async () => {})
    await out.signOutKeepingData(signOut)
    expect(signOut).toHaveBeenCalledTimes(1)
    expect((await db.getSessions()).sessions).toHaveLength(1)
    expect((await sdb.getMeta()).userId).toBe('user_A')
    expect(storage.getItem('fitplan:active-session')).not.toBeNull()
  })

  it('"Borrar dispositivo" erases everything and signs out', async () => {
    const { out, db, sdb, storage } = await fresh()
    const order: string[] = []
    const signOut = vi.fn(async () => {
      order.push(`signOut sessions=${(await db.getSessions()).sessions.length}`)
    })
    await out.signOutErasingDevice(signOut)
    expect(order).toEqual(['signOut sessions=0'])
    expect((await sdb.getMeta()).userId).toBeNull()
    expect(storage.rows.size).toBe(0)
  })

  it('"Borrar dispositivo" does not sign out if the erase fails', async () => {
    const { out } = await fresh()
    const signOut = vi.fn(async () => {})
    await expect(out.signOutErasingDevice(signOut, async () => { throw new Error('idb down') })).rejects.toThrow('idb down')
    expect(signOut).not.toHaveBeenCalled()
  })
})
