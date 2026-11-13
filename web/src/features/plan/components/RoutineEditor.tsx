// Editor de una rutina: campos de cabecera, y por bloque las filas de
// ejercicios con info, reordenar, editar y quitar. Cada cambio se confirma
// al instante via commit (savePlan en el padre).
import { useEffect, useState } from 'react'
import type { PlanRoutine, TrainingPlan } from '../../../lib/types'
import { routineDisplayName } from '../../../lib/planQueries'
import { renameRoutine } from '../../../lib/planEdits'
import BlockEditor, { type Commit } from './BlockEditor'
import { Icon } from './icons'

/** Campo de texto que guarda al salir (blur). Se resincroniza si el valor del
 *  plan cambia por fuera (p. ej. al deshacer). */
function TextField({ id, label, value, onCommit, multiline, required, placeholder }: {
  id: string
  label: string
  value: string
  onCommit: (v: string) => void
  multiline?: boolean
  required?: boolean
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setDraft(value) }, [value])

  const blur = () => {
    const v = draft.trim()
    if (required && v === '') {
      setDraft(value)
      setError('El nombre no puede quedar vacío.')
      return
    }
    setError(null)
    if (v !== value) onCommit(v)
  }
  const common = {
    id,
    value: draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: blur,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-err` : undefined,
  }
  return (
    <div className="pe-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea {...common} /> : <input {...common} autoComplete="off" />}
      {error && <p id={`${id}-err`} className="pe-error" role="alert">{error}</p>}
    </div>
  )
}

export default function RoutineEditor({ plan, routine, onBack, onCommit, onArchive }: {
  plan: TrainingPlan
  routine: PlanRoutine
  onBack: () => void
  onCommit: Commit
  onArchive: () => void
}) {
  const exerciseCount = routine.blocks.reduce((n, b) => n + b.slots.length, 0)

  return (
    <>
      <button type="button" className="ghost pe-back" onClick={onBack}>
        <Icon name="back" /> Plan
      </button>
      <div className="eyebrow">Rutina · {exerciseCount === 1 ? '1 ejercicio' : `${exerciseCount} ejercicios`}</div>
      <h1>{routineDisplayName(routine.name)}</h1>

      <div className="card pe-card-form">
        <TextField id="pe-r-name" label="Nombre" value={routine.name} required onCommit={v => onCommit(renameRoutine(plan, routine.id, { name: v }))} />
        <TextField id="pe-r-focus" label="Enfoque" value={routine.focus} onCommit={v => onCommit(renameRoutine(plan, routine.id, { focus: v }))} />
        <TextField id="pe-r-dur" label="Duración" value={routine.duration} placeholder="50–70 min" onCommit={v => onCommit(renameRoutine(plan, routine.id, { duration: v }))} />
        <TextField id="pe-r-intro" label="Introducción" value={routine.intro} multiline onCommit={v => onCommit(renameRoutine(plan, routine.id, { intro: v }))} />
      </div>

      <BlockEditor plan={plan} routine={routine} onCommit={onCommit} />

      <div className="section-title pe-danger-title">Archivar</div>
      <p className="hint">La rutina sale de tu plan activo, pero tu historial la conserva y puedes restaurarla.</p>
      <button type="button" className="danger block pe-gap-md" onClick={onArchive}>Archivar rutina</button>
    </>
  )
}
