// Natación's Hoy numbers (S5): a pure helper, so the acceptance does not need
// a Home render.
import { describe, expect, it } from 'vitest'
import type { Config, Session } from '../../../lib/types'
import { DEFAULT_CONFIG } from '../../../lib/plan'
import { fmtThousands, mmss, swimToday } from './swimToday'

const config = (swimWeeklyTarget = 2): Config => ({ ...DEFAULT_CONFIG, swimWeeklyTarget })

let n = 0
/** A finished swim of `distanceM` metres in `timeSec` seconds (one done block). */
const swim = (date: string, distanceM: number, timeSec: number | null = null, finished = true): Session => ({
  id: `w${n++}`, kind: 'swim', date, startedAt: 1, finishedAt: finished ? 2 : null, notes: '',
  poolLengthM: 25, rpe: null, blocks: [{ index: 0, distanceM, timeSec, stroke: 'freestyle', done: true }],
})
const gym = (date: string): Session => ({
  id: `g${n++}`, kind: 'strength', routineId: 'a', date, startedAt: 1, finishedAt: 2, notes: '', sets: [],
})

// 2026-11-09 is a Monday; Wed 11, Fri 13.
const MON = '2026-11-09'
const WED = '2026-11-11'
const FRI = '2026-11-13'

describe('swimToday', () => {
  it('swims of 1,500 m on Monday and 1,000 m on Wednesday with target 2 meet the week', () => {
    const t = swimToday([swim(MON, 1500), swim(WED, 1000)], config(2), FRI)
    expect(t.done).toBe(2)
    expect(t.target).toBe(2)
    expect(t.distance).toBe(2500)
    expect(t.state).toBe('week-met')
  })

  it('one swim of two leaves the week open and offers "Nadar"', () => {
    const t = swimToday([swim(MON, 1500)], config(2), WED)
    expect(t).toMatchObject({ done: 1, target: 2, distance: 1500, state: 'start', doneToday: false, todayDistance: 0 })
  })

  it('counts distinct swim days, not sessions', () => {
    const t = swimToday([swim(MON, 500), swim(MON, 500)], config(2), WED)
    expect(t.done).toBe(1)
    expect(t.distance).toBe(1000)
  })

  it('a swim finished today is reported with its distance', () => {
    const t = swimToday([swim(WED, 1200)], config(3), WED)
    expect(t.doneToday).toBe(true)
    expect(t.todayDistance).toBe(1200)
  })

  it('an unfinished swim does not count', () => {
    const t = swimToday([swim(WED, 1200, null, false)], config(2), WED)
    expect(t).toMatchObject({ done: 0, distance: 0, doneToday: false, last: null })
  })

  it('ignores gym sessions', () => {
    const t = swimToday([gym(MON), gym(WED)], config(2), WED)
    expect(t).toMatchObject({ done: 0, distance: 0, last: null })
  })

  it('has the last 5 weeks of distance, oldest first, this week last', () => {
    const t = swimToday([swim('2026-10-13', 800), swim('2026-11-02', 1000), swim(MON, 1500)], config(2), WED)
    // Weeks starting 10-12, 10-19, 10-26, 11-02, 11-09.
    expect(t.weekDistances).toEqual([800, 0, 0, 1000, 1500])
  })

  it('the last session carries its distance and pace, or no pace without timing', () => {
    // 1,500 m in 1,875 s is 125 s per 100 m.
    const timed = swimToday([swim(MON, 1000, 1000), swim(WED, 1500, 1875)], config(2), FRI)
    expect(timed.last).toEqual({ distanceM: 1500, paceSecPer100m: 125 })
    const untimed = swimToday([swim(WED, 900)], config(2), FRI)
    expect(untimed.last).toEqual({ distanceM: 900, paceSecPer100m: null })
  })

  it('has no last session before the first swim', () => {
    expect(swimToday([], config(2), WED).last).toBeNull()
  })

  it('a zero target never reads as met', () => {
    expect(swimToday([], config(0), WED).state).toBe('start')
  })
})

describe('number formats', () => {
  it('groups thousands with a dot and formats m:ss', () => {
    expect(fmtThousands(1500)).toBe('1.500')
    expect(fmtThousands(950)).toBe('950')
    expect(fmtThousands(1234567)).toBe('1.234.567')
    expect(mmss(125)).toBe('2:05')
    expect(mmss(59.6)).toBe('1:00')
  })
})
