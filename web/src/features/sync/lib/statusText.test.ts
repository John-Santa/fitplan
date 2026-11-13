import { describe, expect, it } from 'vitest'
import { AUTH_EXPIRED_TEXT, CONNECTING_TEXT, OFFLINE_TEXT, rejectedLabel, shellIndicator, restoreHint, syncStatusLines, wipeConfirmTexts } from './statusText'

const base = { state: 'idle' as const, pending: 0, lastSyncAt: null, lastError: null, rejected: 0, rejectedError: null, backupAt: null }
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

  it('arranque en frío: "Conectando con el servidor…"', () => {
    expect(CONNECTING_TEXT).toBe('Conectando con el servidor…')
    expect(syncStatusLines({ ...base, state: 'connecting' }, NOW)).toEqual(['Conectando con el servidor…'])
  })

  it('sesión expirada: texto propio y la cola pendiente sigue contada', () => {
    expect(AUTH_EXPIRED_TEXT).toBe('Tu sesión expiró, vuelve a iniciar sesión')
    expect(syncStatusLines({ ...base, state: 'auth_expired', lastError: AUTH_EXPIRED_TEXT, pending: 2 }, NOW)).toEqual([
      'Tu sesión expiró, vuelve a iniciar sesión',
      '2 cambios pendientes',
    ])
  })

  it('cuenta los cambios que el servidor rechazó, con el primer error', () => {
    expect(syncStatusLines({ ...base, lastSyncAt: NOW, rejected: 2, rejectedError: 'body contains NUL' }, NOW)).toEqual([
      'Sincronizado hace un momento',
      '2 cambios no se pudieron subir: body contains NUL',
    ])
    expect(syncStatusLines({ ...base, rejected: 1, rejectedError: 'x' }, NOW)).toContain('1 cambio no se pudo subir: x')
  })
})

describe('textos de restaurar y borrar', () => {
  it('con sesión iniciada, restaurar combina con la cuenta', () => {
    expect(restoreHint(true)).toBe('Se restaurará el respaldo en este teléfono y se combinará con tu cuenta; no se borra nada de la nube.')
    expect(restoreHint(false)).toBe('Restaurar reemplaza todo lo que haya en este dispositivo.')
  })

  it('con sesión iniciada, borrar avisa que la cuenta conserva los datos', () => {
    const [first] = wipeConfirmTexts(true)
    expect(first).toContain('de este teléfono')
    expect(first).toContain('Tu cuenta las conserva')
    expect(wipeConfirmTexts(false)).toEqual([
      'Esto borra todas las sesiones y mediciones de este dispositivo. ¿Seguro?',
      'Última confirmación: no hay forma de deshacerlo sin un respaldo.',
    ])
  })
})

describe('rejectedLabel', () => {
  it('nombra cada tipo de registro rechazado', () => {
    expect(rejectedLabel({ entity: 'session', key: 'abc', body: { date: '2026-11-01' } })).toBe('Sesión del 2026-11-01')
    expect(rejectedLabel({ entity: 'session', key: 'abc', body: null })).toBe('Sesión del abc')
    expect(rejectedLabel({ entity: 'measurement', key: '2026-10-05', body: {} })).toBe('Medición del 2026-10-05')
    expect(rejectedLabel({ entity: 'document', key: 'plan', body: {} })).toBe('Plan de entrenamiento')
    expect(rejectedLabel({ entity: 'document', key: 'config', body: {} })).toBe('Configuración')
    expect(rejectedLabel({ entity: 'exerciseMeta', key: 'leg-press', body: {} })).toBe('Notas de un ejercicio')
  })
})

describe('shellIndicator', () => {
  it('un estado, un texto y un tono', () => {
    expect(shellIndicator({ ...base, lastSyncAt: NOW })).toEqual({ tone: 'ok', label: 'Sincronizado' })
    expect(shellIndicator({ ...base, state: 'syncing' })).toEqual({ tone: 'busy', label: 'Sincronizando…' })
    expect(shellIndicator({ ...base, state: 'connecting' })).toEqual({ tone: 'busy', label: 'Conectando con el servidor…' })
    expect(shellIndicator({ ...base, state: 'offline' })).toEqual({ tone: 'warn', label: 'Sin conexión' })
    expect(shellIndicator({ ...base, state: 'offline', pending: 2 })).toEqual({ tone: 'warn', label: 'Sin conexión · 2 cambios pendientes' })
    expect(shellIndicator({ ...base, state: 'auth_expired' })).toEqual({ tone: 'alert', label: 'Tu sesión expiró, vuelve a iniciar sesión' })
    expect(shellIndicator({ ...base, state: 'blocked' }).tone).toBe('alert')
    expect(shellIndicator({ ...base, state: 'error' })).toEqual({ tone: 'alert', label: 'No se pudo sincronizar' })
  })

  it('en reposo avisa de lo pendiente y de lo rechazado', () => {
    expect(shellIndicator({ ...base, pending: 1 })).toEqual({ tone: 'warn', label: '1 cambio pendiente' })
    expect(shellIndicator({ ...base, rejected: 2 })).toEqual({ tone: 'warn', label: '2 cambios no se pudieron subir' })
  })
})
