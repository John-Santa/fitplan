// Perfil's per-discipline metrics (S8, D6-A). Pure: derived from saved
// sessions, measurements, config and plan; nothing here is stored or synced.
// Every figure reuses the app's existing helpers so Perfil never disagrees
// with Hoy, Progreso or the session summary.
import type { Config, Measurement, Session, SessionKind, TrainingPlan } from '../../../lib/types'
import { bySessionTime, progressPct, todayISO } from '../../../lib/calc'
import { finishedIn, swimDistance, swimSessionPaceSecPer100m, swimSessionSpeedMPerMin } from '../../../lib/disciplines'
import { personalRecords } from '../../../lib/records'
import { resolveExercise } from '../../../lib/library'
import { UNSET_GOAL } from '../../../lib/plan'
import { blockWeekNumber } from '../../../lib/phases'
import { weekLabel } from '../../../lib/planQueries'
import { blockWeekVolume, weekVolumes } from '../../today/lib/blockEnd'
import { bestStreak, streak } from '../../habit/lib/habit'
import { habitContextFor, sessionsOf } from '../../habit/lib/disciplineHabit'
import { ALL_DATES, deltaPct, weekDays, weekSummaryFor, weeklyTargetFor } from '../../habit/lib/week'

type ProfilePlan = Pick<TrainingPlan, 'routines' | 'weeks' | 'customExercises'>

export interface StreakMetric {
  days: number
  best: number
}

export interface RecordMetric {
  exerciseId: string
  name: string
  weight: number
  reps: number | null
  date: string
}

export type BodyKey = 'weight' | 'fatMass' | 'muscle' | 'waist'

export interface BodyMetric {
  key: BodyKey
  label: string
  unit: string
  value: number | null
  /** Latest minus the first measurement; null when either is missing. */
  delta: number | null
  deltaGood: 'lower' | 'higher'
  /** Null when the goal is not set (UNSET_GOAL). */
  goal: number | null
  progress: number | null
}

export interface StrengthMetrics {
  kind: 'strength'
  hasSessions: boolean
  streak: StreakMetric
  block: { week: number; totalWeeks: number; label: string; done: number; target: number }
  volume: { weeks: { week: number; volume: number; current: boolean }[]; deltaVsFirst: number | null }
  records: RecordMetric[]
  body: { hasMeasurement: boolean; anyGoalSet: boolean; items: BodyMetric[] }
}

export interface SwimWeekMetric {
  monday: string
  distanceM: number
  sessions: number
  current: boolean
}

export interface SwimMetrics {
  kind: 'swim'
  hasSessions: boolean
  streak: StreakMetric
  week: { done: number; target: number; distanceM: number }
  last4: { weeks: SwimWeekMetric[]; distanceM: number; sessions: number; avgSpeedMPerMin: number | null }
  bestPaceSecPer100m: number | null
  longest: { distanceM: number; date: string } | null
  totalDistanceM: number
}

export type ProfileMetrics = StrengthMetrics | SwimMetrics

/** How many records Perfil lists. */
export const PROFILE_RECORDS = 5

const parse = (iso: string): Date => new Date(iso + 'T00:00:00')

const addDays = (iso: string, days: number): string => {
  const d = parse(iso)
  d.setDate(d.getDate() + days)
  return todayISO(d)
}

function streakOf(kind: SessionKind, sessions: readonly Session[], config: Config, plan: ProfilePlan, today: string): StreakMetric {
  const ctx = habitContextFor(kind, sessions, config, plan, today, config.swimWeeklyTarget)
  return { days: streak(ctx).days, best: bestStreak(ctx) }
}

const BODY: { key: BodyKey; label: string; unit: string; deltaGood: 'lower' | 'higher' }[] = [
  { key: 'weight', label: 'Peso', unit: 'kg', deltaGood: 'lower' },
  { key: 'fatMass', label: 'Masa grasa', unit: 'kg', deltaGood: 'lower' },
  { key: 'muscle', label: 'Músculo', unit: 'kg', deltaGood: 'higher' },
  { key: 'waist', label: 'Cintura', unit: 'cm', deltaGood: 'lower' },
]

/** Latest body values against the first measurement, with goal and progress,
 *  the same figures as Measure's tiles. */
function bodyMetrics(measurements: readonly Measurement[], config: Config): StrengthMetrics['body'] {
  const rows = [...measurements].sort((a, b) => a.date.localeCompare(b.date))
  const base = rows[0]
  const last = rows[rows.length - 1]
  const items = BODY.map(({ key, label, unit, deltaGood }): BodyMetric => {
    const value = last?.[key] ?? null
    const first = base?.[key] ?? null
    const target = config.goal[key]
    const goal = target !== UNSET_GOAL ? target : null
    return {
      key, label, unit, deltaGood, value, goal,
      delta: value != null && first != null ? value - first : null,
      progress: value != null && first != null && goal != null ? progressPct(value, first, goal) : null,
    }
  })
  return { hasMeasurement: last != null, anyGoalSet: items.some(i => i.goal != null), items }
}

/** The most recent best-weight records, newest first; a tie (same session)
 *  goes by name. */
function recentRecords(sessions: readonly Session[], plan: ProfilePlan): RecordMetric[] {
  const gym = sessionsOf('strength', sessions)
  const byId = new Map(gym.map(s => [s.id, s]))
  const ids = new Set(gym.flatMap(s => (s.kind === 'strength' ? s.sets.map(x => x.exerciseId) : [])))
  const records = [...ids].flatMap(exerciseId => {
    const best = personalRecords(sessions, exerciseId).bestWeight
    if (!best) return []
    const name = resolveExercise(plan, exerciseId)?.name ?? exerciseId
    return [{ record: { exerciseId, name, weight: best.weight, reps: best.reps, date: best.date }, session: byId.get(best.sessionId)! }]
  })
  records.sort((a, b) => bySessionTime(b.session, a.session) || a.record.name.localeCompare(b.record.name))
  return records.slice(0, PROFILE_RECORDS).map(r => r.record)
}

function strengthMetrics(sessions: readonly Session[], measurements: readonly Measurement[], config: Config, plan: ProfilePlan, today: string): StrengthMetrics {
  const all = [...sessions]
  const week = blockWeekNumber(parse(today), config.blockStart)
  const started = today >= config.blockStart
  const elapsed = started ? Math.min(week, plan.weeks) : 0
  const target = elapsed * weeklyTargetFor('strength', plan, config.swimWeeklyTarget)
  const done = finishedIn(all, 'strength', config.blockStart, config.blockEnd).length
  const weeks = Array.from({ length: elapsed }, (_, i) => ({
    week: i + 1,
    volume: blockWeekVolume(all, config.blockStart, i + 1),
    current: i + 1 === week,
  }))
  const { first, last } = weekVolumes(all, config.blockStart, elapsed)
  return {
    kind: 'strength',
    hasSessions: sessionsOf('strength', sessions).length > 0,
    streak: streakOf('strength', sessions, config, plan, today),
    block: { week, totalWeeks: plan.weeks, label: weekLabel(plan.weeks, week), done, target },
    volume: { weeks, deltaVsFirst: elapsed > 1 ? deltaPct(last, first) : null },
    records: recentRecords(sessions, plan),
    body: bodyMetrics(measurements, config),
  }
}

function swimMetrics(sessions: readonly Session[], config: Config, plan: ProfilePlan, today: string): SwimMetrics {
  const all = [...sessions]
  // Same rows as SwimProgress: finished swims in session order.
  const swims = finishedIn(all, 'swim', ALL_DATES.start, ALL_DATES.end).sort(bySessionTime)
  const thisWeek = weekDays(today)
  const summary = weekSummaryFor('swim', plan, sessions, config.habitCheckIns, today, config.swimWeeklyTarget)
  const distanceIn = (from: string, to: string) =>
    finishedIn(all, 'swim', from, to).reduce((a, s) => a + swimDistance(s), 0)

  const weeks: SwimWeekMetric[] = [3, 2, 1, 0].map(back => {
    const days = weekDays(addDays(today, -7 * back))
    return {
      monday: days[0],
      distanceM: distanceIn(days[0], days[6]),
      sessions: finishedIn(all, 'swim', days[0], days[6]).length,
      current: back === 0,
    }
  })
  const inRange = finishedIn(all, 'swim', weeks[0].monday, thisWeek[6])
  const speeds = inRange.map(swimSessionSpeedMPerMin).filter((v): v is number => v != null)
  const paces = swims.map(swimSessionPaceSecPer100m).filter((v): v is number => v != null)
  const longest = swims.reduce<SwimMetrics['longest']>((best, s) => {
    const d = swimDistance(s)
    return best == null || d > best.distanceM ? { distanceM: d, date: s.date } : best
  }, null)

  return {
    kind: 'swim',
    hasSessions: swims.length > 0,
    streak: streakOf('swim', sessions, config, plan, today),
    week: { done: summary.done, target: summary.target, distanceM: distanceIn(thisWeek[0], thisWeek[6]) },
    last4: {
      weeks,
      distanceM: weeks.reduce((a, w) => a + w.distanceM, 0),
      sessions: weeks.reduce((a, w) => a + w.sessions, 0),
      avgSpeedMPerMin: speeds.length > 0 ? speeds.reduce((a, v) => a + v, 0) / speeds.length : null,
    },
    bestPaceSecPer100m: paces.length > 0 ? Math.min(...paces) : null,
    longest,
    totalDistanceM: swims.reduce((a, s) => a + swimDistance(s), 0),
  }
}

/** Perfil's metrics for one discipline. Unfinished sessions never count, and
 *  the other discipline's sessions never mix in. */
export function profileMetrics(
  kind: SessionKind,
  sessions: readonly Session[],
  measurements: readonly Measurement[],
  config: Config,
  plan: ProfilePlan,
  today: string,
): ProfileMetrics {
  return kind === 'strength'
    ? strengthMetrics(sessions, measurements, config, plan, today)
    : swimMetrics(sessions, config, plan, today)
}
