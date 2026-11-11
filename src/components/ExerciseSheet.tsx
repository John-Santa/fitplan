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

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l10.5-6.5z" />
    </svg>
  )
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5.5c0 4.5 3 8.2 7 9.5 4-1.3 7-5 7-9.5V6l-7-3z" />
    </svg>
  )
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7h12l-3-3M17 17H5l3 3" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

/** Hoja con la ficha de un ejercicio: video (enlace a MuscleWiki), prescripcion
 *  del plan, pasos, claves y alternativa. El enlace sale de la app en una pestaña nueva. */
export default function ExerciseSheet({ exerciseId, slot, onClose }: ExerciseSheetProps) {
  const { plan } = useStore()
  const ex = resolveExercise(plan, exerciseId)

  if (!ex) {
    return (
      <BottomSheet title="Ejercicio no disponible" onClose={onClose}>
        <div className="sheet-empty">
          <p>No encontramos este ejercicio en tu biblioteca.</p>
          <p>Puede que se haya quitado del plan.</p>
        </div>
      </BottomSheet>
    )
  }

  const title = slot?.label ?? ex.name
  const target = slot ? formatTarget(slot.target) : ''
  const alternativeName = ex.alternativeId ? resolveExercise(plan, ex.alternativeId)?.name : undefined
  const alternative = alternativeName ?? ex.alternativeText
  const hasCues = ex.cues.length > 0

  return (
    <BottomSheet title={title} titleHidden onClose={onClose}>
      <a
        className="sheet-media"
        href={musclewikiUrl(ex)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="sheet-media-grid" aria-hidden="true" />
        <span className="sheet-play" aria-hidden="true"><PlayIcon /></span>
        <span className="sheet-caption">
          <span className="sheet-caption-text">
            <span className="sheet-dot" aria-hidden="true" />
            {musclewikiLinkLabel(ex)}
          </span>
          <ExternalIcon />
        </span>
        <span className="sheet-sr">(se abre en una pestaña nueva)</span>
      </a>

      <div className="sheet-heading">
        <h3 className="sheet-ex-title">{title}</h3>
        <ul className="sheet-chips">
          <li className="sheet-chip">{CATEGORY_LABEL[ex.category]}</li>
          <li className="sheet-chip">{ex.equipment}</li>
          {slot?.primary && <li className="sheet-chip sheet-chip-primary">Principal</li>}
        </ul>
      </div>

      {slot && (
        <dl className="sheet-stats" aria-label="Prescripción">
          <div className="sheet-stat">
            <dt>Series y reps</dt>
            <dd>{target ? `${slot.sets} × ${target}` : `${slot.sets}`}</dd>
          </div>
          <div className="sheet-stat">
            <dt>Descanso</dt>
            <dd>{restLabel(slot.restSec)}</dd>
          </div>
        </dl>
      )}

      {(ex.primaryMuscles.length > 0 || ex.secondaryMuscles.length > 0) && (
        <section className="sheet-section">
          <h3>Músculos implicados</h3>
          <ul className="sheet-pills">
            {ex.primaryMuscles.map(m => (
              <li key={`p-${m}`} className="sheet-pill sheet-pill-primary">{m}</li>
            ))}
            {ex.secondaryMuscles.map(m => (
              <li key={`s-${m}`} className="sheet-pill">{m}</li>
            ))}
          </ul>
        </section>
      )}

      {ex.steps.length > 0 && (
        <section className="sheet-section">
          <h3>Cómo se hace</h3>
          <ol className="sheet-steps">
            {ex.steps.map((step, i) => (
              <li key={i} className="sheet-step">
                <span className="sheet-step-num" aria-hidden="true">{i + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(hasCues || slot?.note) && (
        <section className="sheet-safe" aria-labelledby="sheet-safe-title">
          <div className="sheet-safe-head">
            <ShieldIcon />
            <h3 id="sheet-safe-title">Cuida tu espalda</h3>
          </div>
          {hasCues && (
            <ul className="sheet-cues">
              {ex.cues.map((cue, i) => (
                <li key={i}>{cue}</li>
              ))}
            </ul>
          )}
          {slot?.note && (
            <p className="sheet-note"><strong>Claves técnicas:</strong> {slot.note}</p>
          )}
        </section>
      )}

      {alternative && (
        <section className="sheet-section">
          <h3>Alternativa</h3>
          <div className="sheet-alt">
            <span className="sheet-alt-icon" aria-hidden="true"><SwapIcon /></span>
            <span className="sheet-alt-text">{alternative}</span>
            <span className="sheet-alt-chevron" aria-hidden="true"><ChevronIcon /></span>
          </div>
        </section>
      )}

      <p className="sheet-attribution">El video se abre en MuscleWiki.com, fuera de la app.</p>
    </BottomSheet>
  )
}
