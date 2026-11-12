// Vista "Plan": lista de rutinas, editor de rutina, archivar/restaurar y
import { routineDisplayName, sortByFocus } from '../../../lib/planQueries'
// restablecer el plan original. Cada edicion se persiste al instante con
// savePlan; las acciones destructivas piden confirmacion y ofrecen deshacer.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlanRoutine, TrainingPlan } from '../../../lib/types'
import { useStore } from '../../../lib/store'
import { useToast } from '../../../components/ui'
import { addCustomExercise, addRoutine, archiveRoutine, resetToTemplate, restoreRoutine } from '../../../lib/planEdits'
import { blockWeekNumber, phaseForWeek } from '../../../lib/phases'
import { restAllowance, weeklyTarget } from '../../habit/lib/week'
import ExerciseSheet from '../../../components/ExerciseSheet'
import ConfirmSheet from '../components/ConfirmSheet'
import { Icon } from '../components/icons'
import ExercisePicker from '../components/ExercisePicker'
import RoutineEditor from '../components/RoutineEditor'
import Sheet from '../../../components/BottomSheet'
import '../components/plan-editor.css'

const UNDO_MS = 6000

const countExercises = (r: PlanRoutine) => r.blocks.reduce((n, b) => n + b.slots.length, 0)
const exercisesLabel = (n: number) => (n === 1 ? '1 ejercicio' : `${n} ejercicios`)

const NO_TAKEN: ReadonlySet<string> = new Set()
const weeksLabel = (from: number, to: number, short = false) =>
  `${short ? 'Sem' : from === to ? 'semana' : 'semanas'} ${from === to ? from : `${from}–${to}`}`

type Dialog = { kind: 'new' } | { kind: 'archive'; routineId: string } | { kind: 'reset' } | null

export default function PlanEditor({ onOpenGuide }: { onOpenGuide: () => void }) {
  const { plan, config, savePlan } = useStore()
  const toast = useToast()
  const [openId, setOpenId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [editing, setEditing] = useState(false)
  const [library, setLibrary] = useState(false)
  const [infoId, setInfoId] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ message: string; previous: TrainingPlan } | null>(null)
  const undoTimer = useRef<number | undefined>(undefined)
  const toastRef = useRef(toast)
  toastRef.current = toast

  useEffect(() => () => window.clearTimeout(undoTimer.current), [])

  const persist = useCallback((next: TrainingPlan) => {
    savePlan(next).catch(() => toastRef.current.show('No se pudo guardar. Intenta de nuevo.'))
  }, [savePlan])

  const clearUndo = useCallback(() => {
    window.clearTimeout(undoTimer.current)
    setUndo(null)
  }, [])

  /** Edicion normal: guarda y confirma con un aviso breve. */
  const commit = useCallback((next: TrainingPlan, message = 'Guardado') => {
    if (next === plan) return
    clearUndo()
    persist(next)
    toastRef.current.show(message)
  }, [plan, persist, clearUndo])

  /** Accion destructiva: guarda y ofrece deshacer unos segundos. */
  const commitWithUndo = useCallback((next: TrainingPlan, message: string) => {
    window.clearTimeout(undoTimer.current)
    setUndo({ message, previous: plan })
    persist(next)
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS)
  }, [plan, persist])

  const doUndo = () => {
    if (!undo) return
    persist(undo.previous)
    clearUndo()
    toast.show('Cambio deshecho')
  }

  const active = sortByFocus(plan.routines.filter(r => !r.archived))
  const archived = sortByFocus(plan.routines.filter(r => r.archived))
  const open = openId ? plan.routines.find(r => r.id === openId && !r.archived) : undefined
  const archiveTarget = dialog?.kind === 'archive' ? plan.routines.find(r => r.id === dialog.routineId) : undefined

  const createRoutine = (name: string) => {
    const next = addRoutine(plan, name)
    const created = next.routines.at(-1)
    setDialog(null)
    commit(next, 'Rutina creada')
    if (created) setOpenId(created.id)
  }

  const live = <div role="status" aria-live="polite">{toast.node}</div>

  const undoBar = undo && (
    <div className="pe-undo pe-scope" role="status">
      <span>{undo.message}</span>
      <button type="button" onClick={doUndo}>Deshacer</button>
    </div>
  )

  const dialogs = (
    <>
      {dialog?.kind === 'new' && <NewRoutineSheet onCreate={createRoutine} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'archive' && archiveTarget && (
        <ConfirmSheet
          title={`¿Archivar «${archiveTarget.name}»?`}
          confirmLabel="Archivar rutina"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            const next = archiveRoutine(plan, archiveTarget.id)
            setDialog(null)
            setOpenId(null)
            commitWithUndo(next, 'Rutina archivada')
          }}
        >
          <p>La rutina deja de aparecer en tu plan activo, pero <strong>tu historial se conserva</strong>: tus sesiones siguen mostrando su nombre y sus ejercicios. Puedes restaurarla cuando quieras.</p>
        </ConfirmSheet>
      )}
      {dialog?.kind === 'reset' && (
        <ConfirmSheet
          title="¿Restablecer el plan original?"
          confirmLabel="Restablecer plan"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            const next = resetToTemplate(plan)
            setDialog(null)
            setOpenId(null)
            commitWithUndo(next, 'Plan restablecido')
          }}
        >
          <p>Las rutinas del plan original (Día 1 a Día 5) vuelven a como venían: <strong>los cambios que les hiciste se pierden</strong>.</p>
          <p>Tu historial, tus rutinas propias y tus ejercicios propios se conservan.</p>
        </ConfirmSheet>
      )}
    </>
  )

  if (open) {
    return (
      <div className="pe-scope">
        <RoutineEditor
          plan={plan}
          routine={open}
          onBack={() => setOpenId(null)}
          onCommit={commit}
          onArchive={() => setDialog({ kind: 'archive', routineId: open.id })}
        />
        {dialogs}
        {live}
        {undoBar}
      </div>
    )
  }

  const week = blockWeekNumber(new Date(), config.blockStart)
  const phase = phaseForWeek(plan, week)
  const total = plan.weeks
  const target = weeklyTarget(plan)
  const rests = restAllowance(plan)
  const markerPct = Math.min(Math.max((week - 0.5) / total, 0), 1) * 100

  return (
    <div className="pe-scope">
      <div className="pe-head">
        <div>
          <h1>Tu plan</h1>
          <p className="pe-plan-name">{plan.name} · {total} semanas</p>
        </div>
        <button type="button" className="pe-edit-btn" aria-pressed={editing} onClick={() => setEditing(e => !e)}>
          <Icon name="edit" /> {editing ? 'Listo' : 'Editar'}
        </button>
      </div>

      <section className="pe-phase" aria-label="Fase actual">
        <div className="pe-phase-top">
          <div>
            <span className="pe-phase-kicker">Fase actual</span>
            <h2 className="pe-phase-title">
              {phase ? `${phase.goal} (${weeksLabel(phase.fromWeek, phase.toWeek)})` : 'Fuera del plan'}
            </h2>
          </div>
          {phase && <span className="pe-phase-pill">{phase.sets} · {phase.intensity}</span>}
        </div>
        <div className="pe-timeline">
          <div className="pe-bar" role="img" aria-label={`Semana ${week} de ${total}`}>
            {plan.phases.map((p, i) => (
              <span
                key={i}
                className={`pe-seg pe-seg-${i % 5}`}
                data-current={phase === p}
                style={{ flex: p.toWeek - p.fromWeek + 1 }}
              />
            ))}
          </div>
          {phase && <span className="pe-marker" style={{ left: `${markerPct}%` }} />}
        </div>
        <div className="pe-weekline">
          <strong>Semana {Math.min(week, total)} de {total}</strong>
          {phase?.loadNote && <span>· {phase.loadNote}</span>}
        </div>
        <div className="pe-legend">
          {plan.phases.map((p, i) => (
            <div key={i} className="pe-legend-item" data-current={phase === p} aria-current={phase === p ? 'step' : undefined}>
              <span className={`pe-legend-dot pe-seg-${i % 5}`} aria-hidden="true" />
              <span className="pe-legend-range">{weeksLabel(p.fromWeek, p.toWeek, true)}</span>
              <span className="pe-legend-name">{p.goal}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="pe-weekcard" aria-label="Tu semana">
        <h2>Tu semana</h2>
        <p className="pe-weekcard-count">
          <strong>{target} {target === 1 ? 'entrenamiento' : 'entrenamientos'}</strong> + <strong>{rests} {rests === 1 ? 'comodín' : 'comodines'} de descanso</strong>
        </p>
        <p className="pe-weekcard-note">Haz tus rutinas en el orden y los días que quieras; los días libres son tus comodines de descanso.</p>
      </section>

      <div className="pe-links">
        <button type="button" className="pe-link" onClick={onOpenGuide}>
          <span className="pe-link-icon"><Icon name="shield" /></span>
          <span>
            <span className="pe-link-title">Guía de seguridad</span>
            <span className="pe-link-sub">Señales de alarma</span>
          </span>
        </button>
        <button type="button" className="pe-link" onClick={() => setLibrary(true)}>
          <span className="pe-link-icon"><Icon name="book" /></span>
          <span>
            <span className="pe-link-title">Biblioteca de ejercicios</span>
            <span className="pe-link-sub">Busca y consulta</span>
          </span>
        </button>
      </div>

      {editing && (
        <section className="pe-manage" aria-label="Gestionar plan">
          <h2>Rutinas activas</h2>
          {active.length === 0 ? (
            <div className="pe-empty">
              <h3>No tienes rutinas activas</h3>
              <p className="muted">Crea una rutina nueva o restaura una archivada.</p>
            </div>
          ) : (
            <ul className="pe-list">
              {active.map(r => (
                <li key={r.id}>
                  <button type="button" className="pe-routine" onClick={() => setOpenId(r.id)}>
                    <span className="pe-routine-text">
                      <span className="pe-name">{routineDisplayName(r.name)}</span>
                      {r.focus && <span className="pe-sub">{r.focus}</span>}
                      <span className="pe-meta">
                        {r.duration && <span className="pill">{r.duration}</span>}
                        <span className="pill">{exercisesLabel(countExercises(r))}</span>
                      </span>
                    </span>
                    <span className="pe-chev" aria-hidden="true"><Icon name="next" /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="primary block pe-gap-md" onClick={() => setDialog({ kind: 'new' })}>
            <Icon name="plus" /> Agregar rutina
          </button>

          {archived.length > 0 && (
            <details className="pe-archived">
              <summary>Archivadas ({archived.length})</summary>
              <p className="hint">Se conservan con su historial. Restaurarlas las vuelve a poner en tu plan.</p>
              <ul className="pe-list">
                {archived.map(r => (
                  <li key={r.id} className="pe-slot">
                    <div className="pe-slot-text">
                      <div className="pe-name">{routineDisplayName(r.name)}</div>
                      <div className="pe-sub">{exercisesLabel(countExercises(r))}</div>
                    </div>
                    <button type="button" onClick={() => commit(restoreRoutine(plan, r.id), 'Rutina restaurada')} aria-label={`Restaurar ${r.name}`}>
                      Restaurar
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <h2 className="pe-gap-lg pe-danger-title">Restablecer</h2>
          <p className="hint">Vuelve a poner las rutinas del plan original. Tu historial y tus rutinas propias se conservan.</p>
          <button type="button" className="danger block pe-gap-md" onClick={() => setDialog({ kind: 'reset' })}>
            Restablecer plan original
          </button>
        </section>
      )}

      {library && (
        <ExercisePicker
          plan={plan}
          mode="browse"
          taken={NO_TAKEN}
          onPick={id => { setLibrary(false); setInfoId(id) }}
          onCreate={input => { setLibrary(false); commit(addCustomExercise(plan, input), 'Ejercicio creado') }}
          onClose={() => setLibrary(false)}
        />
      )}
      {infoId && <ExerciseSheet exerciseId={infoId} onClose={() => setInfoId(null)} />}

      {dialogs}
      {live}
      {undoBar}
    </div>
  )
}

function NewRoutineSheet({ onCreate, onClose }: { onCreate: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet className="pe-scope" title="Agregar rutina" onClose={onClose}>
      <form
        noValidate
        onSubmit={e => {
          e.preventDefault()
          if (name.trim() === '') { setError('Escribe un nombre para la rutina.'); return }
          onCreate(name)
        }}
      >
        <div className="pe-field">
          <label htmlFor="pe-new-routine">Nombre de la rutina</label>
          <input
            id="pe-new-routine" value={name} autoComplete="off" placeholder="Hombros y brazos"
            onChange={e => { setName(e.target.value); setError(null) }}
            aria-invalid={error ? true : undefined} aria-describedby={error ? 'pe-new-routine-err' : undefined}
          />
          {error && <p id="pe-new-routine-err" className="pe-error" role="alert">{error}</p>}
        </div>
        <button type="submit" className="primary block pe-gap-lg">Crear rutina</button>
      </form>
    </Sheet>
  )
}
