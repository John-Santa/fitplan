// Atomic-Habits tracking domain: day status, 12-week grid, streak with
// "never miss twice", identity votes and implementation intentions. Every
// test goes through the public functions; dates are fixed so nothing depends
// on the real clock.
import { describe, expect, it } from 'vitest'
import type { Config, DayPlan, Session, WeeklyRoutine } from '../../../lib/types'
import { dayStatus, habitGrid, intentionFor, missedYesterday, streak, toggleCheckIn, votes, type HabitContext } from './habit'
import { DEFAULT_CONFIG, mergeConfig } from '../../../lib/plan'

const train = (routineId = 'r1'): DayPlan => ({ kind: 'training', routineId, title: '', note: '' })
const other = (kind: 'rest' | 'walk' | 'custom'): DayPlan => ({ kind, title: '', note: '' })

// Sun rest, Mon-Fri training, Sat walk (index = Date.getDay()).
const WEEK: WeeklyRoutine = [other('rest'), train(), train(), train(), train(), train(), other('walk')]

const config = (over: Partial<Config> = {}): Config => ({ ...DEFAULT_CONFIG, weeklyRoutine: WEEK, habitCheckIns: [], ...over })

let n = 0
const session = (date: string, finished = true): Session => ({
  id: `s${n++}`,
  kind: 'strength',
  routineId: 'r1',
  date,
  startedAt: 1,
  finishedAt: finished ? 2 : null,
  notes: '',
  sets: [],
})

// restAllowance defaults to 0 here so a day without activity is a plain miss;
// the wildcard tests pass their own allowance.
const ctx = (today: string, sessions: Session[] = [], over: Partial<Config> = {}, restAllowance = 0): HabitContext => ({
  sessions,
  config: config(over),
  today,
  restAllowance,
})

// 2026-11-11 is a Wednesday. Mon 09, Tue 10, Sun 08, Sat 07, Fri 06, Thu 05.
const WED = '2026-11-11'

describe('dayStatus', () => {
  it('a finished session makes the day kept', () => {
    expect(dayStatus('2026-11-09', ctx(WED, [session('2026-11-09')]))).toBe('kept')
  })

  it('an unfinished session does not count', () => {
    const c = ctx(WED, [session('2026-11-05'), session('2026-11-09', false)])
    expect(dayStatus('2026-11-09', c)).toBe('missed')
  })

  it('a check-in makes a walk day kept', () => {
    const c = ctx(WED, [session('2026-11-02')], { habitCheckIns: ['2026-11-07'] })
    expect(dayStatus('2026-11-07', c)).toBe('kept')
  })

  it('rest days are wildcards: the first empty days of a week are rest, any weekday', () => {
    // Week Mon 09..Sun 15, today Wed 11. Mon 09 and Tue 10 empty.
    const c = ctx(WED, [session('2026-11-02')], {}, 1)
    expect(dayStatus('2026-11-09', c)).toBe('rest')
    expect(dayStatus('2026-11-10', c)).toBe('missed')
    const two = ctx(WED, [session('2026-11-02')], {}, 2)
    expect(dayStatus('2026-11-10', two)).toBe('rest')
  })

  it('wildcards reset every Monday', () => {
    // Sun 08 is the last day of the previous week; Mon 09 starts a new one.
    const c = ctx(WED, [session('2026-11-02')], {}, 1)
    expect(dayStatus('2026-11-03', c)).toBe('rest')
    expect(dayStatus('2026-11-04', c)).toBe('missed')
    expect(dayStatus('2026-11-09', c)).toBe('rest')
  })

  it('a session on a rest day still counts as kept', () => {
    expect(dayStatus('2026-11-08', ctx(WED, [session('2026-11-08')]))).toBe('kept')
  })

  it('a past planned day with nothing logged is missed', () => {
    expect(dayStatus('2026-11-10', ctx(WED, [session('2026-11-02')]))).toBe('missed')
  })

  it('a past walk day with nothing logged is missed', () => {
    expect(dayStatus('2026-11-07', ctx(WED, [session('2026-11-02')]))).toBe('missed')
  })

  it('today with nothing logged is pending', () => {
    expect(dayStatus(WED, ctx(WED, [session('2026-11-02')]))).toBe('pending')
  })

  it('today with a session is kept', () => {
    expect(dayStatus(WED, ctx(WED, [session(WED)]))).toBe('kept')
  })

  it('days after today are future', () => {
    expect(dayStatus('2026-11-12', ctx(WED, [session('2026-11-02')]))).toBe('future')
  })

  it('days before the first ever activity are none, not missed', () => {
    const c = ctx(WED, [session('2026-11-09')])
    expect(dayStatus('2026-11-05', c)).toBe('none')
    expect(dayStatus('2026-11-08', c)).toBe('none')
  })

  it('the earliest check-in also marks the start of history', () => {
    const c = ctx(WED, [], { habitCheckIns: ['2026-11-09'] })
    expect(dayStatus('2026-11-06', c)).toBe('none')
    expect(dayStatus('2026-11-10', c)).toBe('missed')
  })

  it('with no activity at all, past days are none and today is pending', () => {
    const c = ctx(WED)
    expect(dayStatus('2026-11-10', c)).toBe('none')
    expect(dayStatus(WED, c)).toBe('pending')
  })
})

describe('habitGrid', () => {
  it('is 12 weeks of 7 days, oldest first, Monday to Sunday, ending in the current week', () => {
    const grid = habitGrid(ctx(WED, [session('2026-11-09')]))
    expect(grid).toHaveLength(12)
    expect(grid.every(w => w.length === 7)).toBe(true)
    const last = grid[11]
    expect(last[0].date).toBe('2026-11-09') // Monday of the current week
    expect(last[6].date).toBe('2026-11-15') // Sunday
    expect(grid[0][0].date).toBe('2026-08-24') // 11 weeks earlier
    expect(last[0].status).toBe('kept')
    expect(last[2].status).toBe('pending') // today, Wednesday
    expect(last[3].status).toBe('future')
  })

  it('honors a custom number of weeks and a Sunday as today', () => {
    const grid = habitGrid(ctx('2026-11-15'), 2)
    expect(grid.map(w => w[0].date)).toEqual(['2026-11-02', '2026-11-09'])
    expect(grid[1][6].date).toBe('2026-11-15')
  })
})

describe('streak', () => {
  it('counts consecutive kept days back from today', () => {
    const c = ctx(WED, [session('2026-11-09'), session('2026-11-10'), session(WED)])
    expect(streak(c)).toEqual({ days: 3, atRisk: false })
  })

  it('a pending today does not break or count', () => {
    const c = ctx(WED, [session('2026-11-09'), session('2026-11-10')])
    expect(streak(c)).toEqual({ days: 2, atRisk: false })
  })

  it('rest days keep the chain and count', () => {
    // Fri 06 kept, Sat 07 walk checked, Sun 08 rest, Mon 09 kept, Tue 10 kept
    const c = ctx(WED, [session('2026-11-06'), session('2026-11-09'), session('2026-11-10')], { habitCheckIns: ['2026-11-07'] }, 1)
    expect(streak(c).days).toBe(5)
  })

  it('a check-in counts as kept for the chain', () => {
    const c = ctx('2026-11-08', [session('2026-11-06')], { habitCheckIns: ['2026-11-07'] })
    expect(streak(c).days).toBe(2) // Fri, Sat (check-in); Sun is today, still pending
  })

  it('a single isolated miss is tolerated: no break and no increment', () => {
    // Mon 09 kept, Tue 10 missed, Wed today kept, Fri 06 kept (Thu 05 kept)
    const c = ctx(WED, [session('2026-11-05'), session('2026-11-06'), session('2026-11-09'), session(WED)], { habitCheckIns: ['2026-11-07'] })
    // Wed, (Tue miss), Mon, (Sun miss), Sat check-in, Fri, Thu = 5 kept days
    expect(streak(c).days).toBe(5)
  })

  it('two consecutive misses stop the count', () => {
    // Thu 05 kept, Fri 06 missed, Sat 07 missed -> chain starts after them
    const c = ctx(WED, [session('2026-11-05'), session('2026-11-09'), session('2026-11-10')])
    // Tue, Mon, then Sun missed + Sat missed -> stop
    expect(streak(c).days).toBe(2)
  })

  it('is 0 when yesterday and the day before were both missed', () => {
    const c = ctx(WED, [session('2026-11-02')])
    expect(streak(c).days).toBe(0)
  })

  it('stops at the start of history instead of counting none days', () => {
    expect(streak(ctx(WED, [session('2026-11-10')])).days).toBe(1)
  })

  it('is 0 with no activity at all', () => {
    expect(streak(ctx(WED))).toEqual({ days: 0, atRisk: false })
  })

  it('atRisk when yesterday was missed and today is not kept yet', () => {
    const c = ctx(WED, [session('2026-11-06'), session('2026-11-09')])
    expect(streak(c).atRisk).toBe(true)
  })

  it('is not atRisk once today is kept', () => {
    const c = ctx(WED, [session('2026-11-06'), session('2026-11-09'), session(WED)])
    expect(streak(c).atRisk).toBe(false)
  })
})

describe('missedYesterday', () => {
  it('is true when yesterday was a missed planned day', () => {
    expect(missedYesterday(ctx(WED, [session('2026-11-09')]))).toBe(true)
  })

  it('is false when yesterday was kept', () => {
    expect(missedYesterday(ctx(WED, [session('2026-11-10')]))).toBe(false)
  })

  it('is false when yesterday was a rest day', () => {
    expect(missedYesterday(ctx('2026-11-09', [session('2026-11-06')], {}, 2))).toBe(false)
  })

  it('is false when yesterday is before the first activity', () => {
    expect(missedYesterday(ctx(WED, [session(WED)]))).toBe(false)
  })
})

describe('votes', () => {
  it('counts finished sessions, ignoring unfinished ones', () => {
    expect(votes(ctx(WED, [session('2026-11-09'), session('2026-11-10'), session(WED, false)]))).toBe(2)
  })

  it('adds check-ins on dates without a finished session', () => {
    const c = ctx(WED, [session('2026-11-09')], { habitCheckIns: ['2026-11-07', '2026-11-09'] })
    expect(votes(c)).toBe(2) // the session + the Saturday check-in; 11-09 is not counted twice
  })

  it('is 0 with no history', () => {
    expect(votes(ctx(WED))).toBe(0)
  })
})

describe('intentionFor', () => {
  const intentions = mergeConfig({ intentions: [{}, { time: '07:30', place: 'Gimnasio' }, { time: '', place: 'Casa' }, { time: '18:00', place: '' }] }).intentions
  const cfg = config({ intentions })

  it('returns time and place for a weekday', () => {
    expect(intentionFor(cfg, 1)).toEqual({ time: '07:30', place: 'Gimnasio' })
  })

  it('returns a partial intention when only one part is set', () => {
    expect(intentionFor(cfg, 2)).toEqual({ time: '', place: 'Casa' })
    expect(intentionFor(cfg, 3)).toEqual({ time: '18:00', place: '' })
  })

  it('returns null when both are empty', () => {
    expect(intentionFor(cfg, 0)).toBeNull()
    expect(intentionFor(cfg, 6)).toBeNull()
  })
})

describe('toggleCheckIn', () => {
  it('adds a date keeping the list sorted, without mutating the input', () => {
    const c = config({ habitCheckIns: ['2026-11-01', '2026-11-09'] })
    const next = toggleCheckIn(c, '2026-11-05')
    expect(next.habitCheckIns).toEqual(['2026-11-01', '2026-11-05', '2026-11-09'])
    expect(c.habitCheckIns).toEqual(['2026-11-01', '2026-11-09'])
    expect(next).not.toBe(c)
  })

  it('removes a date that is already checked in', () => {
    const c = config({ habitCheckIns: ['2026-11-01', '2026-11-09'] })
    expect(toggleCheckIn(c, '2026-11-01').habitCheckIns).toEqual(['2026-11-09'])
  })

  it('leaves every other config field untouched', () => {
    const c = config()
    expect(toggleCheckIn(c, '2026-11-05')).toEqual({ ...c, habitCheckIns: ['2026-11-05'] })
  })
})

describe('mergeConfig habit fields', () => {
  it('defaults habitCheckIns to [] and intentions to 7 empty entries', () => {
    const merged = mergeConfig({})
    expect(merged.habitCheckIns).toEqual([])
    expect(merged.intentions).toHaveLength(7)
    expect(merged.intentions.every(i => i.time === '' && i.place === '')).toBe(true)
  })

  it('keeps only valid ISO dates, deduplicated and sorted', () => {
    const merged = mergeConfig({ habitCheckIns: ['2026-11-09', 'nope', 5, null, '2026-02-30', '2026-11-01', '2026-11-09', '2026-1-1'] })
    expect(merged.habitCheckIns).toEqual(['2026-11-01', '2026-11-09'])
  })

  it('a non-array habitCheckIns falls back to []', () => {
    expect(mergeConfig({ habitCheckIns: '2026-11-09' }).habitCheckIns).toEqual([])
  })

  it('merges each intention index independently', () => {
    const merged = mergeConfig({
      intentions: [
        { time: '07:30', place: '  Gym  ' },
        { time: '25:00', place: 'Casa' },
        'garbage',
        { time: '6:30', place: 42 },
        null,
        { time: '23:59' },
        { place: 'Parque' },
        { time: '10:00', place: 'extra index ignored' },
      ],
    })
    expect(merged.intentions).toEqual([
      { time: '07:30', place: 'Gym' },
      { time: '', place: 'Casa' },
      { time: '', place: '' },
      { time: '', place: '' },
      { time: '', place: '' },
      { time: '23:59', place: '' },
      { time: '', place: 'Parque' },
    ])
  })

  it('a non-array intentions falls back to the defaults', () => {
    expect(mergeConfig({ intentions: { 0: { time: '07:00' } } }).intentions).toEqual(DEFAULT_CONFIG.intentions)
  })

  it('an old stored config without the new fields still merges as before', () => {
    const old = { heightCm: 180, blockStart: '2026-01-01', blockEnd: '2026-02-01', poolLengthM: 50 }
    const merged = mergeConfig(old)
    expect(merged).toMatchObject({ heightCm: 180, blockStart: '2026-01-01', blockEnd: '2026-02-01', poolLengthM: 50, habitCheckIns: [] })
    expect(merged.goal).toEqual(DEFAULT_CONFIG.goal)
    expect(merged.weeklyRoutine).toEqual(DEFAULT_CONFIG.weeklyRoutine)
    expect(merged.routineExercises).toEqual({})
    expect(merged.intentions).toEqual(DEFAULT_CONFIG.intentions)
  })
})
