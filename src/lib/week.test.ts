// Flexible week: routines are done once per calendar week in any order and on
// any day; the free days are rest wildcards.
import { describe, expect, it } from 'vitest'
import type { PlanRoutine, Session, TrainingPlan } from '../types'
import { nextRoutine, restAllowance, routinesDoneThisWeek, weekDays, weekSummary, weeklyTarget } from './week'

const routine = (id: string, archived = false): PlanRoutine => ({ id, name: id, archived } as unknown as PlanRoutine)
const plan = (...rs: PlanRoutine[]): Pick<TrainingPlan, 'routines'> => ({ routines: rs })
let n = 0
const done = (routineId: string, date: string, finished = true): Session => ({
  id: `s${n++}`, kind: 'strength', routineId, date, startedAt: 1, finishedAt: finished ? 2 : null, notes: '', sets: [],
})
const P = plan(routine('a'), routine('b'), routine('c'), routine('d'), routine('e'), routine('x', true))
const WED = '2026-11-11'

describe('flexible week', () => {
  it('weeks run Monday to Sunday', () => {
    expect(weekDays(WED)).toEqual(['2026-11-09', '2026-11-10', WED, '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
    expect(weekDays('2026-11-15')[0]).toBe('2026-11-09')
  })

  it('target is one workout per active routine and the rest are wildcards', () => {
    expect(weeklyTarget(P)).toBe(5)
    expect(restAllowance(P)).toBe(2)
  })

  it('suggests the first routine not done this week, in any order done', () => {
    const sessions = [done('a', '2026-11-10'), done('c', '2026-11-09'), done('b', '2026-11-08'), done('b', WED, false)]
    expect([...routinesDoneThisWeek(sessions, WED)].sort()).toEqual(['a', 'c'])
    expect(nextRoutine(P, sessions, WED)?.id).toBe('b')
  })

  it('suggests nothing once every routine is done this week', () => {
    const sessions = ['a', 'b', 'c', 'd', 'e'].map((id, i) => done(id, weekDays(WED)[Math.min(i, 2)]))
    expect(nextRoutine(P, sessions, WED)).toBeNull()
  })

  it('summarises done workouts and spent rest wildcards', () => {
    // Mon 09 empty (wildcard), Tue 10 trained a; today not counted yet.
    expect(weekSummary(P, [done('a', '2026-11-10')], [], WED)).toEqual({ target: 5, done: 1, restAllowance: 2, restUsed: 1 })
    expect(weekSummary(P, [done('a', '2026-11-10')], ['2026-11-09'], WED).restUsed).toBe(0)
  })
})
