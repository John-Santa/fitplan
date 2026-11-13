// Extra service-worker code for local reminders. The Workbox-generated worker
// loads it with importScripts (see vite.config.ts), so it runs in the worker
// scope and stays optional: nothing here is required for the app to work.
//
// Platform limits this code cannot lift: there is no reliable way to schedule
// a notification while the PWA is closed. Notification Triggers was
// abandoned, and Periodic Background Sync is Chromium-only, installed-only
// and not time-precise. The page writes the upcoming reminders to the cache
// below; a periodic sync, when the browser grants and runs one, shows the
// ones whose time already passed.

// Keep in sync with src/features/reminders/lib/background.ts.
const CACHE = 'magnifit-reminders'
const SCHEDULE = 'reminders-schedule.json'
const FIRED = 'reminders-fired.json'
const SYNC_TAG = 'magnifit-reminders'
/** Past this age a reminder is stale: do not show a "train now" hours later. */
const MAX_AGE_MS = 3 * 60 * 60 * 1000

const keyOf = name => new URL(name, self.registration.scope).href

async function readJson(cache, name, fallback) {
  const res = await cache.match(keyOf(name))
  if (!res) return fallback
  try { return await res.json() } catch { return fallback }
}

async function showDueReminders() {
  const cache = await caches.open(CACHE)
  const { reminders = [] } = await readJson(cache, SCHEDULE, {})
  const fired = await readJson(cache, FIRED, [])
  const now = Date.now()
  const due = reminders.filter(r => r.at <= now && now - r.at <= MAX_AGE_MS && !fired.includes(r.key))
  for (const r of due) {
    const open = await self.registration.getNotifications({ tag: r.key })
    if (open.length === 0) {
      await self.registration.showNotification(r.title, { body: r.body, tag: r.key, icon: r.icon, data: { url: r.url } })
    }
    fired.push(r.key)
  }
  if (due.length > 0) {
    await cache.put(keyOf(FIRED), new Response(JSON.stringify(fired.slice(-20)), { headers: { 'Content-Type': 'application/json' } }))
  }
}

self.addEventListener('periodicsync', event => {
  if (event.tag === SYNC_TAG) event.waitUntil(showDueReminders())
})

// Tapping a reminder focuses the open app or opens it.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) if ('focus' in client) return client.focus()
      return self.clients.openWindow(url)
    }),
  )
})
