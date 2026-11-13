import { describe, expect, it } from 'vitest'
import { reminderMessage } from './notify'

describe('reminderMessage', () => {
  it('names the time and the place', () => {
    expect(reminderMessage({ key: 'k', date: '2026-11-09', time: '07:30', place: 'Gym', at: 0 })).toEqual({
      title: 'Hora de entrenar',
      body: 'Hoy entrenas a las 07:30 · Gym. Aún no registraste tu sesión.',
    })
  })

  it('omits the place when it is empty', () => {
    expect(reminderMessage({ key: 'k', date: '2026-11-09', time: '18:00', place: '', at: 0 }).body)
      .toBe('Hoy entrenas a las 18:00. Aún no registraste tu sesión.')
  })
})
