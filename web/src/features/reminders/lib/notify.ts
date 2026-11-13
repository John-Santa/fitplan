// Shows a reminder through the service worker registration (the only way iOS
// and Android Chrome accept web notifications). Never throws: false means
// "nothing was shown", and the caller falls back to the in-app banner.
import type { Reminder } from './scheduler'

export function reminderMessage(r: Reminder): { title: string; body: string } {
  const when = [r.time, r.place].filter(Boolean).join(' · ')
  return { title: 'Hora de entrenar', body: `Hoy entrenas a las ${when}. Aún no registraste tu sesión.` }
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null
  } catch {
    return null
  }
}

/** True when a notification for this reminder is already on screen (shown
 *  earlier by the timer or by the service worker): no second one, no banner. */
export async function alreadyNotified(key: string): Promise<boolean> {
  const reg = await registration()
  if (!reg) return false
  try {
    return (await reg.getNotifications({ tag: key })).length > 0
  } catch {
    return false
  }
}

export async function showReminderNotification(r: Reminder): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  const reg = await registration()
  if (!reg) return false
  try {
    const { title, body } = reminderMessage(r)
    await reg.showNotification(title, {
      body,
      tag: r.key,
      icon: `${import.meta.env.BASE_URL}icon-192.png`,
      data: { url: import.meta.env.BASE_URL },
    })
    return true
  } catch {
    return false
  }
}
