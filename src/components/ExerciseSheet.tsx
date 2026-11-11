import { useStore } from '../lib/store'
import { resolveExercise } from '../lib/library'
import { musclewikiLinkLabel, musclewikiUrl } from '../lib/musclewiki'
import { formatTarget } from '../lib/phases'
import type { ExerciseCategory, PlanSlot } from '../types'
import BottomSheet from './BottomSheet'

export interface ExerciseSheetProps {
  /** Id de la biblioteca o de un ejercicio propio del plan (resolveExercise). */
  exerciseId: string
  /** Prescripcion del plan cuando se abre desde una rutina o la sesion. */
  slot?: PlanSlot
  onClose: () => void
}

const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  strength: 'Fuerza',
  core: 'Core',
  mobility: 'Movilidad',
  cardio: 'Cardio',
}

/** "90 s" o "2 min": minutos solo cuando son exactos. */
export function restLabel(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} min`
  return `${seconds} s`
}

/** Hoja con la ficha de un ejercicio: prescripcion del plan, pasos, claves y
 *  enlace a MuscleWiki (sale de la app en una pestaña nueva). */
export default function ExerciseSheet({ exerciseId, slot, onClose }: ExerciseSheetProps) {
  const { plan } = useStore()
  const ex = resolveExercise(plan, exerciseId)

  if (!ex) {
    return (
      <BottomSheet title="Ejercicio no disponible" onClose={onClose}>
        <p>No encontramos este ejercicio en tu biblioteca. Puede que se haya quitado del plan.</p>
      </BottomSheet>
    )
  }

  const target = slot ? formatTarget(slot.target) : ''
  const alternativeName = ex.alternativeId ? resolveExercise(plan, ex.alternativeId)?.name : undefined
  const alternative = alternativeName ?? ex.alternativeText

  return (
    <BottomSheet title={slot?.label ?? ex.name} onClose={onClose}>
      <p className="sheet-meta">
        {CATEGORY_LABEL[ex.category]} · {ex.equipment}
      </p>

      {slot && (
        <section className="sheet-rx card" aria-label="Prescripción">
          {target && <p className="sheet-rx-sets">{slot.sets} × {target}</p>}
          <p>Descanso {restLabel(slot.restSec)}</p>
        </section>
      )}

      {slot?.note && (
        <section className="sheet-section">
          <h3>Claves técnicas</h3>
          <p>{slot.note}</p>
        </section>
      )}

      {(ex.primaryMuscles.length > 0 || ex.secondaryMuscles.length > 0) && (
        <section className="sheet-section">
          <h3>Músculos</h3>
          <ul className="sheet-pills">
            {ex.primaryMuscles.map(m => (
              <li key={`p-${m}`} className="pill good">{m}</li>
            ))}
            {ex.secondaryMuscles.map(m => (
              <li key={`s-${m}`} className="pill">{m}</li>
            ))}
          </ul>
        </section>
      )}

      {ex.steps.length > 0 && (
        <section className="sheet-section">
          <h3>Cómo se hace</h3>
          <ol className="sheet-steps">
            {ex.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      {ex.cues.length > 0 && (
        <section className="sheet-section">
          <h3>Cuida tu espalda</h3>
          <ul className="sheet-cues">
            {ex.cues.map((cue, i) => (
              <li key={i}>{cue}</li>
            ))}
          </ul>
        </section>
      )}

      {alternative && (
        <section className="sheet-section">
          <h3>Alternativa</h3>
          <p>{alternative}</p>
        </section>
      )}

      <a
        className="primary sheet-cta"
        href={musclewikiUrl(ex)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </svg>
        {musclewikiLinkLabel(ex)}
        <span className="sheet-sr">(se abre en una pestaña nueva)</span>
      </a>
      <p className="sheet-attribution">El video se abre en MuscleWiki.com, fuera de la app.</p>
    </BottomSheet>
  )
}
