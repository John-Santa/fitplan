// Local-reminder scheduler: pure functions over intentions + sessions + a
// `now` Date. Dates are local calendar dates; nothing reads the real clock.
import { describe, expect, it } from 'vitest'
import type { Config, DayPlan, Intention, Session, WeeklyIntentions, WeeklyRoutine } from '../../../lib/types'
import { DEFAULT_CONFIG } from '../../../lib/plan'
import { dueReminders, nextReminder, reminderKey } from './scheduler'

const train = (): DayPlan => ({ kind: 'training', routineId: 'r1', title: '', note: '' })
const rest = (): DayPlan => ({ kind: 'rest', title: '', note: '' })

// Index = Date.getDay(): Sun rest, Mon-Sat training.
const WEEK: WeeklyRoutine = [rest(), train(), train(), train(), train(), train(), train()]

const none: Intention = { time: '', place: '' }
const intentions = (over: Record<number, Intention>): WeeklyIntentions =>
  [0, 1, 2, 3, 4, 5, 6].map(d => over[d] ?? none) as unknown as WeeklyIntentions

const config = (over: Partial<Config> = {}): Config => ({
  ...DEFAULT_CONFIG,
  weeklyRoutine: WEEK,
  habitCheckIns: [],
  intentions: intentions({ 1: { time: '07:30', place: 'Gym' }, 3: { time: '18:00', place: '' } }),
  ...over,
})

let n = 0
const session = (date: string, finished = true): Session => ({
  id: `s${n++}`, kind: 'strength', routineId: 'r1', date, startedAt: 1, finishedAt: finished ? 2 : null, notes: '', sets: [],
})

// 2026-11-09 is a Monday, 2026-11-11 a Wednesday.
const at = (iso: string, h: number, m = 0) => {
  const [y, mo, d] = iso.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m)
}

describe('nextReminder', () => {
  it('returns the next planned time after now with its key and place', () => {
    const r = nextReminder({ config: config(), sessions: [], now: at('2026-11-09', 6, 0) }, null)
    expect(r).toMatchObject({ date: '2026-11-09', time: '07:30', place: 'Gym', key: '2026-11-09@07:30' })
    expect(r?.at).toBe(at('2026-11-09', 7, 30).getTime())
  })

  it('skips a time that already passed today and goes to the next planned day', () => {
    const r = nextReminder({ config: config(), sessions: [], now: at('2026-11-09', 8, 0) }, null)
    expect(r?.key).toBe('2026-11-11@18:00')
  })

  it('skips today when the session is already done', () => {
    const r = nextReminder({ config: config(), sessions: [session('2026-11-09')], now: at('2026-11-09', 6, 0) }, null)
    expect(r?.key).toBe('2026-11-11@18:00')
  })

  it('skips a key that was already fired', () => {
    const r = nextReminder({ config: config(), sessions: [], now: at('2026-11-09', 6, 0) }, '2026-11-09@07:30')
    expect(r?.key).toBe('2026-11-11@18:00')
  })

  it('wraps to next week and ignores intentions without a valid time', () => {
    const c = config({ intentions: intentions({ 1: { time: '', place: 'Gym' }, 2: { time: '9am', place: '' }, 5: { time: '06:00', place: '' } }) })
    expect(nextReminder({ config: c, sessions: [], now: at('2026-11-11', 12) }, null)?.key).toBe('2026-11-13@06:00')
    expect(nextReminder({ config: c, sessions: [], now: at('2026-11-13', 7) }, null)?.key).toBe('2026-11-20@06:00')
  })

  it('does not remind on a rest day even when it has a time', () => {
    const c = config({ intentions: intentions({ 0: { time: '10:00', place: '' } }) })
    expect(nextReminder({ config: c, sessions: [], now: at('2026-11-09', 6) }, null)).toBeNull()
  })

  it('returns null when no intention has a time', () => {
    expect(nextReminder({ config: config({ intentions: intentions({}) }), sessions: [], now: at('2026-11-09', 6) }, null)).toBeNull()
  })

  it('is stable across a month boundary using local calendar dates', () => {
    const c = config({ intentions: intentions({ 2: { time: '07:00', place: '' } }) })
    // Sat 2026-10-31 23:30 -> next Tuesday is 2026-11-03.
    expect(nextReminder({ config: c, sessions: [], now: at('2026-10-31', 23, 30) }, null)?.key).toBe('2026-11-03@07:00')
  })

  it('ignores an unfinished session', () => {
    const r = nextReminder({ config: config(), sessions: [session('2026-11-09', false)], now: at('2026-11-09', 6) }, null)
    expect(r?.key).toBe('2026-11-09@07:30')
  })
})

describe('dueReminders', () => {
  it('returns today\'s reminder when its time passed and it is not done', () => {
    const due = dueReminders({ config: config(), sessions: [], now: at('2026-11-09', 9, 0) }, null)
    expect(due.map(r => r.key)).toEqual(['2026-11-09@07:30'])
  })

  it('returns nothing before the planned time', () => {
    expect(dueReminders({ config: config(), sessions: [], now: at('2026-11-09', 7, 29) }, null)).toEqual([])
  })

  it('returns nothing when the session or a check-in is done', () => {
    expect(dueReminders({ config: config(), sessions: [session('2026-11-09')], now: at('2026-11-09', 9) }, null)).toEqual([])
    expect(dueReminders({ config: config({ habitCheckIns: ['2026-11-09'] }), sessions: [], now: at('2026-11-09', 9) }, null)).toEqual([])
  })

  it('returns nothing when the key was already fired', () => {
    expect(dueReminders({ config: config(), sessions: [], now: at('2026-11-09', 9) }, '2026-11-09@07:30')).toEqual([])
  })

  it('returns nothing on a day without a planned time or on a rest day', () => {
    expect(dueReminders({ config: config(), sessions: [], now: at('2026-11-10', 9) }, null)).toEqual([])
    const c = config({ intentions: intentions({ 0: { time: '10:00', place: '' } }) })
    expect(dueReminders({ config: c, sessions: [], now: at('2026-11-15', 12) }, null)).toEqual([])
  })
})

describe('reminderKey', () => {
  it('combines the local date and the planned time', () => {
    expect(reminderKey('2026-11-09', '07:30')).toBe('2026-11-09@07:30')
  })
})
