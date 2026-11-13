// S8: Perfil's per-discipline metrics, derived from saved data only.
import { describe, expect, it } from 'vitest'
import type { Config, Measurement, Session, SetLog, StrengthSession, SwimSession } from '../../../lib/types'
import { DEFAULT_CONFIG } from '../../../lib/plan'
import { DEFAULT_PLAN } from '../../../lib/defaultPlan'
import { profileMetrics, type StrengthMetrics, type SwimMetrics } from './profileMetrics'

const set = (exerciseId: string, weight: number, reps: number, done = true): SetLog => ({ exerciseId, setIndex: 0, weight, reps, done })

const gym = (id: string, date: string, sets: SetLog[], finished = true): StrengthSession => ({
  id, kind: 'strength', routineId: 'dia1', date, startedAt: Date.parse(date + 'T10:00:00'),
  finishedAt: finished ? Date.parse(date + 'T11:00:00') : null, notes: '', sets,
} as unknown as StrengthSession)

const swim = (id: string, date: string, blocks: { distanceM: number | null; timeSec: number | null }[], finished = true): SwimSession => ({
  id, kind: 'swim', date, startedAt: Date.parse(date + 'T07:00:00'),
  finishedAt: finished ? Date.parse(date + 'T08:00:00') : null, notes: '', poolLengthM: 25, rpe: null,
  blocks: blocks.map((b, index) => ({ index, stroke: 'free', done: true, ...b })),
} as unknown as SwimSession)

const swimConfig: Config = { ...DEFAULT_CONFIG, swimWeeklyTarget: 2 }

describe('profileMetrics swim (first RED)', () => {
  // 1,500 m at 2:05 /100 m (1,875 s) and 2,000 m at 1:58 /100 m (2,360 s).
  const sessions: Session[] = [
    swim('a', '2026-11-09', [{ distanceM: 1500, timeSec: 1875 }]),
    swim('b', '2026-11-11', [{ distanceM: 2000, timeSec: 2360 }]),
  ]

  it('returns best pace 118 s, longest 2,000 m and total 3,500 m', () => {
    const m = profileMetrics('swim', sessions, [], swimConfig, DEFAULT_PLAN, '2026-11-12') as SwimMetrics
    expect(m.kind).toBe('swim')
    expect(m.bestPaceSecPer100m).toBe(118)
    expect(m.longest).toEqual({ distanceM: 2000, date: '2026-11-11' })
    expect(m.totalDistanceM).toBe(3500)
  })

  it('counts this week, the last 4 calendar weeks, the streak and the average speed', () => {
    const older = swim('c', '2026-10-01', [{ distanceM: 1000, timeSec: 1200 }])
    const m = profileMetrics('swim', [...sessions, older], [], swimConfig, DEFAULT_PLAN, '2026-11-12') as SwimMetrics
    expect(m.hasSessions).toBe(true)
    expect(m.week).toEqual({ done: 2, target: 2, distanceM: 3500 })
    expect(m.last4.weeks.map(w => w.monday)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'])
    expect(m.last4.weeks.map(w => w.distanceM)).toEqual([0, 0, 0, 3500])
    expect(m.last4.weeks.map(w => w.current)).toEqual([false, false, false, true])
    expect(m.last4.distanceM).toBe(3500)
    expect(m.last4.sessions).toBe(2)
    // Mean of the session speeds in range: 6000/125 = 48 and 6000/118 ≈ 50.85.
    expect(m.last4.avgSpeedMPerMin).toBeCloseTo((48 + 6000 / 118) / 2, 5)
    expect(m.totalDistanceM).toBe(4500)
    expect(m.streak.best).toBeGreaterThanOrEqual(1)
  })

  it('ignores unfinished swims and skips swims without pace for the best pace', () => {
    const m = profileMetrics('swim', [
      swim('u', '2026-11-10', [{ distanceM: 5000, timeSec: 3000 }], false),
      swim('n', '2026-11-11', [{ distanceM: 800, timeSec: null }]),
    ], [], swimConfig, DEFAULT_PLAN, '2026-11-12') as SwimMetrics
    expect(m.bestPaceSecPer100m).toBeNull()
    expect(m.longest).toEqual({ distanceM: 800, date: '2026-11-11' })
    expect(m.totalDistanceM).toBe(800)
    expect(m.last4.avgSpeedMPerMin).toBeNull()
  })

  it('has empty metrics with no swims, and never counts gym sessions', () => {
    const m = profileMetrics('swim', [gym('g', '2026-11-10', [set('leg-press', 80, 8)])], [], swimConfig, DEFAULT_PLAN, '2026-11-12') as SwimMetrics
    expect(m.hasSessions).toBe(false)
    expect(m.streak).toEqual({ days: 0, best: 0 })
    expect(m.longest).toBeNull()
    expect(m.totalDistanceM).toBe(0)
    expect(m.week.done).toBe(0)
  })
})

describe('profileMetrics strength', () => {
  // Block starts Monday 2026-10-05: today 2026-11-04 (Wednesday) is week 5 of 12.
  const config: Config = {
    ...DEFAULT_CONFIG,
    blockStart: '2026-10-05',
    blockEnd: '2026-12-27',
    goal: { ...DEFAULT_CONFIG.goal, weight: 76, fatMass: 15, muscle: 34, waist: 0 },
  }
  const sessions: Session[] = [
    gym('w1', '2026-10-06', [set('leg-press', 60, 10)]), // week 1: 600 kg
    gym('w2', '2026-10-13', [set('leg-press', 70, 8)]), // week 2: 560 kg
    gym('w5', '2026-11-03', [set('leg-press', 80, 8), set('goblet-squat', 20, 12)]), // week 5: 880 kg
    gym('u', '2026-11-04', [set('leg-press', 200, 1)], false), // unfinished: ignored
    swim('s', '2026-11-02', [{ distanceM: 1000, timeSec: 1200 }]), // other discipline: ignored
  ]
  const measurements: Measurement[] = [
    { date: '2026-10-20', weight: 80, fatMass: 19, muscle: 32, waist: 95 },
    { date: '2026-10-05', weight: 82, fatMass: 20, muscle: 31, waist: 98 },
  ]
  const m = profileMetrics('strength', sessions, measurements, config, DEFAULT_PLAN, '2026-11-04') as StrengthMetrics

  it('returns the streak of Gimnasio only', () => {
    expect(m.kind).toBe('strength')
    expect(m.hasSessions).toBe(true)
    expect(m.streak.best).toBeGreaterThanOrEqual(1)
  })

  it('returns the block week and sessions against weeks elapsed × weekly target', () => {
    expect(m.block).toEqual({ week: 5, totalWeeks: 12, label: 'Semana 5 de 12', done: 3, target: 25 })
  })

  it('returns one volume per block week up to the current one, and the change against week 1', () => {
    expect(m.volume.weeks.map(w => w.volume)).toEqual([600, 560, 0, 0, 880])
    expect(m.volume.weeks.map(w => w.current)).toEqual([false, false, false, false, true])
    expect(m.volume.deltaVsFirst).toBe(47)
  })

  it('returns the most recent best-weight records, newest first, at most 5', () => {
    expect(m.records).toEqual([
      { exerciseId: 'leg-press', name: 'Prensa de piernas (leg press)', weight: 80, reps: 8, date: '2026-11-03' },
      { exerciseId: 'goblet-squat', name: 'Sentadilla goblet a un banco', weight: 20, reps: 12, date: '2026-11-03' },
    ])
    const many = Array.from({ length: 7 }, (_, i) => gym(`r${i}`, `2026-10-1${i}`, [set(`ex${i}`, 10 + i, 5)]))
    const top = (profileMetrics('strength', many, [], config, DEFAULT_PLAN, '2026-11-04') as StrengthMetrics).records
    expect(top.map(r => r.exerciseId)).toEqual(['ex6', 'ex5', 'ex4', 'ex3', 'ex2'])
    expect(top[0].name).toBe('ex6')
  })

  it('returns the latest body values against the first measurement, with goals and progress', () => {
    expect(m.body.hasMeasurement).toBe(true)
    expect(m.body.anyGoalSet).toBe(true)
    const byKey = Object.fromEntries(m.body.items.map(i => [i.key, i]))
    expect(byKey.weight).toMatchObject({ value: 80, delta: -2, goal: 76 })
    expect(byKey.weight.progress).toBeCloseTo((2 / 6) * 100, 6)
    expect(byKey.fatMass).toMatchObject({ value: 19, delta: -1, goal: 15 })
    expect(byKey.fatMass.progress).toBeCloseTo(20, 6)
    expect(byKey.muscle).toMatchObject({ value: 32, delta: 1, goal: 34 })
    expect(byKey.muscle.progress).toBeCloseTo(100 / 3, 6)
    // An unset goal (UNSET_GOAL) has no target and no progress.
    expect(byKey.waist).toMatchObject({ value: 95, delta: -3, goal: null, progress: null })
  })

  it('reports no goal set and no measurement', () => {
    const noGoals: Config = { ...config, goal: { ...config.goal, weight: 0, fatMass: 0, muscle: 0, waist: 0 } }
    const a = profileMetrics('strength', [], measurements, noGoals, DEFAULT_PLAN, '2026-11-04') as StrengthMetrics
    expect(a.body.anyGoalSet).toBe(false)
    const b = profileMetrics('strength', [], [], config, DEFAULT_PLAN, '2026-11-04') as StrengthMetrics
    expect(b.body.hasMeasurement).toBe(false)
    expect(b.hasSessions).toBe(false)
    expect(b.records).toEqual([])
    expect(b.block.done).toBe(0)
  })
})
