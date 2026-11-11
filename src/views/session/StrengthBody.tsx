import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlanRoutine, PlanSlot, SetLog, StrengthSession } from '../../types'
import { lastPerformance } from '../../lib/calc'
import { blockWeekNumber, phaseForWeek, setsForSlot } from '../../lib/phases'
import { buildSessionSteps, findRoutine, groupLabel, slotExerciseName, weekLabel, type SessionStep } from '../../lib/planQueries'
import { useStore } from '../../lib/store'
import ExerciseSheet from '../../components/ExerciseSheet'
import { RedFlagsSheet } from '../Guide'
import SessionShell from './SessionShell'
import SlotCard from './SlotCard'
import WarmupStep from './WarmupStep'
import { AlertIcon } from './PlanIcons'
import './session-plan.css'

interface Props {
  session: StrengthSession
  onChange: (s: StrengthSession) => void
  onFinish: () => void
  onDiscard: () => void
}

type RailState = 'current' | 'done' | 'partial' | 'pending'

/** Un paso del riel: el calentamiento fijo o un paso de trabajo. */
type Item = { kind: 'warmup' } | { kind: 'work'; step: SessionStep }

/** Series de un slot en la semana; un item de solo nota cuenta como una marca. */
const slotTarget = (slot: PlanSlot, phase: ReturnType<typeof phaseForWeek>): number =>
  slot.target.kind === 'note' ? 1 : setsForSlot(slot, phase)

/** La rutina de la sesion siempre deberia estar en el plan (archivar no
 *  borra), pero una sesion con una rutina desconocida no debe romper la app. */
export default function StrengthBody(props: Props) {
  const { plan } = useStore()
  const routine = findRoutine(plan, props.session.routineId)
  if (!routine) {
    return (
      <div className="card">
        <h2>Rutina no disponible</h2>
        <p>Esta rutina ya no está en el plan, así que no se puede continuar la sesión.</p>
        <button className="danger" onClick={props.onDiscard}>Descartar</button>
      </div>
    )
  }
  return <StrengthSessionView {...props} routine={routine} />
}

function StrengthSessionView({ session, routine, onChange, onFinish, onDiscard }: Props & { routine: PlanRoutine }) {
  const { sessions, meta, saveMeta, plan, config } = useStore()
  // lastPerformance solo mira fuerza (calc.ts la tipa a StrengthSession[]):
  // una sesion de natacion no tiene .sets.
  const strengthSessions = sessions.filter((s): s is StrengthSession => s.kind === 'strength')
  const week = blockWeekNumber(new Date(session.startedAt), config.blockStart)
  const phase = phaseForWeek(plan, week)
  const steps = useMemo(() => buildSessionSteps(routine, week), [routine, week])
  const hasWarmup = routine.warmup && plan.warmup.slots.length > 0
  const items: Item[] = useMemo(
    () => [...(hasWarmup ? [{ kind: 'warmup' } as const] : []), ...steps.map(step => ({ kind: 'work', step }) as const)],
    [hasWarmup, steps],
  )

  const [currentIndex, setCurrentIndex] = useState(0)
  const [cueOpen, setCueOpen] = useState<Record<string, boolean>>({})
  const [warmupTicked, setWarmupTicked] = useState<Record<string, boolean>>({})
  const [sheetSlot, setSheetSlot] = useState<PlanSlot | null>(null)
  const [flagsOpen, setFlagsOpen] = useState(false)
  const railRef = useRef<HTMLDivElement>(null)

  // El riel puede desplazarse en horizontal cuando las celdas de 44px no
  // caben. Al cambiar de paso se trae la celda actual a la vista con el minimo
  // movimiento ('nearest' no hace nada si ya se ve ni mueve la pagina). Solo
  // depende de currentIndex, asi que no se dispara al teclear peso o reps.
  useEffect(() => {
    const cell = railRef.current?.children.item(currentIndex)
    if (cell instanceof HTMLElement) cell.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [currentIndex])

  const nameOf = (slot: PlanSlot) => slotExerciseName(plan, slot)
  const doneOf = (slot: PlanSlot) =>
    Math.min(session.sets.filter(s => s.exerciseId === slot.exerciseId && s.done).length, slotTarget(slot, phase))
  const stepDone = (step: SessionStep) => step.slots.reduce((a, s) => a + doneOf(s), 0)
  const stepTarget = (step: SessionStep) => step.slots.reduce((a, s) => a + slotTarget(s, phase), 0)
  const itemName = (it: Item) => (it.kind === 'warmup' ? 'Calentamiento' : it.step.slots.map(nameOf).join(' + '))

  const update = (exerciseId: string, setIndex: number, patch: Partial<SetLog>) => {
    const idx = session.sets.findIndex(s => s.exerciseId === exerciseId && s.setIndex === setIndex)
    const next = session.sets.slice()
    if (idx >= 0) next[idx] = { ...next[idx], ...patch }
    else next.push({ exerciseId, setIndex, weight: null, reps: null, done: false, ...patch })
    onChange({ ...session, sets: next })
  }

  const setPain = (exerciseId: string, value: number | null) => {
    const { [exerciseId]: _removed, ...rest } = session.pain ?? {}
    onChange({ ...session, pain: value === null ? rest : { ...rest, [exerciseId]: value } })
  }

  const totalDone = steps.reduce((a, st) => a + stepDone(st), 0)
  const totalTarget = steps.reduce((a, st) => a + stepTarget(st), 0)

  const safeIndex = Math.min(currentIndex, Math.max(items.length - 1, 0))
  const item = items[safeIndex]
  const multiBlock = routine.blocks.length > 1

  const rail = items.map((it, i) => {
    let state: RailState
    let label: string
    let done: number
    let target: number
    if (it.kind === 'warmup') {
      done = plan.warmup.slots.filter(s => warmupTicked[s.id]).length
      target = plan.warmup.slots.length
      label = 'Cal'
    } else {
      done = stepDone(it.step)
      target = stepTarget(it.step)
      label = String(i - (hasWarmup ? 1 : 0) + 1).padStart(2, '0')
    }
    state = i === safeIndex ? 'current' : done >= target ? 'done' : done > 0 ? 'partial' : 'pending'
    return { i, label, name: itemName(it), done, target, state }
  })

  const phaseText = [phase?.intensity, phase?.loadNote].filter(Boolean).join(' · ')

  return (
    <SessionShell
      eyebrow={routine.name}
      doneCount={totalDone}
      totalCount={totalTarget}
      unitLabel="series"
      onFinish={onFinish}
      finishDisabled={totalDone === 0}
      notes={session.notes}
      onNotesChange={notes => onChange({ ...session, notes })}
      onDiscard={onDiscard}
      headerExtra={
        <>
          <div className="sp-phase">
            <p className="sp-phase-text">
              <strong>{weekLabel(plan.weeks, week)}</strong>
              {phaseText && <> · {phaseText}</>}
            </p>
            <button type="button" className="sp-alarm" onClick={() => setFlagsOpen(true)}>
              <AlertIcon /> <span className="sp-alarm-label">Señales de alarma</span>
            </button>
          </div>
          <div className="rail" ref={railRef}>
            {rail.map(r => (
              <button
                key={r.i}
                className={r.state === 'pending' ? undefined : r.state}
                onClick={() => setCurrentIndex(r.i)}
                aria-label={`${r.label === 'Cal' ? '' : `${Number(r.label)}. `}${r.name} — ${r.done} de ${r.target} ${r.label === 'Cal' ? 'items' : 'series'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      }
    >
      {startRest => {
        if (!item) {
          return (
            <div className="ex-panel">
              <p className="hint">Esta rutina no tiene ejercicios en esta semana. Agrégalos desde el plan.</p>
            </div>
          )
        }

        const renderSlot = (slot: PlanSlot, isLastOfStep: boolean, nested: boolean) => (
          <SlotCard
            key={slot.id}
            slot={slot}
            name={nameOf(slot)}
            sets={slotTarget(slot, phase)}
            logs={session.sets.filter(s => s.exerciseId === slot.exerciseId)}
            prev={lastPerformance(strengthSessions, slot.exerciseId, session.id)}
            seat={meta[slot.exerciseId]?.seat ?? ''}
            pain={session.pain?.[slot.exerciseId]}
            cueOpen={cueOpen[slot.id]}
            startsRest={isLastOfStep}
            nested={nested}
            onUpdate={(i, patch) => update(slot.exerciseId, i, patch)}
            onRest={startRest}
            onPain={v => setPain(slot.exerciseId, v)}
            onInfo={() => setSheetSlot(slot)}
            onToggleCue={() =>
              setCueOpen(c => ({ ...c, [slot.id]: !(c[slot.id] ?? lastPerformance(strengthSessions, slot.exerciseId, session.id) === null) }))
            }
            onSeat={v => saveMeta({ exerciseId: slot.exerciseId, seat: v, note: meta[slot.exerciseId]?.note ?? '' })}
          />
        )

        const next = items[safeIndex + 1]
        const prevItem = items[safeIndex - 1]

        return (
          <>
            {item.kind === 'warmup' ? (
              <WarmupStep
                plan={plan}
                block={plan.warmup}
                ticked={warmupTicked}
                onToggle={id => setWarmupTicked(t => ({ ...t, [id]: !t[id] }))}
                onInfo={setSheetSlot}
              />
            ) : (
              <div className="ex-panel">
                {multiBlock && item.step.firstInBlock && (
                  <div className="sp-block">
                    <div className="eyebrow">{item.step.blockTitle}</div>
                    {item.step.blockNote !== '' && <p className="hint">{item.step.blockNote}</p>}
                  </div>
                )}
                {item.step.group ? (
                  <section className="sp-group" aria-label={groupLabel(item.step.slots, slotTarget(item.step.slots[0], phase))}>
                    <div className="sp-group-head">
                      <span className="pill good">{groupLabel(item.step.slots, slotTarget(item.step.slots[0], phase))}</span>
                      <span className="hint">Una serie de cada ejercicio y luego descansa.</span>
                    </div>
                    {item.step.slots.map((slot, idx) => renderSlot(slot, idx === item.step.slots.length - 1, true))}
                  </section>
                ) : (
                  renderSlot(item.step.slots[0], true, false)
                )}
              </div>
            )}

            <div className="navrow">
              <button
                className="back"
                disabled={safeIndex === 0}
                onClick={() => setCurrentIndex(safeIndex - 1)}
                aria-label={prevItem ? `Anterior: ${itemName(prevItem)}` : 'Anterior'}
              >
                ←
              </button>
              {next ? (
                <button className="fwd" onClick={() => setCurrentIndex(safeIndex + 1)}>
                  Siguiente · {itemName(next)}
                </button>
              ) : (
                <button className="fwd primary" onClick={onFinish} disabled={totalDone === 0}>
                  Terminar sesión
                </button>
              )}
            </div>

            {sheetSlot && <ExerciseSheet exerciseId={sheetSlot.exerciseId} slot={sheetSlot} onClose={() => setSheetSlot(null)} />}
            {flagsOpen && <RedFlagsSheet onClose={() => setFlagsOpen(false)} />}
          </>
        )
      }}
    </SessionShell>
  )
}
