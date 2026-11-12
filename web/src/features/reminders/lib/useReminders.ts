import { useCallback, useEffect, useState } from 'react'
import type { Config, Session } from '../../../lib/types'
import { loadActiveDraft } from '../../session/lib/activeSession'
import { dueReminders, nextReminder, type Reminder } from './scheduler'
import { loadReminderPrefs, saveReminderPrefs, type ReminderPrefs } from './prefs'
import { alreadyNotified, showReminderNotification } from './notify'

const CHANGED = 'fitplan:reminders-changed'
/** setTimeout stores a 32-bit delay: longer waits fire immediately. */
const MAX_DELAY = 2 ** 31 - 1
/** A reminder this close to its time counts as "on time" (timers drift and
 *  background tabs are throttled); later than this it is a late catch-up. */
const ON_TIME_MS = 2 * 60_000

/** Reminder prefs shared by every component of this tab. */
export function useReminderPrefs(): [ReminderPrefs, (next: ReminderPrefs) => void] {
  const [prefs, setPrefs] = useState(loadReminderPrefs)
  useEffect(() => {
    const on = () => setPrefs(loadReminderPrefs())
    window.addEventListener(CHANGED, on)
    return () => window.removeEventListener(CHANGED, on)
  }, [])
  const update = useCallback((next: ReminderPrefs) => {
    saveReminderPrefs(next)
    setPrefs(next)
    window.dispatchEvent(new Event(CHANGED))
  }, [])
  return [prefs, update]
}

const markFired = (key: string) => {
  saveReminderPrefs({ ...loadReminderPrefs(), lastFired: key })
}

/** Runs the reminders while the app is open or backgrounded: a timer for the
 *  next planned time, a re-check when the app returns to the foreground, and
 *  the in-app banner for a planned time that already passed. Never fires
 *  during a workout in progress. Returns the pending in-app reminder. */
export function useReminders(config: Config, sessions: readonly Session[], enabled: boolean) {
  const [banner, setBanner] = useState<Reminder | null>(null)

  useEffect(() => {
    if (!enabled) { setBanner(null); return }
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const fire = async (r: Reminder, now: number) => {
      markFired(r.key) // before any await: StrictMode / a second tab cannot double-fire
      if (await alreadyNotified(r.key)) return
      const onTime = now - r.at <= ON_TIME_MS
      if ((onTime || document.hidden) && (await showReminderNotification(r))) return
      if (!cancelled) setBanner(r)
    }

    const check = () => {
      clearTimeout(timer)
      const now = new Date()
      const input = { config, sessions, now }
      const lastFired = loadReminderPrefs().lastFired
      // The banner goes away once the session is done (no longer due).
      setBanner(b => (b && dueReminders(input, null).some(r => r.key === b.key) ? b : null))
      if (!loadActiveDraft()) {
        const [due] = dueReminders(input, lastFired)
        if (due) void fire(due, now.getTime())
      }
      const next = nextReminder(input, loadReminderPrefs().lastFired)
      if (next) timer = setTimeout(check, Math.min(Math.max(next.at - Date.now(), 0) + 250, MAX_DELAY))
    }

    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    check()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    }
  }, [config, sessions, enabled])

  return { banner, dismiss: () => setBanner(null) }
}
