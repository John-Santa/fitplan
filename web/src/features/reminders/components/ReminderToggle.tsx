import type { ReminderSupport } from '../lib/support'

// Presentational: the container owns permission and storage.
const NOTE: Record<ReminderSupport, string | null> = {
  granted: null,
  default: 'Al activarlo, el navegador te pedirá permiso para mostrar avisos.',
  denied: 'Bloqueaste las notificaciones. Actívalas en los ajustes del navegador; mientras tanto verás el aviso dentro de la app.',
  unsupported: 'Este navegador no admite notificaciones. Verás el aviso dentro de la app al abrirla.',
  'ios-install': 'Instala la app para recibir recordatorios: en iPhone, usa Compartir y Añadir a pantalla de inicio. Mientras tanto verás el aviso dentro de la app.',
}

export function ReminderToggle({ support, enabled, onToggle, busy = false }: {
  support: ReminderSupport
  enabled: boolean
  onToggle: () => void
  busy?: boolean
}) {
  const note = NOTE[support]
  return (
    <section className="hab-card" aria-label="Recordatorios">
      <div className="hab-row">
        <h2 className="hab-title">Recordatorios</h2>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Recordarme a la hora de mi plan"
          className={enabled ? 'hab-switch on' : 'hab-switch'}
          disabled={busy}
          onClick={onToggle}
        >
          <span />
        </button>
      </div>
      <p className="hab-sub">Te avisamos a la hora que definiste en tu plan de acción, si ese día aún no entrenaste.</p>
      <p className="hab-sub">
        Los avisos llegan con la app abierta o en segundo plano; con la app cerrada el navegador no permite
        programarlos de forma confiable, así que al abrirla verás el recordatorio pendiente.
      </p>
      {note && <p className="hab-sub hab-note" role="status">{note}</p>}
      {enabled && support === 'granted' && (
        <p className="hab-sub hab-note" role="status">Notificaciones activas en este dispositivo.</p>
      )}
    </section>
  )
}
