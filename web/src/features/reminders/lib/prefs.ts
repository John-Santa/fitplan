// Per-device reminder preferences. Notification permission is per device, so
// this lives in localStorage and is never synced (not part of Config).

const KEY = 'fitplan:reminders'

export interface ReminderPrefs {
  enabled: boolean
  /** Key of the last reminder shown (notification or in-app), for dedupe. */
  lastFired: string | null
}

const DEFAULTS: ReminderPrefs = { enabled: false, lastFired: null }

export function loadReminderPrefs(): ReminderPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const p = JSON.parse(raw) as Partial<ReminderPrefs>
    return {
      enabled: p.enabled === true,
      lastFired: typeof p.lastFired === 'string' ? p.lastFired : null,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveReminderPrefs(p: ReminderPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Storage blocked or full: reminders keep working for this session.
  }
}
