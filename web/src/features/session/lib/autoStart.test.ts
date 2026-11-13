// Pins the session that a start from Hoy opens on the Train screen: a gym
// routine (optionally minimal or for a past date) or a swim (S5, "Nadar").
import { describe, expect, it } from 'vitest'
import { autoStartSession } from './autoStart'

describe('autoStartSession', () => {
  it('opens nothing when Hoy asked for no start', () => {
    expect(autoStartSession({}, '2026-11-13', 25)).toBeNull()
  })

  it('opens a gym session for the routine, on the given date and minimal when asked', () => {
    const s = autoStartSession({ routineId: 'dia1', date: '2026-11-10', minimal: true }, '2026-11-13', 25)
    expect(s?.kind).toBe('strength')
    expect(s && s.kind === 'strength' ? [s.routineId, s.date, s.minimal] : null).toEqual(['dia1', '2026-11-10', true])
  })

  it('opens a swim session for today with the pool length when Hoy pressed "Nadar"', () => {
    const s = autoStartSession({ swim: true }, '2026-11-13', 50)
    expect(s?.kind).toBe('swim')
    expect(s?.date).toBe('2026-11-13')
    expect(s && s.kind === 'swim' ? s.poolLengthM : null).toBe(50)
  })
})
