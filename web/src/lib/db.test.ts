// Pruebas de la compuerta de version de respaldo (F1-3). checkBackupVersion
// es una funcion pura que no abre IndexedDB, extraida a proposito para que
// sea testeable aca sin un mock del navegador. Importar './db' en el
// entorno 'node' de vitest es seguro: ninguna de las funciones que se
// ejercitan en este archivo llama a `indexedDB.open`.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Session } from './types'
import { checkBackupVersion, mergeMeasurement } from './db'
import { normalizeSession } from './plan'
import { installMemoryIdb } from './testing/memoryIdb'

describe('checkBackupVersion', () => {
  it('acepta la version 1 (respaldos de antes del motor de disciplinas)', () => {
    expect(() => checkBackupVersion(1)).not.toThrow()
  })

  it('acepta la version 2 (respaldos con disciplinas, sin plan)', () => {
    expect(() => checkBackupVersion(2)).not.toThrow()
  })

  it('acepta la version 3 (CURRENT_BACKUP_VERSION, con plan)', () => {
    expect(() => checkBackupVersion(3)).not.toThrow()
  })

  it('rechaza una version mayor a la actual con un mensaje real, no generico', () => {
    expect(() => checkBackupVersion(4)).toThrow(/versión más nueva de MagniFit/)
  })

  it('trata version ausente, no numerica, fraccionaria o menor a 1 como "no es un respaldo"', () => {
    expect(() => checkBackupVersion(undefined)).toThrow(/no es un respaldo de MagniFit/)
    expect(() => checkBackupVersion('2')).toThrow(/no es un respaldo de MagniFit/)
    expect(() => checkBackupVersion(0)).toThrow(/no es un respaldo de MagniFit/)
    expect(() => checkBackupVersion(1.5)).toThrow(/no es un respaldo de MagniFit/)
  })
})

describe('importar un respaldo v1', () => {
  it('version 1 pasa la compuerta y sus sesiones (sin kind) normalizan a StrengthSession', () => {
    expect(() => checkBackupVersion(1)).not.toThrow()
    const v1Sessions = [
      {
        id: 'dia1-1',
        routineId: 'dia1',
        date: '2026-08-04',
        startedAt: 1,
        finishedAt: 2,
        sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 12, done: true }],
        notes: '',
      },
    ]
    const normalized = v1Sessions.map(normalizeSession).filter((s): s is Session => s !== null)
    expect(normalized).toHaveLength(1)
    expect(normalized[0].kind).toBe('strength')
  })
})

/** Minimal localStorage double: the vitest environment is 'node'. */
function memoryLocalStorage() {
  const rows = new Map<string, string>()
  return {
    rows,
    getItem: (k: string) => rows.get(k) ?? null,
    setItem: (k: string, v: string) => void rows.set(k, v),
    removeItem: (k: string) => void rows.delete(k),
  }
}

const strengthSession = {
  id: 's1', kind: 'strength', routineId: 'dia1', date: '2026-09-01', startedAt: 1, finishedAt: 2, notes: '',
  sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 10, done: true }],
}

/** Fresh modules and an empty in-memory IndexedDB (db.ts keeps its connection
 *  in a module variable). */
async function freshDb() {
  vi.resetModules()
  const idb = installMemoryIdb()
  const storage = memoryLocalStorage()
  vi.stubGlobal('localStorage', storage)
  const db = await import('./db')
  return { db, idb, storage }
}

afterEach(() => vi.unstubAllGlobals())

describe('wipeAll', () => {
  async function seeded() {
    const ctx = await freshDb()
    await ctx.db.saveSession(strengthSession as never)
    await ctx.db.saveMeasurement({ date: '2026-09-01', weightKg: 80 } as never)
    await ctx.db.saveExerciseMeta({ exerciseId: 'leg-press', note: 'x' } as never)
    await ctx.db.saveLastBackupAt(5)
    return ctx
  }

  it('keeps emptying every store of the fitplan database', async () => {
    const { db, idb } = await seeded()
    await db.wipeAll()
    for (const store of ['sessions', 'measurements', 'exerciseMeta', 'config']) {
      expect(idb.dump(store).size).toBe(0)
    }
  })

  it('also removes the active session draft from localStorage', async () => {
    const { db, storage } = await seeded()
    storage.setItem('fitplan:active-session', JSON.stringify({ ...strengthSession, finishedAt: null }))
    await db.wipeAll()
    expect(storage.getItem('fitplan:active-session')).toBeNull()
  })
})

describe('resolveStoredPlan', () => {
  it('a readable plan is used as is and is not reported as damaged', async () => {
    const { db } = await freshDb()
    const { DEFAULT_PLAN } = await import('./defaultPlan')
    const out = db.resolveStoredPlan(structuredClone(DEFAULT_PLAN))
    expect(out.damaged).toBe(false)
    expect(out.plan.id).toBe(DEFAULT_PLAN.id)
  })

  it('a plan that was never saved falls back to the default without a notice', async () => {
    const { db } = await freshDb()
    const out = db.resolveStoredPlan(undefined)
    expect(out.damaged).toBe(false)
    expect(out.plan.routines.length).toBeGreaterThan(0)
  })

  it('a stored plan that cannot be read falls back to the default and is reported as damaged', async () => {
    const { db } = await freshDb()
    for (const raw of [{ garbage: true }, 'x', 42, null, { schemaVersion: 1 }]) {
      const out = db.resolveStoredPlan(raw)
      expect([raw, out.damaged]).toEqual([raw, true])
      expect(out.plan.routines.length).toBeGreaterThan(0)
    }
  })
})

describe('importBackup', () => {
  const backup = (over: Record<string, unknown> = {}) => ({
    app: 'fitplan', version: 3, exportedAt: '2026-10-01T00:00:00.000Z',
    sessions: [{ ...strengthSession, id: 'new-1' }, { ...strengthSession, id: 'new-2' }],
    measurements: [{ date: '2026-10-01', weightKg: 79 }],
    exerciseMeta: [{ exerciseId: 'leg-press', note: 'new' }],
    config: null,
    ...over,
  })

  async function withOldData() {
    const ctx = await freshDb()
    await ctx.db.saveSession({ ...strengthSession, id: 'old-1' } as never)
    await ctx.db.saveMeasurement({ date: '2026-09-01', weightKg: 80 } as never)
    await ctx.db.saveExerciseMeta({ exerciseId: 'bench', note: 'old' } as never)
    return ctx
  }

  it('replace swaps the stores for the backup content', async () => {
    const { db } = await withOldData()
    await db.importBackup(backup(), 'replace')
    expect((await db.getSessions()).sessions.map(s => s.id).sort()).toEqual(['new-1', 'new-2'])
    expect((await db.getMeasurements()).map(m => m.date)).toEqual(['2026-10-01'])
    expect((await db.getExerciseMeta()).map(m => m.exerciseId)).toEqual(['leg-press'])
  })

  it('merge adds the backup content and keeps what was there', async () => {
    const { db } = await withOldData()
    await db.importBackup(backup(), 'merge')
    expect((await db.getSessions()).sessions.map(s => s.id).sort()).toEqual(['new-1', 'new-2', 'old-1'])
    expect((await db.getMeasurements()).map(m => m.date)).toEqual(['2026-09-01', '2026-10-01'])
  })

  it('rejects a file that is not a backup before touching anything', async () => {
    const { db } = await withOldData()
    await expect(db.importBackup({ app: 'other' }, 'replace')).rejects.toThrow(/no es un respaldo de MagniFit/)
    expect((await db.getSessions()).sessions.map(s => s.id)).toEqual(['old-1'])
  })

  it('is all or nothing: a write that fails halfway leaves the previous data intact', async () => {
    const { db, idb } = await withOldData()
    idb.failPuts((store, key) => store === 'exerciseMeta' && key === 'leg-press')
    await expect(db.importBackup(backup(), 'replace')).rejects.toThrow()
    idb.failPuts(null)
    expect((await db.getSessions()).sessions.map(s => s.id)).toEqual(['old-1'])
    expect((await db.getMeasurements()).map(m => m.date)).toEqual(['2026-09-01'])
    expect((await db.getExerciseMeta()).map(m => m.exerciseId)).toEqual(['bench'])
  })

  it('is all or nothing for the config too: if it fails, no session of the backup is stored', async () => {
    const { db, idb } = await withOldData()
    const { DEFAULT_CONFIG } = await import('./plan')
    idb.failPuts((store, key) => store === 'config' && key === 'config')
    await expect(db.importBackup(backup({ config: structuredClone(DEFAULT_CONFIG) }), 'merge')).rejects.toThrow()
    idb.failPuts(null)
    expect((await db.getSessions()).sessions.map(s => s.id)).toEqual(['old-1'])
  })
})

describe('mergeMeasurement', () => {
  it('keeps the stored fields the patch does not carry and takes the ones it does', () => {
    const stored = { date: '2026-11-12', weight: 80, fatPct: 20, waist: 90 }
    expect(mergeMeasurement(stored, { date: '2026-11-12', weight: 79, waist: 89 })).toEqual({
      date: '2026-11-12', weight: 79, fatPct: 20, waist: 89,
    })
  })

  it('returns the patch as it is when nothing is stored for the date, and does not mutate the stored row', () => {
    expect(mergeMeasurement(undefined, { date: '2026-11-12', weight: 79 })).toEqual({ date: '2026-11-12', weight: 79 })
    const stored = { date: '2026-11-12', weight: 80, fatPct: 20 }
    mergeMeasurement(stored, { date: '2026-11-12', weight: 79 })
    expect(stored).toEqual({ date: '2026-11-12', weight: 80, fatPct: 20 })
  })
})

describe('getSessions order', () => {
  it('lists the newest first by session date, so a session logged late for an earlier day sits on that day', async () => {
    const { db } = await freshDb()
    const at = (date: string, time: string) => Date.parse(`${date}T${time}`)
    const day = (id: string, date: string, startedAt: number) =>
      db.saveSession({ ...strengthSession, id, date, startedAt, finishedAt: startedAt + 1 } as never)
    await day('nov-9', '2026-11-09', at('2026-11-09', '10:00:00'))
    await day('nov-2-late', '2026-11-02', at('2026-11-10', '09:00:00')) // typed in on the 10th
    await day('nov-9-pm', '2026-11-09', at('2026-11-09', '19:00:00'))
    expect((await db.getSessions()).sessions.map(s => s.id)).toEqual(['nov-9-pm', 'nov-9', 'nov-2-late'])
  })
})
