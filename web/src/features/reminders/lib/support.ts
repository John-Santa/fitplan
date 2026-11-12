// What this device can do for reminders. `reminderSupport` is pure; only
// `detectReminderEnv` touches browser globals.

export type NotificationPermissionState = 'default' | 'granted' | 'denied'

export interface ReminderEnv {
  hasNotification: boolean
  /** null when the Notification API is missing. */
  permission: NotificationPermissionState | null
  hasServiceWorker: boolean
  isIOS: boolean
  /** Running as an installed app (home-screen icon), not a browser tab. */
  standalone: boolean
}

/** 'ios-install': iOS only delivers web notifications to the installed app.
 *  'unsupported': no Notification API or no service worker.
 *  Otherwise the permission state. */
export type ReminderSupport = 'unsupported' | 'ios-install' | 'denied' | 'default' | 'granted'

export function reminderSupport(env: ReminderEnv): ReminderSupport {
  if (env.isIOS && !env.standalone) return 'ios-install'
  if (!env.hasNotification || !env.hasServiceWorker || env.permission === null) return 'unsupported'
  return env.permission
}

export function detectReminderEnv(): ReminderEnv {
  const hasNotification = typeof Notification !== 'undefined'
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  // iPadOS 13+ reports a desktop Safari UA: tell it apart by touch points.
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone =
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && (navigator as { standalone?: boolean }).standalone === true)
  return {
    hasNotification,
    permission: hasNotification ? Notification.permission : null,
    hasServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    isIOS,
    standalone,
  }
}
