// Vista "Plan": lista de rutinas, editor de rutina, archivar/restaurar y
// restablecer el plan original. Cada edicion se persiste al instante con
// savePlan; las acciones destructivas piden confirmacion y ofrecen deshacer.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlanRoutine, TrainingPlan } from '../types'
import { useStore } from '../lib/store'
import { useToast } from '../components/ui'
import { addRoutine, archiveRoutine, resetToTemplate, restoreRoutine } from '../lib/planEdits'
import ConfirmSheet from './plan/ConfirmSheet'
import { Icon } from './plan/icons'
import RoutineEditor from './plan/RoutineEditor'
import Sheet from '../components/BottomSheet'
import './plan/plan-editor.css'

const UNDO_MS = 6000

const countExercises = (r: PlanRoutine) => r.blocks.reduce((n, b) => n + b.slots.length, 0)
const exercisesLabel = (n: number) => (n === 1 ? '1 ejercicio' : `${n} ejercicios`)

type Dialog = { kind: 'new' } | { kind: 'archive'; routineId: string } | { kind: 'reset' } | null

export default function PlanEditor({ onOpenGuide }: { onOpenGuide: () => void }) {
  const { plan, config, savePlan } = useStore()
  const toast = useToast()
  const [openId, setOpenId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
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

  const active = plan.routines.filter(r => !r.archived)
  const archived = plan.routines.filter(r => r.archived)
  const open = openId ? plan.routines.find(r => r.id === openId && !r.archived) : undefined
  const archiveTarget = dialog?.kind === 'archive' ? plan.routines.find(r => r.id === dialog.routineId) : undefined
  const assignedInWeek = archiveTarget
    ? config.weeklyRoutine.some(d => d.kind === 'training' && d.routineId === archiveTarget.id)
    : false

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
          {assignedInWeek && <p className="pe-warn">Está asignada en tu semana. Elige otra rutina para ese día en Ajustes.</p>}
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

  return (
    <div className="pe-scope">
      <div className="pe-head">
        <div>
          <div className="eyebrow">Plan</div>
          <h1>Tu plan</h1>
        </div>
        <button type="button" onClick={onOpenGuide}>
          <Icon name="book" /> Guía
        </button>
      </div>
      <p className="muted pe-plan-name">{plan.name}</p>

      <div className="section-title">Rutinas activas</div>
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
                  <span className="pe-name">{r.name}</span>
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
        Agregar rutina
      </button>

      {archived.length > 0 && (
        <details className="pe-archived">
          <summary>Archivadas ({archived.length})</summary>
          <p className="hint">Se conservan con su historial. Restaurarlas las vuelve a poner en tu plan.</p>
          <ul className="pe-list">
            {archived.map(r => (
              <li key={r.id} className="pe-slot">
                <div className="pe-slot-text">
                  <div className="pe-name">{r.name}</div>
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

      <div className="section-title pe-danger-title">Restablecer</div>
      <p className="hint">Vuelve a poner las rutinas del plan original. Tu historial y tus rutinas propias se conservan.</p>
      <button type="button" className="danger block pe-gap-md" onClick={() => setDialog({ kind: 'reset' })}>
        Restablecer plan original
      </button>

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
