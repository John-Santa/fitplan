import { describe, expect, it } from 'vitest'
import type { Session } from '../../../lib/types'
import { monthActivity, monthWeeks, shiftMonth } from './month'

let n = 0
const strength = (date: string, finished = true): Session => ({
  id: `s${n++}`, kind: 'strength', routineId: 'a', date, startedAt: 1, finishedAt: finished ? 2 : null, notes: '', sets: [],
}) as unknown as Session
const swim = (date: string, finished = true): Session => ({
  id: `s${n++}`, kind: 'swim', date, startedAt: 1, finishedAt: finished ? 2 : null, notes: '',
}) as unknown as Session

describe('monthActivity', () => {
  it('maps strength, swim and walk to the days of the month', () => {
    const sessions = [strength('2026-11-10'), swim('2026-11-12')]
    expect(monthActivity(sessions, ['2026-11-12'], 2026, 11)).toEqual({
      '2026-11-10': ['strength'],
      '2026-11-12': ['swim', 'walk'],
    })
  })

  it('ignores unfinished sessions', () => {
    expect(monthActivity([strength('2026-11-10', false), swim('2026-11-11', false)], [], 2026, 11)).toEqual({})
  })

  it('keeps month boundaries exact using the stored local date', () => {
    const sessions = [strength('2026-10-31'), strength('2026-11-01'), swim('2026-11-30'), strength('2026-12-01')]
    expect(monthActivity(sessions, ['2026-10-31', '2026-12-01', '2026-11-30'], 2026, 11)).toEqual({
      '2026-11-01': ['strength'],
      '2026-11-30': ['swim', 'walk'],
    })
  })

  it('lists each activity once on a day with several sessions', () => {
    const sessions = [strength('2026-11-10'), strength('2026-11-10'), swim('2026-11-10')]
    expect(monthActivity(sessions, ['2026-11-10', '2026-11-10'], 2026, 11)['2026-11-10']).toEqual(['strength', 'swim', 'walk'])
  })

  it('is empty for a month before the first activity', () => {
    expect(monthActivity([strength('2026-11-10')], ['2026-11-12'], 2026, 3)).toEqual({})
  })
})

describe('monthWeeks', () => {
  it('lays November 2026 out Monday-first with padding', () => {
    const weeks = monthWeeks(2026, 11)
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01'])
    expect(weeks[weeks.length - 1]).toEqual(['2026-11-30', null, null, null, null, null, null])
    expect(weeks.every(w => w.length === 7)).toBe(true)
  })
})

describe('shiftMonth', () => {
  it('crosses year boundaries', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
  })
})
