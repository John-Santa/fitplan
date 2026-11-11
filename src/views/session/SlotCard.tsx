import type { PlanSlot, SetLog } from '../../types'
import type { lastPerformance } from '../../lib/calc'
import { progressLine, shouldProgress } from '../../lib/calc'
import { formatTarget } from '../../lib/phases'
import { Check } from '../../components/ui'
import HoldTimer from './HoldTimer'
import PainControl from './PainControl'
import { ClockIcon, InfoIcon, MinusIcon, PlusIcon, TimerIcon, TipIcon, TrendIcon } from './PlanIcons'

type Prev = ReturnType<typeof lastPerformance>

export interface SlotCardProps {
  slot: PlanSlot
  name: string
  /** Series de este slot en la semana (setsForSlot, o 1 si es solo nota). */
  sets: number
  /** Series ya registradas de este ejercicio en la sesion. */
  logs: SetLog[]
  prev: Prev
  seat: string
  pain: number | undefined
  /** Indice de la serie actual (null = todas hechas o saltadas). */
  current: number | null
  /** Series saltadas (solo pantalla). */
  skipped: ReadonlySet<number>
  /** Etiqueta de superserie/circuito, si el slot va en un grupo. */
  groupLabel?: string
  onUpdate: (setIndex: number, patch: Partial<SetLog>) => void
  onPain: (v: number | null) => void
  onInfo: () => void
  onSeat: (v: string) => void
  /** Opens the exercise picker to swap this exercise (library or MuscleWiki). */
  onSwap?: () => void
  /** The exercise was swapped for this session only. */
  swapped?: boolean
  /** Saves the session-only swap into the plan. */
  onKeepInPlan?: () => void
  /** Adds one more set to this exercise for this session. */
  onAddSet?: () => void
  /** Marks every remaining set as done. */
  onCompleteAll?: () => void
}

const num = (v: string): number | null => (v === '' ? null : Number(v))
const fmtN = (n: number | null | undefined): string => (n == null ? '—' : Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100))

/** Referencia de la sesion anterior para la serie i (o su ultima serie). */
export const refFor = (prev: Prev, i: number): SetLog | undefined => prev?.sets[i] ?? prev?.sets[prev.sets.length - 1]

/** Lo que registra "Completar serie" para la serie i de un slot: igual que el
 *  check de siempre (valores tecleados, o la referencia / el objetivo). */
export function completionPatch(slot: PlanSlot, s: SetLog | undefined, ref: SetLog | undefined): Partial<SetLog> {
  const t = slot.target
  switch (t.kind) {
    case 'reps':
      return { done: true, weight: s?.weight ?? ref?.weight ?? null, reps: s?.reps ?? t.high }
    case 'time':
      return { done: true, durationSec: s?.durationSec ?? t.lowSec }
    case 'distance':
      return { done: true, distanceM: t.meters }
    case 'note':
      return { done: true }
  }
}

function Stepper(p: {
  label: string
  unit: string
  value: number | null
  step: number
  min: number
  decimal?: boolean
  onChange: (v: number | null) => void
}) {
  const base = p.value ?? 0
  const bump = (d: number) => p.onChange(Math.max(p.min, Math.round((base + d) * 100) / 100))
  return (
    <div className="ses-stepper">
      <span className="ses-stepper-label">{p.label}</span>
      <div className="ses-stepper-row">
        <button type="button" className="ses-round" aria-label={`Disminuir ${p.label.toLowerCase()}`} onClick={() => bump(-p.step)}>
          <MinusIcon />
        </button>
        <label className="ses-stepper-val">
          <input
            type="number" inputMode={p.decimal ? 'decimal' : 'numeric'} step={p.decimal ? '0.5' : '1'}
            value={p.value ?? ''}
            placeholder="0"
            aria-label={p.label}
            onChange={e => p.onChange(num(e.target.value))}
          />
          <span className="ses-unit">{p.unit}</span>
        </label>
        <button type="button" className="ses-round" aria-label={`Aumentar ${p.label.toLowerCase()}`} onClick={() => bump(p.step)}>
          <PlusIcon />
        </button>
      </div>
    </div>
  )
}

/** El ejercicio en foco de la sesion: cabecera, serie actual con steppers,
 *  lista de series, dolor al terminar y ajuste del equipo. La accion de
 *  "Completar serie" vive en la zona del pulgar de StrengthBody. */
export default function SlotCard(p: SlotCardProps) {
  const { slot, name, sets: n, logs, prev, current } = p
  const target = slot.target
  const mine = logs.slice().sort((a, b) => a.setIndex - b.setIndex)
  const logAt = (i: number) => mine.find(x => x.setIndex === i)
  const label = formatTarget(target)
  const progress = target.kind === 'reps' && prev != null && shouldProgress(prev.sets, n, target.high)
  const cur = current !== null ? logAt(current) : undefined
  const curRef = current !== null ? refFor(prev, current) : undefined
  const stateOf = (i: number): 'done' | 'current' | 'skipped' | 'pending' =>
    logAt(i)?.done ? 'done' : i === current ? 'current' : p.skipped.has(i) ? 'skipped' : 'pending'

  const doneText = (s: SetLog | undefined): string => {
    if (!s) return '—'
    if (target.kind === 'reps') return `${fmtN(s.weight)} kg × ${fmtN(s.reps)}`
    if (target.kind === 'time') return `${fmtN(s.durationSec)} s`
    if (target.kind === 'distance') return label
    return 'Hecho'
  }
  const plannedText = (i: number): string => {
    if (target.kind === 'reps') {
      const ref = refFor(prev, i)
      return `${fmtN(ref?.weight)} kg × ${target.high}`
    }
    if (target.kind === 'time') return `${target.lowSec} s`
    if (target.kind === 'distance') return label
    return '—'
  }

  const undo = (i: number) => p.onUpdate(i, { done: false })

  const card = () => {
    if (current === null) return null
    const i = current
    const isLast = i + 1 === n
    return (
      <section className="ses-now" aria-label={`Serie ${i + 1} de ${n}`}>
        <div className="ses-now-head">
          <div>
            <div className="ses-now-title">
              <span>{target.kind === 'note' ? 'Pendiente' : `Serie ${i + 1} de ${n}`}</span>
              {progress && (
                <span className="ses-pill good"><TrendIcon /> Sube peso la próxima</span>
              )}
              {isLast && n > 1 && <span className="ses-pill">La última</span>}
            </div>
            {target.kind === 'reps' && (
              <p className="ses-prevline">
                {curRef ? `Anterior: ${fmtN(curRef.weight)} kg × ${fmtN(curRef.reps)}` : 'Primera vez: empieza liviano, la primera serie es de reconocimiento.'}
              </p>
            )}
            {progress && prev && target.kind === 'reps' && (
              <p className="ses-prevline">{progressLine(prev.sets.length, Math.min(...prev.sets.map(s => s.reps ?? target.high)))}</p>
            )}
          </div>
          <span className="ses-state">En curso</span>
        </div>

        {target.kind === 'reps' && (
          <div className="ses-steppers">
            <Stepper
              label="Peso" unit="kg" step={2.5} min={0} decimal
              value={cur?.weight ?? curRef?.weight ?? null}
              onChange={v => p.onUpdate(i, { weight: v })}
            />
            <Stepper
              label="Reps" unit="reps" step={1} min={0}
              value={cur?.reps ?? target.high}
              onChange={v => p.onUpdate(i, { reps: v })}
            />
          </div>
        )}

        {target.kind === 'time' && (
          <div className="ses-steppers one">
            <Stepper
              label="Segundos" unit="s" step={5} min={0}
              value={cur?.durationSec ?? target.lowSec}
              onChange={v => p.onUpdate(i, { durationSec: v })}
            />
            <HoldTimer label={`Serie ${i + 1}`} onStop={sec => p.onUpdate(i, { durationSec: sec })} />
          </div>
        )}

        {target.kind === 'distance' && (
          <div className="ses-bigrow">
            <span className="ses-bigval">{label}</span>
            <button
              type="button" role="checkbox" aria-checked={!!cur?.done}
              className={cur?.done ? 'ses-tick on' : 'ses-tick'}
              onClick={() => p.onUpdate(i, cur?.done ? { done: false } : completionPatch(slot, cur, curRef))}
            >
              <span className="ses-tick-box"><Check on={!!cur?.done} /></span>
              <span className="ses-tick-text">Hecha</span>
            </button>
          </div>
        )}

        {target.kind === 'note' && (
          <div className="ses-bigrow">
            <button
              type="button" role="checkbox" aria-checked={!!cur?.done}
              className={cur?.done ? 'ses-tick on' : 'ses-tick'}
              onClick={() => p.onUpdate(0, { done: !cur?.done })}
            >
              <span className="ses-tick-box"><Check on={!!cur?.done} /></span>
              <span className="ses-tick-text">Hecho</span>
            </button>
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="ses-slot">
      <div className="ses-exhead">
        <div className="ses-exhead-main">
          {p.groupLabel && <span className="ses-pill good">{p.groupLabel}</span>}
          <h1 className="ses-title">
            {name} {slot.primary && <span className="ses-pill">principal</span>}
          </h1>
          <div className="ses-chips">
            {target.kind !== 'note' && <span className="ses-chip strong">{n} × {label}</span>}
            {slot.restSec > 0 && (
              <span className="ses-chip"><TimerIcon /> Descanso {slot.restSec} s</span>
            )}
            <button type="button" className="ses-chip btn" aria-label={`Ver ficha de ${name}`} onClick={p.onInfo}>
              <InfoIcon /> Ficha
            </button>
            {p.onSwap && (
              <button type="button" className="ses-chip btn" aria-label={`Cambiar ${name} por otro ejercicio`} onClick={p.onSwap}>
                Cambiar
              </button>
            )}
          </div>
          {p.swapped && (
            <p className="ses-swapped">
              Cambiado solo por hoy.{' '}
              {p.onKeepInPlan && <button type="button" className="ses-textbtn" onClick={p.onKeepInPlan}>Guardar en el plan</button>}
            </p>
          )}
        </div>
      </div>

      {slot.note !== '' && (
        <p className="ses-cue"><TipIcon /> <span>{slot.note}</span></p>
      )}
      {slot.primary && target.kind === 'reps' && mine.length === 0 && (
        <p className="ses-hint">Primera serie con poco peso (aproximación) antes de las series de trabajo.</p>
      )}

      {card()}

      {current === null && target.kind !== 'note' && (
        <p className="ses-doneline"><Check on /> Ejercicio terminado</p>
      )}

      {target.kind !== 'note' && (p.onAddSet || p.onCompleteAll) && (
        <div className="ses-setactions">
          {p.onAddSet && (
            <button type="button" className="ses-chip btn" onClick={p.onAddSet}>+ Agregar serie</button>
          )}
          {p.onCompleteAll && current !== null && (
            <button type="button" className="ses-chip btn" onClick={p.onCompleteAll}>
              <Check on /> Completar ejercicio
            </button>
          )}
        </div>
      )}

      {target.kind !== 'note' && (
        <section className="ses-list-wrap">
          <div className="ses-list-head">
            <span>Registro de series</span>
            <span>Objetivo: {label}</span>
          </div>
          <ul className="ses-list">
            {Array.from({ length: n }, (_, i) => {
              const state = stateOf(i)
              const s = logAt(i)
              const body = (
                <>
                  <span className={`ses-idx ${state}`}>{state === 'done' ? <Check on /> : i + 1}</span>
                  <span className="ses-row-name">
                    Serie {i + 1}
                    {state === 'current' && <em className="ses-pill">Actual</em>}
                    {state === 'skipped' && <em className="ses-pill">Saltada</em>}
                  </span>
                  <span className="ses-row-val">{state === 'done' ? doneText(s) : plannedText(i)}</span>
                  {state === 'pending' && <ClockIcon />}
                </>
              )
              return (
                <li key={i} className={`ses-row ${state}`}>
                  {state === 'done' ? (
                    <button type="button" className="ses-row-btn" aria-label={`Deshacer serie ${i + 1}`} onClick={() => undo(i)}>
                      {body}
                    </button>
                  ) : (
                    <div className="ses-row-btn">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {current === null && target.kind !== 'note' && (
        <PainControl id={`pain-${slot.id}`} value={p.pain} onChange={p.onPain} />
      )}

      <div className="ses-seat">
        <label htmlFor={`seat-${slot.exerciseId}`}>Asiento o ajuste</label>
        <input
          id={`seat-${slot.exerciseId}`}
          key={slot.exerciseId}
          type="text"
          defaultValue={p.seat}
          placeholder="p. ej. asiento 4, pin 3"
          onBlur={e => p.onSeat(e.target.value)}
        />
      </div>
    </div>
  )
}
