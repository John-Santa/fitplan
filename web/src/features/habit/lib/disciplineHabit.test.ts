// Per-discipline habit rules (S4, D5-A / D4-A / D10-A): each discipline keeps
// its own streak, votes and wildcards; walks belong to Gimnasio only.
import { describe, expect, it } from 'vitest'
import type { Config, PlanRoutine, Session, TrainingPlan } from '../../../lib/types'
import { DEFAULT_CONFIG } from '../../../lib/plan'
import { bestStreak, consistency, dayStatus, streak, votes } from './habit'
import { habitContextFor } from './disciplineHabit'
import { closedWeekSummaryFor, weekSummaryFor } from './week'

const routine = (id: string): PlanRoutine => ({ id, name: id, archived: false } as unknown as PlanRoutine)
// Five active routines: target 5, two wildcards per week for Gimnasio.
const PLAN: Pick<TrainingPlan, 'routines'> = { routines: ['a', 'b', 'c', 'd', 'e'].map(routine) }
const config = (habitCheckIns: string[] = []): Config => ({ ...DEFAULT_CONFIG, habitCheckIns })

let n = 0
const gym = (date: string, routineId = 'a'): Session => ({
  id: `g${n++}`, kind: 'strength', routineId, date, startedAt: 1, finishedAt: 2, notes: '', sets: [],
})
const swim = (date: string, finished = true): Session => ({
  id: `w${n++}`, kind: 'swim', date, startedAt: 1, finishedAt: finished ? 2 : null, notes: '',
  poolLengthM: 25, rpe: null, blocks: [{ index: 0, distanceM: 1000, timeSec: 1200, stroke: 'freestyle', done: true }],
})

// 2026-11-11 is a Wednesday: Mon 09, Tue 10.
const MON = '2026-11-09'
const TUE = '2026-11-10'
const WED = '2026-11-11'

describe('habitContextFor', () => {
  it('a swim-only Tuesday is not kept for Gimnasio (it spends a wildcard)', () => {
    const sessions = [gym(MON), swim(TUE)]
    const ctx = habitContextFor('strength', sessions, config(), PLAN, WED, 2)
    expect(dayStatus(TUE, ctx)).toBe('rest')
  })

  it('a swim-only Tuesday is kept for Natación', () => {
    const sessions = [gym(MON), swim(TUE)]
    expect(dayStatus(TUE, habitContextFor('swim', sessions, config(), PLAN, WED, 2))).toBe('kept')
  })

  it('a gym session and a swim on the same day keep both streaks', () => {
    const sessions = [gym(TUE), swim(TUE)]
    const g = habitContextFor('strength', sessions, config(), PLAN, WED, 2)
    const s = habitContextFor('swim', sessions, config(), PLAN, WED, 2)
    expect(dayStatus(TUE, g)).toBe('kept')
    expect(dayStatus(TUE, s)).toBe('kept')
    expect(streak(g).days).toBe(1)
    expect(streak(s).days).toBe(1)
  })

  it("Natación's streak starts at the first swim, even after older gym days", () => {
    const sessions = [gym('2026-11-02'), gym('2026-11-03'), gym(MON), swim(TUE)]
    const ctx = habitContextFor('swim', sessions, config(), PLAN, WED, 2)
    expect(dayStatus(MON, ctx)).toBe('none')
    expect(streak(ctx).days).toBe(1)
    expect(bestStreak(ctx)).toBe(1)
  })

  it('a walk on a swim-only day keeps only Gimnasio', () => {
    const sessions = [swim(MON), swim(WED)]
    const cfg = config([TUE])
    expect(dayStatus(TUE, habitContextFor('strength', sessions, cfg, PLAN, WED, 7))).toBe('kept')
    // Natación with target 7 has no wildcards: the walk does not save Tuesday.
    expect(dayStatus(TUE, habitContextFor('swim', sessions, cfg, PLAN, WED, 7))).toBe('missed')
  })

  it('a walk alone never starts Natación', () => {
    const ctx = habitContextFor('swim', [], config([MON]), PLAN, WED, 2)
    expect(dayStatus(MON, ctx)).toBe('none')
    expect(votes(ctx)).toBe(0)
  })

  it('votes count only the discipline: swims for Natación, gym and walks for Gimnasio', () => {
    const sessions = [gym(MON), swim(TUE), swim(WED), swim(WED, false)]
    const cfg = config(['2026-11-08'])
    expect(votes(habitContextFor('strength', sessions, cfg, PLAN, WED, 2))).toBe(2)
    expect(votes(habitContextFor('swim', sessions, cfg, PLAN, WED, 2))).toBe(2)
  })

  it("Gimnasio's wildcards come from the plan and Natación's from the swim target", () => {
    expect(habitContextFor('strength', [], config(), PLAN, WED, 2).restAllowance).toBe(2)
    expect(habitContextFor('swim', [], config(), PLAN, WED, 2).restAllowance).toBe(5)
    expect(habitContextFor('swim', [], config(), PLAN, WED, 7).restAllowance).toBe(0)
  })

  it('a swim target outside 0..7 is clamped for the wildcards', () => {
    expect(habitContextFor('swim', [], config(), PLAN, WED, 9).restAllowance).toBe(0)
    expect(habitContextFor('swim', [], config(), PLAN, WED, -1).restAllowance).toBe(7)
    expect(habitContextFor('swim', [], config(), PLAN, WED, Number.NaN).restAllowance).toBe(7)
  })

  // Differential (S4 acceptance): with gym sessions and check-ins only,
  // Gimnasio's numbers equal the pre-discipline results. The expected values
  // were computed once with the previous code and are pinned here.
  it("keeps today's Gimnasio results for gym-only data", () => {
    const lift = (date: string, routineId: string, finished = true): Session => ({
      id: `l${n++}`, kind: 'strength', routineId, date, startedAt: 1, finishedAt: finished ? 2 : null, notes: '',
      sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 100, reps: 10, done: true }],
    })
    const sessions = [
      lift('2026-10-19', 'a'), lift('2026-10-26', 'a'), lift('2026-10-27', 'b'), lift('2026-10-28', 'c'), lift('2026-10-30', 'd'),
      lift('2026-11-02', 'a'), lift('2026-11-03', 'b', false), lift('2026-11-05', 'c'), lift('2026-11-06', 'e'),
      lift(MON, 'a'), lift(TUE, 'z'),
    ]
    const cfg = config(['2026-10-29', '2026-11-01', '2026-11-04', '2026-11-08'])
    const ctx = habitContextFor('strength', sessions, cfg, PLAN, WED, 2)
    expect(streak(ctx)).toEqual({ days: 16, atRisk: false })
    expect(bestStreak(ctx)).toBe(16)
    expect(consistency(ctx)).toBe(78)
    expect(votes(ctx)).toBe(14)
    expect(weekSummaryFor('strength', PLAN, sessions, cfg.habitCheckIns, WED, 2)).toEqual({ target: 5, done: 1, restAllowance: 2, restUsed: 0 })
    expect(closedWeekSummaryFor('strength', PLAN, sessions, cfg.habitCheckIns, '2026-11-02', 2)).toEqual({
      kind: 'strength', monday: '2026-11-02', target: 5, done: 3, walks: 2, volume: 3000, prevVolume: 4000,
    })
  })

  it("Natación's consistency counts only swim days", () => {
    // Swims Mon and Wed, a gym session Tue: Tue is a swim wildcard, not kept.
    const ctx = habitContextFor('swim', [swim(MON), gym(TUE), swim(WED)], config(), PLAN, WED, 2)
    expect(dayStatus(TUE, ctx)).toBe('rest')
    expect(consistency(ctx)).toBe(100)
  })
})
