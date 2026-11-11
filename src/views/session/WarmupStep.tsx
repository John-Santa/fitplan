import { useState } from 'react'
import type { PlanSlot, RoutineBlock, TrainingPlan } from '../../types'
import { resolveExercise } from '../../lib/library'
import { slotExerciseName } from '../../lib/planQueries'
import { Check } from '../../components/ui'
import { ChevronIcon, InfoIcon } from './PlanIcons'

interface Props {
  plan: TrainingPlan
  block: RoutineBlock
  /** Items marcados. Solo estado de pantalla: no se guarda en el historial. */
  ticked: Record<string, boolean>
  onToggle: (slotId: string) => void
  onInfo: (slot: PlanSlot) => void
}

/** Calentamiento fijo: lista de verificacion colapsable al inicio de la sesion. */
export default function WarmupStep({ plan, block, ticked, onToggle, onInfo }: Props) {
  const [open, setOpen] = useState(true)
  const done = block.slots.filter(s => ticked[s.id]).length
  return (
    <div className="ex-panel">
      <h2>Calentamiento fijo</h2>
      <div className="metabar">
        <span className="num">{done} de {block.slots.length}</span>
        <span>10 min</span>
      </div>
      <p className="hint">{block.note}</p>
      <button className="disclosure-toggle" aria-expanded={open} aria-controls="sp-warmup-list" onClick={() => setOpen(o => !o)}>
        <span className="lbl">{open ? 'Ocultar la lista' : 'Mostrar la lista'}</span>
        <span className="glyph"><ChevronIcon open={open} /></span>
      </button>
      {open && (
        <ul id="sp-warmup-list" className="sp-checklist">
          {block.slots.map(slot => {
            const ex = resolveExercise(plan, slot.exerciseId)
            const on = !!ticked[slot.id]
            return (
              <li key={slot.id} className="sp-checkitem">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className={on ? 'sp-tick on' : 'sp-tick'}
                  onClick={() => onToggle(slot.id)}
                >
                  <span className="sp-tick-box"><Check on={on} /></span>
                  <span className="sp-tick-text">{slot.note || slotExerciseName(plan, slot)}</span>
                </button>
                {ex && (
                  <button type="button" className="sp-info" aria-label={`Ver ficha de ${slotExerciseName(plan, slot)}`} onClick={() => onInfo(slot)}>
                    <InfoIcon />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
