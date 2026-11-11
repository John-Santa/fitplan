import type { PlanSlot, RoutineBlock, TrainingPlan } from '../../types'
import { resolveExercise } from '../../lib/library'
import { slotExerciseName } from '../../lib/planQueries'
import { Check } from '../../components/ui'
import { InfoIcon } from './PlanIcons'

interface Props {
  plan: TrainingPlan
  block: RoutineBlock
  /** Items marcados. Solo estado de pantalla: no se guarda en el historial. */
  ticked: Record<string, boolean>
  onToggle: (slotId: string) => void
  onInfo: (slot: PlanSlot) => void
}

/** Calentamiento fijo: lista de verificacion al inicio de la sesion. */
export default function WarmupStep({ plan, block, ticked, onToggle, onInfo }: Props) {
  const done = block.slots.filter(s => ticked[s.id]).length
  return (
    <section className="ses-warm">
      <h1 className="ses-title">Calentamiento fijo</h1>
      <div className="ses-chips">
        <span className="ses-chip strong">{done} de {block.slots.length}</span>
        <span className="ses-chip">10 min</span>
      </div>
      {block.note && <p className="ses-cue">{block.note}</p>}
      <ul className="ses-checklist">
        {block.slots.map(slot => {
          const ex = resolveExercise(plan, slot.exerciseId)
          const on = !!ticked[slot.id]
          return (
            <li key={slot.id} className="ses-checkitem">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                className={on ? 'ses-tick on' : 'ses-tick'}
                onClick={() => onToggle(slot.id)}
              >
                <span className="ses-tick-box"><Check on={on} /></span>
                <span className="ses-tick-text">{slot.note || slotExerciseName(plan, slot)}</span>
              </button>
              {ex && (
                <button type="button" className="ses-iconbtn" aria-label={`Ver ficha de ${slotExerciseName(plan, slot)}`} onClick={() => onInfo(slot)}>
                  <InfoIcon />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
