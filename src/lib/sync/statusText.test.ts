import { describe, expect, it } from 'vitest'
import { OFFLINE_TEXT, syncStatusLines } from './statusText'

const base = { state: 'idle' as const, pending: 0, lastSyncAt: null, lastError: null }
const NOW = 1_800_000_000_000

describe('syncStatusLines', () => {
  it('muestra hace cuánto se sincronizó', () => {
    expect(syncStatusLines({ ...base, lastSyncAt: NOW - 5 * 60_000 }, NOW)).toEqual(['Sincronizado hace 5 min'])
    expect(syncStatusLines({ ...base, lastSyncAt: NOW - 10_000 }, NOW)).toEqual(['Sincronizado hace un momento'])
    expect(syncStatusLines({ ...base, lastSyncAt: NOW - 2 * 86_400_000 }, NOW)).toEqual(['Sincronizado hace 2 días'])
  })

  it('cuenta los cambios pendientes', () => {
    expect(syncStatusLines({ ...base, lastSyncAt: NOW, pending: 3 }, NOW)).toEqual(['Sincronizado hace un momento', '3 cambios pendientes'])
    expect(syncStatusLines({ ...base, pending: 1 }, NOW)).toContain('1 cambio pendiente')
  })

  it('sin conexión y con error', () => {
    expect(syncStatusLines({ ...base, state: 'offline', lastError: 'Sin conexión', pending: 2 }, NOW)).toEqual([OFFLINE_TEXT, '2 cambios pendientes'])
    expect(OFFLINE_TEXT).toBe('Sin conexión: se sincroniza al volver la señal')
    expect(syncStatusLines({ ...base, state: 'blocked', lastError: 'Esta app tiene datos de otra cuenta.' }, NOW)).toEqual(['Esta app tiene datos de otra cuenta.'])
  })
})
