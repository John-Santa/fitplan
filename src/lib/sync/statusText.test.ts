import { describe, expect, it } from 'vitest'
import { OFFLINE_TEXT, restoreHint, syncStatusLines, wipeConfirmTexts } from './statusText'

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
