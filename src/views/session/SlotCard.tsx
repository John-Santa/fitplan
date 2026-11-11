import type { PlanSlot, SetLog } from '../../types'
import type { lastPerformance } from '../../lib/calc'
import { fmtDate, formatLastPerformance, progressLine, shouldProgress } from '../../lib/calc'
import { formatTarget } from '../../lib/phases'
import { Check } from '../../components/ui'
import HoldTimer from './HoldTimer'
import PainControl from './PainControl'
import { InfoIcon } from './PlanIcons'

type SetRowState = 'done' | 'current' | 'pending'

export interface SlotCardProps {
  slot: PlanSlot
  name: string
  /** Series de este slot en la semana (setsForSlot, o 1 si es solo nota). */
  sets: number
  /** Series ya registradas de este ejercicio en la sesion. */
  logs: SetLog[]
  prev: ReturnType<typeof lastPerformance>
  seat: string
  pain: number | undefined
  /** undefined = estado por defecto (abierto la primera vez con el ejercicio). */
  cueOpen: boolean | undefined
  /** Dentro de una superserie o circuito, el descanso solo corre tras el
   *  ultimo ejercicio del grupo. */
  startsRest: boolean
  /** Titulo de nivel 3 cuando va dentro de un grupo. */
  nested: boolean
  onUpdate: (setIndex: number, patch: Partial<SetLog>) => void
  onRest: (sec: number) => void
  onPain: (v: number | null) => void
  onInfo: () => void
  onToggleCue: () => void
  onSeat: (v: string) => void
}

const num = (v: string): number | null => (v === '' ? null : Number(v))

/** Un ejercicio de la sesion: cabecera, filas de series segun el tipo de
 *  objetivo, dolor y claves tecnicas. */
export default function SlotCard(p: SlotCardProps) {
  const { slot, name, sets: n, logs, prev } = p
  const target = slot.target
  const Heading = p.nested ? 'h3' : 'h2'
  const isCueOpen = p.cueOpen ?? prev === null
  const mine = logs.slice().sort((a, b) => a.setIndex - b.setIndex)
  const logAt = (i: number) => mine.find(x => x.setIndex === i)
  const currentIndex = Array.from({ length: n }, (_, i) => i).find(i => !logAt(i)?.done) ?? null
  const stateOf = (i: number): SetRowState => (logAt(i)?.done ? 'done' : i === currentIndex ? 'current' : 'pending')
  const rest = () => {
    if (p.startsRest && slot.restSec > 0) p.onRest(slot.restSec)
  }
  const label = formatTarget(target)
  const progress = target.kind === 'reps' && prev != null && shouldProgress(prev.sets, n, target.high)

  /* ----- repeticiones: peso + reps, como siempre ----- */
  const repsRows = () => {
    if (target.kind !== 'reps') return null
    const toggle = (i: number, s: SetLog | undefined, ref: SetLog | undefined) => {
      const next = !s?.done
      p.onUpdate(i, { done: next, weight: s?.weight ?? ref?.weight ?? null, reps: s?.reps ?? target.high })
      if (next) rest()
    }
    return Array.from({ length: n }, (_, i) => {
      const s = logAt(i)
      const ref = prev?.sets[i] ?? prev?.sets[prev.sets.length - 1]
      const state = stateOf(i)
      const weightInput = (
        <input
          type="number" inputMode="decimal" step="0.5"
          className={state === 'current' ? `num${s?.weight != null ? ' filled' : ''}` : 'num'}
          placeholder={ref?.weight != null ? String(ref.weight) : '—'}
          value={s?.weight ?? ''}
          onChange={e => p.onUpdate(i, { weight: num(e.target.value) })}
          aria-label={`Peso serie ${i + 1}`}
        />
      )
      const repsInput = (
        <input
          type="number" inputMode="numeric"
          className={state === 'current' ? `num${s?.reps != null ? ' filled' : ''}` : 'num'}
          placeholder={String(target.high)}
          value={s?.reps ?? ''}
          onChange={e => p.onUpdate(i, { reps: num(e.target.value) })}
          aria-label={`Repeticiones serie ${i + 1}`}
        />
      )
      if (state === 'current') {
        return (
          <div className="setnow" key={i}>
            <div className="setnow-head">
              <span className="lbl-current">Serie {i + 1} de {n}</span>
              {i + 1 === n && <span className="lbl-last">La última</span>}
            </div>
            <div className="setnow-grid">
              <div><div className="micro">kg</div>{weightInput}</div>
              <div><div className="micro">reps</div>{repsInput}</div>
              <button className="check" aria-label={s?.done ? 'Deshacer serie' : 'Marcar serie'} onClick={() => toggle(i, s, ref)}>
                <Check on={!!s?.done} />
              </button>
            </div>
          </div>
        )
      }
      return (
        <div className={`setrow ${state}`} key={i}>
          <div className="idx num">{i + 1}</div>
          {weightInput}
          {repsInput}
          <button className={`check${s?.done ? ' on' : ''}`} aria-label={s?.done ? 'Deshacer serie' : 'Marcar serie'} onClick={() => toggle(i, s, ref)}>
            <Check on={!!s?.done} />
          </button>
        </div>
      )
    })
  }

  /* ----- tiempo: segundos + cronometro de sostenido ----- */
  const timeRows = () => {
    if (target.kind !== 'time') return null
    return Array.from({ length: n }, (_, i) => {
      const s = logAt(i)
      const state = stateOf(i)
      return (
        <div className={`sp-row time ${state}`} key={i}>
          <div className="idx num">{i + 1}</div>
          <div className="sp-field">
            <input
              type="number" inputMode="numeric" className="num"
              placeholder={String(target.lowSec)}
              value={s?.durationSec ?? ''}
              onChange={e => p.onUpdate(i, { durationSec: num(e.target.value) })}
              aria-label={`Segundos serie ${i + 1}`}
            />
            <span className="sp-unit" aria-hidden="true">s</span>
          </div>
          <HoldTimer label={`Serie ${i + 1}`} onStop={sec => p.onUpdate(i, { durationSec: sec })} />
          <button
            className={`sp-check${s?.done ? ' on' : ''}`}
            aria-label={s?.done ? 'Deshacer serie' : 'Marcar serie'}
            onClick={() => {
              const next = !s?.done
              p.onUpdate(i, { done: next, durationSec: s?.durationSec ?? target.lowSec })
              if (next) rest()
            }}
          >
            <Check on={!!s?.done} />
          </button>
        </div>
      )
    })
  }

  /* ----- distancia: una marca por serie ----- */
  const distanceRows = () => {
    if (target.kind !== 'distance') return null
    return Array.from({ length: n }, (_, i) => {
      const s = logAt(i)
      const state = stateOf(i)
      return (
        <div className={`sp-row distance ${state}`} key={i}>
          <div className="idx num">{i + 1}</div>
          <div className="sp-distance num">{label}</div>
          <button
            className={`sp-check${s?.done ? ' on' : ''}`}
            aria-label={s?.done ? `Deshacer serie ${i + 1}` : `Marcar serie ${i + 1}`}
            onClick={() => {
              const next = !s?.done
              p.onUpdate(i, { done: next, distanceM: next ? target.meters : null })
              if (next) rest()
            }}
          >
            <Check on={!!s?.done} />
          </button>
        </div>
      )
    })
  }

  /* ----- nota: una sola marca ----- */
  const noteRow = () => {
    if (target.kind !== 'note') return null
    const s = logAt(0)
    return (
      <div className={`sp-row note ${s?.done ? 'done' : 'current'}`}>
        <button
          type="button"
          role="checkbox"
          aria-checked={!!s?.done}
          className={s?.done ? 'sp-tick on' : 'sp-tick'}
          onClick={() => p.onUpdate(0, { done: !s?.done })}
        >
          <span className="sp-tick-box"><Check on={!!s?.done} /></span>
          <span className="sp-tick-text">Hecho</span>
        </button>
      </div>
    )
  }

  return (
    <div className="sp-slot">
      <div className="sp-head">
        <Heading>
          {name} {slot.primary && <span className="pill">principal</span>}
        </Heading>
        <button type="button" className="sp-info" aria-label={`Ver ficha de ${name}`} onClick={p.onInfo}>
          <InfoIcon />
        </button>
      </div>
      <div className="metabar">
        {target.kind !== 'note' && <span>{n} × {label}</span>}
        {slot.restSec > 0 && <span>Descanso {slot.restSec}s</span>}
        {p.seat && <span>Asiento {p.seat}</span>}
      </div>

      {slot.primary && target.kind === 'reps' && mine.length === 0 && (
        <p className="hint">Primera serie con poco peso (aproximación) antes de las series de trabajo.</p>
      )}

      {progress && prev && target.kind === 'reps' && (
        <div className="tag-skew-wrap">
          <div className="tag-skew"><span>Sube peso</span></div>
          <p>{progressLine(prev.sets.length, Math.min(...prev.sets.map(s => s.reps ?? target.high)))}</p>
        </div>
      )}

      {target.kind === 'reps' &&
        (prev ? (
          <div className="last-perf">
            <div className="label">La vez pasada · {fmtDate(prev.session.date)}</div>
            <div className="value num">{formatLastPerformance(prev.sets)}</div>
          </div>
        ) : (
          <p className="hint">Primera vez con este ejercicio. Empieza liviano: la primera serie es de reconocimiento.</p>
        ))}

      {repsRows()}
      {timeRows()}
      {distanceRows()}
      {noteRow()}

      {target.kind !== 'note' && <PainControl id={`pain-${slot.id}`} value={p.pain} onChange={p.onPain} />}

      <button className="disclosure-toggle" aria-expanded={isCueOpen} onClick={p.onToggleCue}>
        <span className="lbl">Claves técnicas</span>
        <span className="glyph">{isCueOpen ? '−' : '+'}</span>
      </button>
      {isCueOpen && (
        <div className="disclosure-body">
          {slot.note !== '' && <p className="hint" style={{ marginBottom: 12 }}>{slot.note}</p>}
          <label htmlFor={`seat-${slot.exerciseId}`}>Número de asiento o ajuste</label>
          <input
            id={`seat-${slot.exerciseId}`}
            key={slot.exerciseId}
            type="text"
            defaultValue={p.seat}
            placeholder="p. ej. asiento 4, pin 3"
            onBlur={e => p.onSeat(e.target.value)}
          />
          <p className="hint">Se guarda solo y aparece aquí la próxima sesión.</p>
        </div>
      )}
    </div>
  )
}
