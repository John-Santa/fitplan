// Local training reminders: pure scheduling over the stored intentions. No
// clock reads (every function receives `now`) and no storage, so results are
// deterministic. All dates are local calendar dates, never UTC.
import type { Config, Session } from '../../../lib/types'
import { todayISO } from '../../../lib/calc'
import { dayStatus, intentionFor } from '../../habit/lib/habit'

export interface ReminderInput {
  sessions: readonly Session[]
  config: Config
  now: Date
}

export interface Reminder {
  /** Dedupe key: local date + planned time. */
  key: string
  /** Local date, YYYY-MM-DD. */
  date: string
  /** Planned time, HH:MM. */
  time: string
  place: string
  /** Epoch ms of the planned time in the device's local zone. */
  at: number
}

/** Days looked ahead for the next reminder (covers one full week). */
const LOOKAHEAD_DAYS = 8

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

export const reminderKey = (date: string, time: string): string => `${date}@${time}`

/** The reminder planned for `day` (a local midnight Date), or null when the
 *  weekday has no valid time or is a rest day. Ignores done/fired state. */
function planned(config: Config, day: Date): Reminder | null {
  const it = intentionFor(config, day.getDay())
  const m = it && TIME.exec(it.time)
  if (!it || !m) return null
  if (config.weeklyRoutine[day.getDay()].kind === 'rest') return null
  const date = todayISO(day)
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(m[1]), Number(m[2])).getTime()
  return { key: reminderKey(date, it.time), date, time: it.time, place: it.place, at }
}

const midnight = (now: Date, plus = 0): Date => new Date(now.getFullYear(), now.getMonth(), now.getDate() + plus)

/** The earliest not-yet-fired reminder strictly after `now` whose day has no
 *  finished session or check-in, within the next week. null when none. */
export function nextReminder(input: ReminderInput, lastFiredKey: string | null): Reminder | null {
  const ctx = { sessions: input.sessions, config: input.config, today: todayISO(input.now) }
  const nowMs = input.now.getTime()
  for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
    const r = planned(input.config, midnight(input.now, i))
    if (!r || r.at <= nowMs || r.key === lastFiredKey) continue
    if (i === 0 && dayStatus(r.date, ctx) === 'kept') continue
    return r
  }
  return null
}

/** Reminders whose time already passed today and that are neither done nor
 *  fired: what the in-app reminder shows on open. */
export function dueReminders(input: ReminderInput, lastFiredKey: string | null): Reminder[] {
  const ctx = { sessions: input.sessions, config: input.config, today: todayISO(input.now) }
  const r = planned(input.config, midnight(input.now))
  if (!r || r.at > input.now.getTime() || r.key === lastFiredKey) return []
  return dayStatus(r.date, ctx) === 'kept' ? [] : [r]
}
