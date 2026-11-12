// Pruebas de la compuerta de version de respaldo (F1-3). checkBackupVersion
// es una funcion pura que no abre IndexedDB, extraida a proposito para que
// sea testeable aca sin un mock del navegador. Importar './db' en el
// entorno 'node' de vitest es seguro: ninguna de las funciones que se
// ejercitan en este archivo llama a `indexedDB.open`.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Session } from './types'
import { checkBackupVersion } from './db'
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
