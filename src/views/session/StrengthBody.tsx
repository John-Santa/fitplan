import { useMemo, useState } from 'react'
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
import { ArrowRightIcon, CheckCircle } from './PlanIcons'
import { completionPatch, refFor } from './SlotCard'

interface Props {
  session: StrengthSession
  onChange: (s: StrengthSession) => void
  onFinish: () => void
  onDiscard: () => void
}

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
  const [warmupTicked, setWarmupTicked] = useState<Record<string, boolean>>({})
  /** Series saltadas ("slotId:indice"). Solo pantalla: no se guardan. */
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())
  const [sheetSlot, setSheetSlot] = useState<PlanSlot | null>(null)
  const [flagsOpen, setFlagsOpen] = useState(false)

  const nameOf = (slot: PlanSlot) => slotExerciseName(plan, slot)
  const doneOf = (slot: PlanSlot) =>
    Math.min(session.sets.filter(s => s.exerciseId === slot.exerciseId && s.done).length, slotTarget(slot, phase))
  const stepDone = (step: SessionStep) => step.slots.reduce((a, s) => a + doneOf(s), 0)
  const stepTarget = (step: SessionStep) => step.slots.reduce((a, s) => a + slotTarget(s, phase), 0)
  const itemName = (it: Item) => (it.kind === 'warmup' ? 'Calentamiento' : it.step.slots.map(nameOf).join(' + '))
  const logsOf = (slot: PlanSlot) => session.sets.filter(s => s.exerciseId === slot.exerciseId)
  const isSkipped = (slot: PlanSlot, i: number) => skipped.has(`${slot.id}:${i}`)
  /** Primera serie sin hacer ni saltar (null = el slot ya termino). */
  const currentOf = (slot: PlanSlot): number | null => {
    const logs = logsOf(slot)
    const n = slotTarget(slot, phase)
    for (let i = 0; i < n; i++) {
      if (!logs.some(l => l.setIndex === i && l.done) && !isSkipped(slot, i)) return i
    }
    return null
  }

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
  const isLastItem = safeIndex === items.length - 1
  const next = items[safeIndex + 1]

  const segs = items.map((it, i) => {
    const done = it.kind === 'warmup' ? plan.warmup.slots.filter(s => warmupTicked[s.id]).length : stepDone(it.step)
    const target = it.kind === 'warmup' ? plan.warmup.slots.length : stepTarget(it.step)
    const state = i === safeIndex ? 'current' : done >= target ? 'done' : done > 0 ? 'partial' : 'pending'
    return { i, name: itemName(it), done, target, state, warm: it.kind === 'warmup' }
  })
  const workPos = safeIndex - (hasWarmup ? 1 : 0) + 1
  const workCount = steps.length
  const pct = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0
  const phaseText = [weekLabel(plan.weeks, week), phase?.intensity, phase?.loadNote].filter(Boolean).join(' · ')

  const progress = (
    <div className="ses-prog">
      <div className="ses-prog-meta">
        <span>{item?.kind === 'warmup' ? 'Calentamiento' : `Ejercicio ${workPos} de ${workCount}`}</span>
        <span className="good">{pct}% completado</span>
      </div>
      <div className="ses-segs">
        {segs.map(sg => (
          <button
            key={sg.i}
            type="button"
            className={`ses-seg ${sg.state}`}
            onClick={() => setCurrentIndex(sg.i)}
            aria-current={sg.state === 'current' ? 'step' : undefined}
            aria-label={`${sg.warm ? '' : `${sg.i - (hasWarmup ? 1 : 0) + 1}. `}${sg.name} — ${sg.done} de ${sg.target} ${sg.warm ? 'items' : 'series'}`}
          >
            <i />
          </button>
        ))}
      </div>
    </div>
  )

  /* ---- que hace el boton principal ---- */
  const step = item?.kind === 'work' ? item.step : null
  const group = step?.group ?? false
  // Slot en foco: el de la serie mas atrasada (en superserie, rota A, B, A, B).
  let focus: { slot: PlanSlot; index: number; isLast: boolean } | null = null
  if (step) {
    let best: number | null = null
    step.slots.forEach((slot, idx) => {
      const c = currentOf(slot)
      if (c !== null && (best === null || c < (currentOf(step.slots[best]) as number))) best = idx
    })
    if (best !== null) {
      const b: number = best
      focus = { slot: step.slots[b], index: currentOf(step.slots[b]) as number, isLast: b === step.slots.length - 1 }
    }
  }

  const goNext = () => next && setCurrentIndex(safeIndex + 1)

  return (
    <SessionShell
      eyebrow={routine.name}
      startedAt={session.startedAt}
      doneCount={totalDone}
      totalCount={totalTarget}
      onFinish={onFinish}
      finishDisabled={totalDone === 0}
      notes={session.notes}
      onNotesChange={notes => onChange({ ...session, notes })}
      onDiscard={onDiscard}
      onAlarm={() => setFlagsOpen(true)}
      progress={progress}
      showEnd={isLastItem}
      footer={startRest => {
        const complete = () => {
          if (!focus) return
          const { slot, index, isLast } = focus
          const s = logsOf(slot).find(l => l.setIndex === index)
          update(slot.exerciseId, index, completionPatch(slot, s, refFor(lastPerformance(strengthSessions, slot.exerciseId, session.id), index)))
          if (isLast && slot.restSec > 0) startRest(slot.restSec)
        }
        const skip = () => {
          if (!focus) return
          setSkipped(prev => new Set(prev).add(`${focus.slot.id}:${focus.index}`))
        }

        let primary: { label: string; icon: 'check' | 'arrow'; onClick: () => void; disabled?: boolean }
        if (!item) primary = { label: 'Terminar entrenamiento', icon: 'check', onClick: onFinish, disabled: totalDone === 0 }
        else if (item.kind === 'warmup') primary = { label: 'Empezar entrenamiento', icon: 'arrow', onClick: goNext, disabled: !next }
        else if (focus) primary = { label: 'Completar serie', icon: 'check', onClick: complete }
        else if (next) primary = { label: 'Siguiente ejercicio', icon: 'arrow', onClick: goNext }
        else primary = { label: 'Terminar entrenamiento', icon: 'check', onClick: onFinish, disabled: totalDone === 0 }

        return (
          <>
            <div className="ses-sub">
              {item?.kind === 'work' ? (
                <button type="button" className="ses-textbtn" onClick={skip} disabled={!focus}>Saltar</button>
              ) : (
                <span />
              )}
              {item && next ? (
                <button type="button" className="ses-textbtn" onClick={goNext}>
                  Siguiente ejercicio <ArrowRightIcon />
                </button>
              ) : item && isLastItem ? (
                <button type="button" className="ses-textbtn" onClick={onFinish} disabled={totalDone === 0}>
                  Terminar ahora
                </button>
              ) : null}
            </div>
            <button type="button" className="ses-primary" onClick={primary.onClick} disabled={primary.disabled}>
              {primary.icon === 'check' ? <CheckCircle /> : null}
              {primary.label}
              {primary.icon === 'arrow' ? <ArrowRightIcon /> : null}
            </button>
          </>
        )
      }}
    >
      {() => {
        if (!item) {
          return <p className="ses-hint">Esta rutina no tiene ejercicios en esta semana. Agrégalos desde el plan.</p>
        }

        const renderSlot = (slot: PlanSlot, label?: string) => (
          <SlotCard
            key={slot.id}
            slot={slot}
            name={nameOf(slot)}
            sets={slotTarget(slot, phase)}
            logs={logsOf(slot)}
            prev={lastPerformance(strengthSessions, slot.exerciseId, session.id)}
            seat={meta[slot.exerciseId]?.seat ?? ''}
            pain={session.pain?.[slot.exerciseId]}
            current={currentOf(slot)}
            skipped={new Set(Array.from({ length: slotTarget(slot, phase) }, (_, i) => i).filter(i => isSkipped(slot, i)))}
            groupLabel={label}
            onUpdate={(i, patch) => update(slot.exerciseId, i, patch)}
            onPain={v => setPain(slot.exerciseId, v)}
            onInfo={() => setSheetSlot(slot)}
            onSeat={v => saveMeta({ exerciseId: slot.exerciseId, seat: v, note: meta[slot.exerciseId]?.note ?? '' })}
          />
        )

        let body
        if (item.kind === 'warmup') {
          body = (
            <WarmupStep
              plan={plan}
              block={plan.warmup}
              ticked={warmupTicked}
              onToggle={id => setWarmupTicked(t => ({ ...t, [id]: !t[id] }))}
              onInfo={setSheetSlot}
            />
          )
        } else {
          const st = item.step
          const gLabel = group ? groupLabel(st.slots, slotTarget(st.slots[0], phase)) : undefined
          body = (
            <>
              {multiBlock && st.firstInBlock && (
                <div className="ses-block">
                  <div className="ses-eyebrow">{st.blockTitle}</div>
                  {st.blockNote !== '' && <p className="ses-hint">{st.blockNote}</p>}
                </div>
              )}
              {group ? (
                <section aria-label={gLabel}>
                  {focus ? (
                    <>
                      {renderSlot(focus.slot, gLabel)}
                      <p className="ses-hint">Una serie de cada ejercicio y luego descansa.</p>
                      <ul className="ses-peers">
                        {st.slots.map(sl => (
                          <li key={sl.id} className={sl.id === focus.slot.id ? 'on' : undefined}>
                            <span>{nameOf(sl)}</span>
                            <span className="ses-peer-n">{doneOf(sl)} / {slotTarget(sl, phase)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    st.slots.map(sl => renderSlot(sl, gLabel))
                  )}
                </section>
              ) : (
                renderSlot(st.slots[0])
              )}
            </>
          )
        }

        return (
          <>
            {phaseText !== '' && <p className="ses-phase">{phaseText}</p>}
            {body}
            {sheetSlot && <ExerciseSheet exerciseId={sheetSlot.exerciseId} slot={sheetSlot} onClose={() => setSheetSlot(null)} />}
            {flagsOpen && <RedFlagsSheet onClose={() => setFlagsOpen(false)} />}
          </>
        )
      }}
    </SessionShell>
  )
}
