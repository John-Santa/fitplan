import { useState } from 'react'
import BottomSheet from '../../../components/BottomSheet'
import { useToast } from '../../../components/ui'
import { todayISO } from '../../../lib/calc'
import { useStore } from '../../../lib/store'
import { lastWeight, parseWeight, WEIGHT_ERROR } from '../lib/weightInput'

/** Body of the "Peso de hoy" sheet: one decimal input and the save button. */
export function WeightForm({ value, error, onChange, onSave }: {
  value: string
  error: string | null
  onChange: (value: string) => void
  onSave: () => void
}) {
  return (
    <form onSubmit={e => { e.preventDefault(); onSave() }}>
      <label className="hoy-log-field">
        <span>Peso (kg)</span>
        <input
          type="number" inputMode="decimal" step="0.1" min="0" autoFocus
          value={value} onChange={e => onChange(e.target.value)}
        />
      </label>
      {error != null && <p className="hoy-log-error" role="alert">{error}</p>}
      <button type="submit" className="hoy-cta">Guardar</button>
    </form>
  )
}

/** One-tap weight log for Hoy: "Anotar peso" opens a sheet with a single field
 *  prefilled with the last recorded weight and saves it for today. The save
 *  merges over today's measurement, so body-composition fields already
 *  recorded for today are kept. */
export default function QuickWeight() {
  const { measurements, mergeMeasurement } = useStore()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const show = () => {
    setValue(lastWeight(measurements))
    setError(null)
    setOpen(true)
  }

  const save = async () => {
    const weight = parseWeight(value)
    if (weight == null) {
      setError(WEIGHT_ERROR)
      return
    }
    if (saving) return
    setSaving(true)
    try {
      await mergeMeasurement({ date: todayISO(), weight })
      setOpen(false)
      toast.show('Peso guardado')
    } catch {
      setError('No se pudo guardar el peso')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" className="hoy-cta secondary hoy-checkin" onClick={show}>
        Anotar peso
      </button>
      {open && (
        <BottomSheet title="Peso de hoy" onClose={() => setOpen(false)}>
          <WeightForm value={value} error={error} onChange={v => { setValue(v); setError(null) }} onSave={() => void save()} />
        </BottomSheet>
      )}
      {toast.node}
    </>
  )
}
