// Flexible week: routines are done once per calendar week in any order and on
// any day; the free days are rest wildcards.
import { describe, expect, it } from 'vitest'
import type { PlanRoutine, Session, StrengthSession, TrainingPlan } from '../../../lib/types'
import { blockReview, closedWeekSummary, deltaPct, nextRoutine, restAllowance, restHint, routinesDoneThisWeek, weekDays, weekSummary, weeklyTarget, weekTitle } from './week'

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

// Hoy's "Esta semana" counter is weekSummary(...) of the current week: pinned
// before closedWeekSummary was added next to it.
describe('current-week counter on Hoy', () => {
  it('counts distinct rotation routines of the current week only', () => {
    const sessions = [done('a', '2026-11-09'), done('a', '2026-11-10'), done('b', '2026-11-08'), done('x', WED)]
    expect(weekSummary(P, sessions, [], WED)).toMatchObject({ target: 5, done: 1 })
  })
})

const lift = (routineId: string, date: string, weight: number): StrengthSession => ({
  id: `l${n++}`, kind: 'strength', routineId, date, startedAt: 1, finishedAt: 2, notes: '',
  sets: [{ exerciseId: 'leg-press', setIndex: 0, weight, reps: 10, done: true }],
})

describe('closedWeekSummary', () => {
  const MON = '2026-11-16'
  const week = [lift('a', '2026-11-16', 100), lift('b', '2026-11-17', 100), lift('c', '2026-11-19', 100), lift('d', '2026-11-22', 100)]
  const before = [lift('a', '2026-11-10', 200)]
  it('returns done, target, walks and volume of the closed week and the week before', () => {
    const r = closedWeekSummary(P, [...week, ...before, lift('e', '2026-11-23', 999)], ['2026-11-18', '2026-11-20', '2026-11-25'], MON)
    expect(r).toMatchObject({ done: 4, target: 5, walks: 2, volume: 4000, prevVolume: 2000 })
  })
  it('ignores unfinished sessions and archived routines', () => {
    const r = closedWeekSummary(P, [done('a', '2026-11-16', false), done('x', '2026-11-17')], [], MON)
    expect(r).toMatchObject({ done: 0, walks: 0, volume: 0, prevVolume: 0 })
  })
  it('a Sunday date inside the week resolves to the same Monday', () => {
    expect(closedWeekSummary(P, week, [], '2026-11-22').monday).toBe(MON)
  })
})

describe('weekTitle and deltaPct', () => {
  it('formats the week range, also across months', () => {
    expect(weekTitle('2026-11-16')).toBe('Semana del 16 al 22 nov')
    expect(weekTitle('2026-11-30')).toBe('Semana del 30 nov al 6 dic')
  })
  it('percent change against the week before, null without a base', () => {
    expect(deltaPct(106, 100)).toBe(6)
    expect(deltaPct(50, 100)).toBe(-50)
    expect(deltaPct(10, 0)).toBeNull()
  })
})

describe('blockReview', () => {
  const phases = [{ fromWeek: 1, toWeek: 2, goal: 'Aprender técnica' }, { fromWeek: 3, toWeek: 6, goal: 'Progresión doble: sumar reps y peso cada semana' }]
  const bp = { weeks: 12, phases } as unknown as TrainingPlan
  const cfg = { blockStart: '2026-10-19', blockEnd: '2027-01-10' }
  it('names the block week and the phase goal, with week 1 volume', () => {
    const r = blockReview(bp, cfg, [lift('a', '2026-10-20', 100), lift('a', '2026-11-17', 150)], '2026-11-16')
    expect(r).toEqual({ text: 'Semana 5 de 12 · Progresión doble: sumar reps y peso cada semana', week: 5, firstVolume: 1000 })
  })
  it('has no line before the block starts and says the block ended after it', () => {
    expect(blockReview(bp, cfg, [], '2026-10-12')).toBeNull()
    expect(blockReview(bp, cfg, [], '2027-01-18')?.text).toBe('Bloque terminado')
  })
})

describe('restHint', () => {
  const base = { restLeft: 2, activeToday: false, blockEnded: false, routineName: 'Tren inferior A' }
  it("tells the user a wildcard moves today's routine to tomorrow", () => {
    expect(restHint(base)).toBe('¿Hoy no puedes? Descansa: usas un comodín y mañana sigue Tren inferior A.')
  })
  it('shows nothing without wildcards, after activity today, once the block ended or without a routine', () => {
    expect(restHint({ ...base, restLeft: 0 })).toBeNull()
    expect(restHint({ ...base, activeToday: true })).toBeNull()
    expect(restHint({ ...base, blockEnded: true })).toBeNull()
    expect(restHint({ ...base, routineName: null })).toBeNull()
  })
})
