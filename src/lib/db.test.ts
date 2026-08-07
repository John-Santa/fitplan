// Pruebas de la compuerta de version de respaldo (F1-3). checkBackupVersion
// es una funcion pura que no abre IndexedDB, extraida a proposito para que
// sea testeable aca sin un mock del navegador. Importar './db' en el
// entorno 'node' de vitest es seguro: ninguna de las funciones que se
// ejercitan en este archivo llama a `indexedDB.open`.
import { describe, expect, it } from 'vitest'
import type { Session } from '../types'
import { checkBackupVersion } from './db'
import { normalizeSession } from './plan'

describe('checkBackupVersion', () => {
  it('acepta la version 1 (respaldos de antes del motor de disciplinas)', () => {
    expect(() => checkBackupVersion(1)).not.toThrow()
  })

  it('acepta la version 2 (CURRENT_BACKUP_VERSION)', () => {
    expect(() => checkBackupVersion(2)).not.toThrow()
  })

  it('rechaza una version mayor a la actual con un mensaje real, no generico', () => {
    expect(() => checkBackupVersion(3)).toThrow(/versión más nueva de FitPlan/)
  })

  it('trata version ausente, no numerica, fraccionaria o menor a 1 como "no es un respaldo"', () => {
    expect(() => checkBackupVersion(undefined)).toThrow(/no es un respaldo de FitPlan/)
    expect(() => checkBackupVersion('2')).toThrow(/no es un respaldo de FitPlan/)
    expect(() => checkBackupVersion(0)).toThrow(/no es un respaldo de FitPlan/)
    expect(() => checkBackupVersion(1.5)).toThrow(/no es un respaldo de FitPlan/)
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
