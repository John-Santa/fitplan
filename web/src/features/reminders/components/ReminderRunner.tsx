import { useStore } from '../../../lib/store'
import { useReminderPrefs, useReminders } from '../lib/useReminders'
import { ReminderBanner } from './ReminderBanner'

/** Mounted once in the app shell: runs the reminders and shows the in-app one. */
export function ReminderRunner({ onOpen }: { onOpen: () => void }) {
  const { config, sessions } = useStore()
  const [prefs] = useReminderPrefs()
  const { banner, dismiss } = useReminders(config, sessions, prefs.enabled)
  return <ReminderBanner reminder={banner} onOpen={() => { dismiss(); onOpen() }} onDismiss={dismiss} />
}
