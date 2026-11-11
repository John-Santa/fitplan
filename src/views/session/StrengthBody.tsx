import { useMemo, useState } from 'react'
import type { PlanRoutine, PlanSlot, SetLog, StrengthSession } from '../../types'
import { fmtDate, lastPerformance, todayISO } from '../../lib/calc'
import { blockWeekNumber, phaseForWeek, setsForSlot } from '../../lib/phases'
import { addCustomExercise, swapExercise } from '../../lib/planEdits'
import ExercisePicker, { type NewExerciseInput } from '../plan/ExercisePicker'
import '../plan/plan-editor.css'
import { buildSessionSteps, findRoutine, groupLabel, slotExerciseName, weekLabel, type SessionStep, routineDisplayName } from '../../lib/planQueries'
import { useStore } from '../../lib/store'
import BottomSheet from '../../components/BottomSheet'
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
  const { sessions, meta, saveMeta, plan, config, savePlan } = useStore()
  // lastPerformance solo mira fuerza (calc.ts la tipa a StrengthSession[]):
  // una sesion de natacion no tiene .sets.
  const strengthSessions = sessions.filter((s): s is StrengthSession => s.kind === 'strength')
  const week = blockWeekNumber(new Date(session.startedAt), config.blockStart)
  const phase = phaseForWeek(plan, week)
  const minimal = session.minimal === true
  const swaps = session.swaps
  const steps = useMemo(() => {
    // Session-only swaps replace the exercise (and drop the plan's custom label).
    const all = buildSessionSteps(routine, week).map(st => ({
      ...st,
      slots: st.slots.map(sl => {
        const to = swaps?.[sl.id]
        if (!to) return sl
        const { label: _label, ...rest } = sl
        return { ...rest, exerciseId: to }
      }),
    }))
    if (!minimal) return all
    // Version minima: solo el primer ejercicio de trabajo (primer slot que no es nota).
    for (const st of all) {
      const slot = st.slots.find(s => s.target.kind !== 'note')
      if (slot) return [{ ...st, group: null, slots: [slot] }]
    }
    return all
  }, [routine, week, minimal, swaps])
  const hasWarmup = routine.warmup && plan.warmup.slots.length > 0
  const items: Item[] = useMemo(
    () => [...(hasWarmup ? [{ kind: 'warmup' } as const] : []), ...steps.map(step => ({ kind: 'work', step }) as const)],
    [hasWarmup, steps],
  )

  // A restored session (reload) resumes at the first unfinished exercise.
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (!session.sets.some(s => s.done)) return 0
    const at = items.findIndex(it => it.kind === 'work' && it.step.slots.some(sl =>
      sl.target.kind !== 'note' && session.sets.filter(s => s.exerciseId === sl.exerciseId && s.done).length < setsForSlot(sl, phase)))
    return at >= 0 ? at : 0
  })
  const [warmupTicked, setWarmupTicked] = useState<Record<string, boolean>>({})
  /** Series saltadas ("slotId:indice"). Solo pantalla: no se guardan. */
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())
  const [sheetSlot, setSheetSlot] = useState<PlanSlot | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [swapTarget, setSwapTarget] = useState<{ slot: PlanSlot; blockId: string } | null>(null)
  const [flagsOpen, setFlagsOpen] = useState(false)

  const nameOf = (slot: PlanSlot) => slotExerciseName(plan, slot)
  // Plan sets for the week plus any set the user added in this session.
  const targetOf = (slot: PlanSlot) => slotTarget(slot, phase) + (slot.target.kind === 'note' ? 0 : session.extraSets?.[slot.id] ?? 0)
  const doneOf = (slot: PlanSlot) =>
    Math.min(session.sets.filter(s => s.exerciseId === slot.exerciseId && s.done).length, targetOf(slot))
  const stepDone = (step: SessionStep) => step.slots.reduce((a, s) => a + doneOf(s), 0)
  const stepTarget = (step: SessionStep) => step.slots.reduce((a, s) => a + targetOf(s), 0)
  const itemName = (it: Item) => (it.kind === 'warmup' ? 'Calentamiento' : it.step.slots.map(nameOf).join(' + '))
  const logsOf = (slot: PlanSlot) => session.sets.filter(s => s.exerciseId === slot.exerciseId)
  const isSkipped = (slot: PlanSlot, i: number) => skipped.has(`${slot.id}:${i}`)
  /** Primera serie sin hacer ni saltar (null = el slot ya termino). */
  const currentOf = (slot: PlanSlot): number | null => {
    const logs = logsOf(slot)
    const n = targetOf(slot)
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

  const addSet = (slot: PlanSlot) => {
    const extra = session.extraSets ?? {}
    onChange({ ...session, extraSets: { ...extra, [slot.id]: (extra[slot.id] ?? 0) + 1 } })
  }
  /** Marks every remaining set of the exercise as done in one tap, using the
   *  values on screen or the last session's as the default. */
  const completeAll = (slot: PlanSlot) => {
    const prev = lastPerformance(strengthSessions, slot.exerciseId, session.id)
    const next = session.sets.slice()
    for (let i = 0; i < targetOf(slot); i++) {
      const idx = next.findIndex(s => s.exerciseId === slot.exerciseId && s.setIndex === i)
      if (idx >= 0 && next[idx].done) continue
      const patch = completionPatch(slot, idx >= 0 ? next[idx] : undefined, refFor(prev, i))
      if (idx >= 0) next[idx] = { ...next[idx], ...patch }
      else next.push({ exerciseId: slot.exerciseId, setIndex: i, weight: null, reps: null, done: false, ...patch })
    }
    onChange({ ...session, sets: next })
  }

  const setPain = (exerciseId: string, value: number | null) => {
    const { [exerciseId]: _removed, ...rest } = session.pain ?? {}
    onChange({ ...session, pain: value === null ? rest : { ...rest, [exerciseId]: value } })
  }

  const applySwap = (slotId: string, exerciseId: string) => {
    onChange({ ...session, swaps: { ...(session.swaps ?? {}), [slotId]: exerciseId } })
  }
  const keepInPlan = async (slotId: string, blockId: string) => {
    const to = session.swaps?.[slotId]
    if (!to) return
    const next = swapExercise(plan, routine.id, blockId, slotId, to)
    if (next === plan) return
    await savePlan(next)
    const { [slotId]: _done, ...rest } = session.swaps ?? {}
    onChange({ ...session, swaps: Object.keys(rest).length > 0 ? rest : undefined })
  }
  const createAndSwap = async (input: NewExerciseInput) => {
    if (!swapTarget) return
    const withCustom = addCustomExercise(plan, input)
    const created = withCustom.customExercises.at(-1)
    if (!created) return
    await savePlan(withCustom)
    applySwap(swapTarget.slot.id, created.id)
    setSwapTarget(null)
  }

  const totalDone = steps.reduce((a, st) => a + stepDone(st), 0)
  const totalTarget = steps.reduce((a, st) => a + stepTarget(st), 0)

  const safeIndex = Math.min(currentIndex, Math.max(items.length - 1, 0))
  const item = items[safeIndex]
  const multiBlock = routine.blocks.length > 1
  const isLastItem = safeIndex === items.length - 1

  const segs = items.map((it, i) => {
    const done = it.kind === 'warmup' ? plan.warmup.slots.filter(s => warmupTicked[s.id]).length : stepDone(it.step)
    const target = it.kind === 'warmup' ? plan.warmup.slots.length : stepTarget(it.step)
    const state = i === safeIndex ? 'current' : done >= target ? 'done' : done > 0 ? 'partial' : 'pending'
    return { i, name: itemName(it), done, target, state, warm: it.kind === 'warmup' }
  })
  // Next exercise = the first unfinished one after the current (wrapping), so
  // the user can train in whatever order the gym allows; linear otherwise.
  const pendingAfter = [...segs.slice(safeIndex + 1), ...segs.slice(0, safeIndex)].find(sg => sg.state !== 'done' && !sg.warm)
  const nextIndex = pendingAfter ? pendingAfter.i : safeIndex + 1 < items.length ? safeIndex + 1 : null
  const next = nextIndex != null ? items[nextIndex] : undefined
  const workPos = safeIndex - (hasWarmup ? 1 : 0) + 1
  const workCount = steps.length
  const pct = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0
  const phaseText = [weekLabel(plan.weeks, week), phase?.intensity, phase?.loadNote].filter(Boolean).join(' · ')

  const progress = (
    <div className="ses-prog">
      <div className="ses-prog-meta">
        <button type="button" className="ses-pick" onClick={() => setPickerOpen(true)} aria-haspopup="dialog">
          {item?.kind === 'warmup' ? 'Calentamiento' : `Ejercicio ${workPos} de ${workCount}`}
          <span className="ses-pick-cta">Elegir</span>
        </button>
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

  // Finishing before every exercise is done is allowed: the sets logged count.
  const finishEarly = () => {
    if (totalDone >= totalTarget || confirm(`¿Terminar con ${totalDone} de ${totalTarget} series? Se guarda lo que hiciste.`)) onFinish()
  }
  const goNext = () => { if (nextIndex != null) setCurrentIndex(nextIndex) }

  return (
    <SessionShell
      eyebrow={[routineDisplayName(routine.name), minimal ? 'Versión mínima' : '', session.date !== todayISO() ? fmtDate(session.date) : ''].filter(Boolean).join(' · ')}
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
              {item && !isLastItem && (
                <button type="button" className="ses-textbtn" onClick={finishEarly} disabled={totalDone === 0}>
                  Terminar
                </button>
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
            sets={targetOf(slot)}
            logs={logsOf(slot)}
            prev={lastPerformance(strengthSessions, slot.exerciseId, session.id)}
            seat={meta[slot.exerciseId]?.seat ?? ''}
            pain={session.pain?.[slot.exerciseId]}
            current={currentOf(slot)}
            skipped={new Set(Array.from({ length: targetOf(slot) }, (_, i) => i).filter(i => isSkipped(slot, i)))}
            groupLabel={label}
            onUpdate={(i, patch) => update(slot.exerciseId, i, patch)}
            onPain={v => setPain(slot.exerciseId, v)}
            onInfo={() => setSheetSlot(slot)}
            onSeat={v => saveMeta({ exerciseId: slot.exerciseId, seat: v, note: meta[slot.exerciseId]?.note ?? '' })}
            onAddSet={() => addSet(slot)}
            onCompleteAll={() => completeAll(slot)}
            onSwap={step ? () => setSwapTarget({ slot, blockId: step.blockId }) : undefined}
            swapped={session.swaps?.[slot.id] != null}
            onKeepInPlan={step ? () => { void keepInPlan(slot.id, step.blockId) } : undefined}
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
          const gLabel = group ? groupLabel(st.slots, targetOf(st.slots[0])) : undefined
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
                            <span className="ses-peer-n">{doneOf(sl)} / {targetOf(sl)}</span>
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
            {swapTarget && (
              <ExercisePicker
                plan={plan}
                mode="swap"
                currentExerciseId={swapTarget.slot.exerciseId}
                taken={new Set(steps.flatMap(st => st.slots.map(sl => sl.exerciseId)))}
                onPick={id => { applySwap(swapTarget.slot.id, id); setSwapTarget(null) }}
                onCreate={input => { void createAndSwap(input) }}
                onClose={() => setSwapTarget(null)}
              />
            )}
            {pickerOpen && (
              <BottomSheet title="Elegir ejercicio" onClose={() => setPickerOpen(false)}>
                <p className="ses-pick-hint">Haz el que esté libre en el gimnasio; el orden no importa.</p>
                <ul className="ses-pick-list">
                  {segs.map(sg => (
                    <li key={sg.i}>
                      <button
                        type="button"
                        className={`ses-pick-item ${sg.state}`}
                        aria-current={sg.state === 'current' ? 'step' : undefined}
                        onClick={() => { setCurrentIndex(sg.i); setPickerOpen(false) }}
                      >
                        <span className="ses-pick-name">{sg.name}</span>
                        <span className="ses-pick-meta">
                          {sg.state === 'done' ? 'Hecho' : sg.state === 'current' ? 'En curso' : `${sg.done} de ${sg.target} ${sg.warm ? 'items' : 'series'}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </BottomSheet>
            )}
          </>
        )
      }}
    </SessionShell>
  )
}
