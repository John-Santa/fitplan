import { useState } from 'react'
import { detectReminderEnv, reminderSupport } from '../lib/support'
import { useReminderPrefs } from '../lib/useReminders'
import { ReminderToggle } from './ReminderToggle'

/** Container: owns the permission prompt (only on a tap) and the stored toggle. */
export function ReminderSettings() {
  const [prefs, setPrefs] = useReminderPrefs()
  const [env, setEnv] = useState(detectReminderEnv)
  const [busy, setBusy] = useState(false)
  const support = reminderSupport(env)

  const toggle = async () => {
    if (prefs.enabled) { setPrefs({ ...prefs, enabled: false }); return }
    setBusy(true)
    try {
      // Asked only here, from a user action. Denied or unsupported still
      // enables the in-app reminder; the toggle explains what is missing.
      if (support === 'default') {
        try { await Notification.requestPermission() } catch { /* old Safari callback API: state re-read below */ }
      }
      setEnv(detectReminderEnv())
      setPrefs({ ...prefs, enabled: true })
    } finally {
      setBusy(false)
    }
  }

  return <ReminderToggle support={support} enabled={prefs.enabled} busy={busy} onToggle={() => void toggle()} />
}
