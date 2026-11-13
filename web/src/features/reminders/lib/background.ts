// Best-effort bonus: hand the upcoming reminders to the service worker so a
// Periodic Background Sync, where the browser grants and runs one, can show
// the ones that came due while the app was closed. Chromium-only, installed
// apps only and not time-precise, so it is feature-detected and never
// required: the app works the same without it.
import { reminderMessage } from './notify'
import type { Reminder } from './scheduler'

// Keep in sync with src/sw/reminders-sw.js.
const CACHE = 'magnifit-reminders'
const SCHEDULE = 'reminders-schedule.json'
const FIRED = 'reminders-fired.json'
const SYNC_TAG = 'magnifit-reminders'
/** Asked of the browser; it decides the real cadence. */
const MIN_INTERVAL_MS = 60 * 60 * 1000

export interface SchedulePayload {
  reminders: { key: string; at: number; title: string; body: string; icon: string; url: string }[]
}

export function buildSchedule(reminders: readonly Reminder[], icon: string, url: string): SchedulePayload {
  return { reminders: reminders.map(r => ({ key: r.key, at: r.at, ...reminderMessage(r), icon, url })) }
}

interface PeriodicSyncManager {
  register(tag: string, options: { minInterval: number }): Promise<void>
  unregister(tag: string): Promise<void>
}

const periodicSyncOf = (reg: ServiceWorkerRegistration): PeriodicSyncManager | null =>
  (reg as ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager }).periodicSync ?? null

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null
  } catch {
    return null
  }
}

const url = (reg: ServiceWorkerRegistration, name: string) => new URL(name, reg.scope).href
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } })

/** Writes (or, with null, clears) the schedule the worker reads and registers
 *  (or removes) the periodic sync. Silent on any failure. */
export async function syncBackground(reminders: readonly Reminder[] | null): Promise<void> {
  const reg = await registration()
  if (!reg || typeof caches === 'undefined') return
  try {
    const cache = await caches.open(CACHE)
    const periodic = periodicSyncOf(reg)
    if (reminders === null) {
      await cache.delete(url(reg, SCHEDULE))
      await cache.delete(url(reg, FIRED))
      await periodic?.unregister(SYNC_TAG)
      return
    }
    const base = import.meta.env.BASE_URL
    await cache.put(url(reg, SCHEDULE), json(buildSchedule(reminders, `${base}icon-192.png`, base)))
    // Only where the browser lets this installed app run one.
    if (periodic && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      await periodic.register(SYNC_TAG, { minInterval: MIN_INTERVAL_MS })
    }
  } catch {
    // Unsupported or blocked: the in-app timer and banner still work.
  }
}

/** True when the worker already showed this reminder from a periodic sync. */
export async function firedInBackground(key: string): Promise<boolean> {
  const reg = await registration()
  if (!reg || typeof caches === 'undefined') return false
  try {
    const res = await (await caches.open(CACHE)).match(url(reg, FIRED))
    const fired: unknown = res ? await res.json() : []
    return Array.isArray(fired) && fired.includes(key)
  } catch {
    return false
  }
}
