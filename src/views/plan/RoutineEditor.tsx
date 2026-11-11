// Editor de una rutina: campos de cabecera, y por bloque las filas de
// ejercicios con info, reordenar, editar y quitar. Cada cambio se confirma
// al instante via commit (savePlan en el padre).
import { useEffect, useState } from 'react'
import type { PlanRoutine, PlanSlot, RoutineBlock, TrainingPlan } from '../../types'
import ExerciseSheet from '../../components/ExerciseSheet'
import { slotExerciseName } from '../../lib/planQueries'
import { addCustomExercise, addSlot, moveSlot, removeSlot, renameRoutine, routineExerciseIds, swapExercise } from '../../lib/planEdits'
import { formatTarget } from '../../lib/phases'
import ExercisePicker, { type NewExerciseInput } from './ExercisePicker'
import { Icon } from './icons'
import SlotEditSheet from './SlotEditSheet'

export type Commit = (next: TrainingPlan, message?: string) => void

type PickerState = { mode: 'add'; blockId: string } | { mode: 'swap'; blockId: string; slotId: string }

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

const prescription = (s: PlanSlot): string => {
  const target = formatTarget(s.target)
  if (s.target.kind === 'note') return 'Indicación'
  return `${s.sets} × ${target}`
}

export default function RoutineEditor({ plan, routine, onBack, onCommit, onArchive }: {
  plan: TrainingPlan
  routine: PlanRoutine
  onBack: () => void
  onCommit: Commit
  onArchive: () => void
}) {
  const [info, setInfo] = useState<PlanSlot | null>(null)
  const [edit, setEdit] = useState<{ blockId: string; slot: PlanSlot } | null>(null)
  const [picker, setPicker] = useState<PickerState | null>(null)

  const name = (s: PlanSlot) => slotExerciseName(plan, s)
  const singleBlock = routine.blocks.length === 1

  const pick = (exerciseId: string) => {
    if (!picker) return
    const next = picker.mode === 'add'
      ? addSlot(plan, routine.id, picker.blockId, exerciseId)
      : swapExercise(plan, routine.id, picker.blockId, picker.slotId, exerciseId)
    setPicker(null)
    setEdit(null)
    onCommit(next, picker.mode === 'add' ? 'Ejercicio agregado' : 'Ejercicio cambiado')
  }

  const create = (input: NewExerciseInput) => {
    if (!picker) return
    const withCustom = addCustomExercise(plan, input)
    const created = withCustom.customExercises.at(-1)
    if (!created) return
    const next = picker.mode === 'add'
      ? addSlot(withCustom, routine.id, picker.blockId, created.id)
      : swapExercise(withCustom, routine.id, picker.blockId, picker.slotId, created.id)
    setPicker(null)
    setEdit(null)
    onCommit(next, 'Ejercicio creado')
  }

  const move = (block: RoutineBlock, s: PlanSlot, dir: -1 | 1) => {
    const pos = block.slots.findIndex(x => x.id === s.id) + dir + 1
    onCommit(moveSlot(plan, routine.id, block.id, s.id, dir), `Movido a la posición ${pos}`)
  }

  const exerciseCount = routine.blocks.reduce((n, b) => n + b.slots.length, 0)

  return (
    <>
      <button type="button" className="ghost pe-back" onClick={onBack}>
        <Icon name="back" /> Rutinas
      </button>
      <div className="eyebrow">Rutina · {exerciseCount === 1 ? '1 ejercicio' : `${exerciseCount} ejercicios`}</div>
      <h1>{routine.name}</h1>

      <div className="card pe-card-form">
        <TextField id="pe-r-name" label="Nombre" value={routine.name} required onCommit={v => onCommit(renameRoutine(plan, routine.id, { name: v }))} />
        <TextField id="pe-r-focus" label="Enfoque" value={routine.focus} onCommit={v => onCommit(renameRoutine(plan, routine.id, { focus: v }))} />
        <TextField id="pe-r-dur" label="Duración" value={routine.duration} placeholder="50–70 min" onCommit={v => onCommit(renameRoutine(plan, routine.id, { duration: v }))} />
        <TextField id="pe-r-intro" label="Introducción" value={routine.intro} multiline onCommit={v => onCommit(renameRoutine(plan, routine.id, { intro: v }))} />
      </div>

      {routine.blocks.map(block => (
        <section key={block.id} aria-label={block.title}>
          <div className="section-title">{block.title}</div>
          {block.note && <p className="hint">{block.note}</p>}

          {block.slots.length === 0 ? (
            <div className="pe-empty">
              <h3>Sin ejercicios</h3>
              <p className="muted">Agrega el primero desde la biblioteca.</p>
            </div>
          ) : (
            <ul className="pe-list">
              {block.slots.map((s, i) => (
                <li key={s.id} className="pe-slot">
                  <div className="pe-slot-text">
                    <div className="pe-name">{name(s)}</div>
                    <div className="pe-sub num">
                      {prescription(s)}
                      {s.restSec > 0 && ` · descanso ${s.restSec} s`}
                      {s.primary && ' · principal'}
                    </div>
                  </div>
                  <div className="pe-actions">
                    <button type="button" className="pe-icon" aria-label={`Ver ficha de ${name(s)}`} onClick={() => setInfo(s)}><Icon name="info" /></button>
                    <button type="button" className="pe-icon" aria-label={`Subir ${name(s)}`} disabled={i === 0} onClick={() => move(block, s, -1)}><Icon name="up" /></button>
                    <button type="button" className="pe-icon" aria-label={`Bajar ${name(s)}`} disabled={i === block.slots.length - 1} onClick={() => move(block, s, 1)}><Icon name="down" /></button>
                    <button type="button" className="pe-icon" aria-label={`Editar ${name(s)}`} onClick={() => setEdit({ blockId: block.id, slot: s })}><Icon name="edit" /></button>
                    <button type="button" className="pe-icon pe-icon-danger" aria-label={`Quitar ${name(s)}`} onClick={() => onCommit(removeSlot(plan, routine.id, block.id, s.id), 'Ejercicio quitado')}><Icon name="trash" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className={`${singleBlock ? 'primary ' : ''}block pe-gap-md`}
            onClick={() => setPicker({ mode: 'add', blockId: block.id })}
          >
            Agregar ejercicio
          </button>
        </section>
      ))}

      <div className="section-title pe-danger-title">Archivar</div>
      <p className="hint">La rutina sale de tu plan activo, pero tu historial la conserva y puedes restaurarla.</p>
      <button type="button" className="danger block pe-gap-md" onClick={onArchive}>Archivar rutina</button>

      {info && <ExerciseSheet exerciseId={info.exerciseId} slot={info} onClose={() => setInfo(null)} />}
      {edit && !picker && (
        <SlotEditSheet
          key={edit.slot.id}
          plan={plan}
          routineId={routine.id}
          blockId={edit.blockId}
          slot={edit.slot}
          onClose={() => setEdit(null)}
          onSave={next => { setEdit(null); onCommit(next) }}
          onSwap={() => setPicker({ mode: 'swap', blockId: edit.blockId, slotId: edit.slot.id })}
        />
      )}
      {picker && (
        <ExercisePicker
          plan={plan}
          mode={picker.mode}
          currentExerciseId={picker.mode === 'swap' ? edit?.slot.exerciseId : undefined}
          taken={routineExerciseIds(plan, routine.id)}
          onPick={pick}
          onCreate={create}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  )
}
