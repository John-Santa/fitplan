import type { Reminder } from '../lib/scheduler'

/** In-app reminder shown on open when the planned time already passed. */
export function ReminderBanner({ reminder, onOpen, onDismiss }: {
  reminder: Reminder | null
  onOpen: () => void
  onDismiss: () => void
}) {
  if (!reminder) return null
  const when = [reminder.time, reminder.place].filter(Boolean).join(' · ')
  return (
    <div className="rem-banner" role="status">
      <p className="rem-text">
        <strong>Hora de entrenar</strong>
        <span>Hoy te tocaba a las {when} y aún no registras tu sesión.</span>
      </p>
      <div className="rem-actions">
        <button type="button" onClick={onOpen}>Ir a Hoy</button>
        <button type="button" onClick={onDismiss} aria-label="Descartar recordatorio">Descartar</button>
      </div>
    </div>
  )
}
