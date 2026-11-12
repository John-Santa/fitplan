import { describe, expect, it } from 'vitest'
import { buildSchedule } from './background'

describe('buildSchedule', () => {
  it('serializes upcoming reminders with the message the worker will show', () => {
    const out = buildSchedule([{ key: '2026-11-09@07:30', date: '2026-11-09', time: '07:30', place: 'Gym', at: 123 }], '/icon.png', '/app/')
    expect(out).toEqual({
      reminders: [{
        key: '2026-11-09@07:30',
        at: 123,
        title: 'Hora de entrenar',
        body: 'Hoy entrenas a las 07:30 · Gym. Aún no registraste tu sesión.',
        icon: '/icon.png',
        url: '/app/',
      }],
    })
  })

  it('is empty without reminders', () => {
    expect(buildSchedule([], '/i.png', '/')).toEqual({ reminders: [] })
  })
})
