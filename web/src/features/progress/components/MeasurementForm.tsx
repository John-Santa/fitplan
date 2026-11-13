import type { Measurement } from '../../../lib/types'
import { MEASUREMENT_KEYS, MEASUREMENT_LABELS, MEASUREMENT_STEPS, MEASUREMENT_UNITS } from '../../../lib/plan'
import type { MeasureForm } from '../lib/measureForm'

/** Deriva de las tablas de plan.ts (MEASUREMENT_LABELS/UNITS/STEPS), en vez
 *  de repetir a mano una segunda lista de nueve campos: esa duplicacion es
 *  justo lo que dejaba a esta lista incompleta en silencio cuando se agregaba
 *  un campo a Measurement sin tocar este archivo. */
const CAMPOS: { k: keyof Omit<Measurement, 'date'>; label: string; unit: string; step: string }[] =
  MEASUREMENT_KEYS.map(k => ({
    k,
    label: MEASUREMENT_LABELS[k],
    unit: MEASUREMENT_UNITS[k],
    step: MEASUREMENT_STEPS[k],
  }))

interface Props {
  form: MeasureForm
  /** A field changed; `key` is 'date' or a Measurement field. */
  onChange: (key: string, value: string) => void
  onSubmit: () => void
  onCancel: () => void
}

/** The "Nueva medición" card: shows the form exactly as it will be saved. */
export default function MeasurementForm({ form, onChange, onSubmit, onCancel }: Props) {
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="formgrid">
        <div>
          <label htmlFor="f-date">Fecha</label>
          <input id="f-date" type="date" value={form.date ?? ''} onChange={e => onChange('date', e.target.value)} />
        </div>
        {CAMPOS.map(c => (
          <div key={c.k}>
            <label htmlFor={`f-${c.k}`}>{c.label} ({c.unit})</label>
            <input
              id={`f-${c.k}`} type="number" inputMode="decimal" step={c.step}
              value={form[c.k] ?? ''} onChange={e => onChange(c.k, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="btnrow" style={{ marginTop: 12 }}>
        <button className="primary grow" onClick={onSubmit}>Guardar</button>
        <button className="ghost" onClick={onCancel}>Cancelar</button>
      </div>
      <p className="hint">
        Si esa fecha ya tiene una medición, aparece aquí para editarla. Lo que ves es lo que se guarda: si vacías un
        campo, se borra. Fecha y peso son obligatorios.
      </p>
    </div>
  )
}
