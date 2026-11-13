// Platform support for local reminders and their per-device preferences.
import { afterEach, describe, expect, it } from 'vitest'
import { reminderSupport, type ReminderEnv } from './support'
import { loadReminderPrefs, saveReminderPrefs } from './prefs'

const env = (over: Partial<ReminderEnv> = {}): ReminderEnv => ({
  hasNotification: true, permission: 'default', hasServiceWorker: true, isIOS: false, standalone: false, ...over,
})

describe('reminderSupport', () => {
  it('maps the permission when notifications and the service worker exist', () => {
    expect(reminderSupport(env({ permission: 'default' }))).toBe('default')
    expect(reminderSupport(env({ permission: 'granted' }))).toBe('granted')
    expect(reminderSupport(env({ permission: 'denied' }))).toBe('denied')
  })

  it('iOS outside the installed app asks to install, even without a Notification API', () => {
    expect(reminderSupport(env({ isIOS: true, standalone: false, hasNotification: false, permission: null }))).toBe('ios-install')
  })

  it('iOS with the installed app follows the permission', () => {
    expect(reminderSupport(env({ isIOS: true, standalone: true, permission: 'granted' }))).toBe('granted')
  })

  it('is unsupported without Notification or a service worker', () => {
    expect(reminderSupport(env({ hasNotification: false, permission: null }))).toBe('unsupported')
    expect(reminderSupport(env({ hasServiceWorker: false }))).toBe('unsupported')
  })
})

describe('reminder prefs', () => {
  const store = new Map<string, string>()
  const stub = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
  const g = globalThis as { localStorage?: unknown }
  afterEach(() => { store.clear(); delete g.localStorage })

  it('defaults to off with nothing fired', () => {
    g.localStorage = stub
    expect(loadReminderPrefs()).toEqual({ enabled: false, lastFired: null })
  })

  it('round-trips the toggle and the last fired key', () => {
    g.localStorage = stub
    saveReminderPrefs({ enabled: true, lastFired: '2026-11-09@07:30' })
    expect(loadReminderPrefs()).toEqual({ enabled: true, lastFired: '2026-11-09@07:30' })
  })

  it('falls back to the defaults on corrupt data or missing storage', () => {
    g.localStorage = stub
    store.set('fitplan:reminders', '{nope')
    expect(loadReminderPrefs()).toEqual({ enabled: false, lastFired: null })
    delete g.localStorage
    expect(loadReminderPrefs()).toEqual({ enabled: false, lastFired: null })
    expect(() => saveReminderPrefs({ enabled: true, lastFired: null })).not.toThrow()
  })
})
