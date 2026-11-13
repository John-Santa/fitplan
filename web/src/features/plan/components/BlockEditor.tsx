// Bloques de una rutina con sus filas de ejercicios (info, reordenar, editar,
// quitar, agregar, cambiar). Lo usan el editor de rutina y el del calentamiento,
// que se edita como una rutina de un solo bloque (ver lib/warmupEdits).
import { useState } from 'react'
import type { PlanRoutine, PlanSlot, RoutineBlock, TrainingPlan } from '../../../lib/types'
import ExerciseSheet from '../../../components/ExerciseSheet'
import { slotExerciseName } from '../../../lib/planQueries'
import { addCustomExercise, addSlot, moveSlot, removeSlot, routineExerciseIds, swapExercise } from '../../../lib/planEdits'
import { formatTarget } from '../../../lib/phases'
import ExercisePicker, { type NewExerciseInput } from './ExercisePicker'
import { Icon } from './icons'
import SlotEditSheet from './SlotEditSheet'

export type Commit = (next: TrainingPlan, message?: string) => void

type PickerState = { mode: 'add'; blockId: string } | { mode: 'swap'; blockId: string; slotId: string }

const prescription = (s: PlanSlot): string => {
  const target = formatTarget(s.target)
  if (s.target.kind === 'note') return 'Indicación'
  return `${s.sets} × ${target}`
}

export default function BlockEditor({ plan, routine, onCommit }: {
  plan: TrainingPlan
  routine: PlanRoutine
  onCommit: Commit
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

  return (
    <>
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
