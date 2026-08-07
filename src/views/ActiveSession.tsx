import { useEffect, useRef, useState } from 'react'
import type { Exercise, SetLog, StrengthSession } from '../types'
import { MW, routineById } from '../lib/plan'
import { fmtDate, formatLastPerformance, lastPerformance, progressLine, shouldProgress } from '../lib/calc'
import { useStore } from '../lib/store'
import { Check, RestTimer, useToast } from '../components/ui'

interface Props {
  session: StrengthSession
  setsDelta: number
  onChange: (s: StrengthSession) => void
  onFinish: () => void
  onDiscard: () => void
}

type RailState = 'current' | 'done' | 'partial' | 'pending'
type SetRowState = 'done' | 'current' | 'pending'

export default function ActiveSession({ session, setsDelta, onChange, onFinish, onDiscard }: Props) {
  const { sessions, meta, saveMeta } = useStore()
  // lastPerformance solo mira fuerza (calc.ts la tipa a StrengthSession[]):
  // una sesion de natacion no tiene .sets, y esta pantalla es
  // exclusivamente de fuerza hasta que F1-5 la divida.
  const strengthSessions = sessions.filter((s): s is StrengthSession => s.kind === 'strength')
  const routine = routineById(session.routineId)!
  const toast = useToast()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [rest, setRest] = useState<{ sec: number; key: number } | null>(null)
  const [cueOpen, setCueOpen] = useState<Record<string, boolean>>({})
  const railRef = useRef<HTMLDivElement>(null)

  // The rail can scroll horizontally when 44px cells don't all fit (7
  // exercises at 320px). On exercise change, bring the current cell into
  // view with the minimum movement: 'nearest' on both axes is a no-op if
  // it's already visible and never scrolls the page. Depends only on
  // currentIndex, so it never fires while typing weight or reps.
  useEffect(() => {
    const cell = railRef.current?.children.item(currentIndex)
    if (cell instanceof HTMLElement) cell.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [currentIndex])

  const targetSets = (e: Exercise) => Math.max(1, e.sets + setsDelta)

  const setsFor = (id: string) => session.sets.filter(s => s.exerciseId === id).sort((a, b) => a.setIndex - b.setIndex)

  const update = (exerciseId: string, setIndex: number, patch: Partial<SetLog>) => {
    const idx = session.sets.findIndex(s => s.exerciseId === exerciseId && s.setIndex === setIndex)
    const next = session.sets.slice()
    if (idx >= 0) next[idx] = { ...next[idx], ...patch }
    else next.push({ exerciseId, setIndex, weight: null, reps: null, done: false, ...patch })
    onChange({ ...session, sets: next })
  }

  const totalDone = session.sets.filter(s => s.done).length
  const totalTarget = routine.exercises.reduce((a, e) => a + targetSets(e), 0)

  const ex = routine.exercises[currentIndex]
  const n = targetSets(ex)
  const mine = setsFor(ex.id)
  const prev = lastPerformance(strengthSessions, ex.id, session.id)
  const progress = prev != null && shouldProgress(prev.sets, n, ex.repsHigh)
  const seat = meta[ex.id]?.seat ?? ''
  const isCueOpen = cueOpen[ex.id] ?? prev === null

  // Selector presentacional puro: nunca filtra ni bloquea filas, solo decide
  // cual fila recibe el bloque destacado (AC-SETS-01 — todas las filas se
  // materializan siempre, en orden, sin importar este valor).
  const currentSetIndex = Array.from({ length: n }, (_, i) => i).find(i => !mine.find(x => x.setIndex === i)?.done) ?? null

  const rail = routine.exercises.map((e, i) => {
    const t = targetSets(e)
    const d = session.sets.filter(s => s.exerciseId === e.id && s.done).length
    const state: RailState = i === currentIndex ? 'current' : d >= t ? 'done' : d > 0 ? 'partial' : 'pending'
    return { id: e.id, i, label: String(i + 1).padStart(2, '0'), name: e.name, done: d, target: t, state }
  })

  const setRows = Array.from({ length: n }, (_, i) => {
    const s = mine.find(x => x.setIndex === i)
    const state: SetRowState = s?.done ? 'done' : i === currentSetIndex ? 'current' : 'pending'
    const ref = prev?.sets[i] ?? prev?.sets[prev.sets.length - 1]
    return { i, s, ref, state }
  })

  // Handler unico para las tres filas (hecha, actual, pendiente): sin
  // disabled y sin guardia sobre la fila anterior — cualquier serie se marca
  // en cualquier orden (AC-SETS-01).
  const toggleSet = (i: number, s: SetLog | undefined, ref: SetLog | undefined) => {
    const next = !s?.done
    const w = s?.weight ?? ref?.weight ?? null
    const r = s?.reps ?? ex.repsHigh
    update(ex.id, i, { done: next, weight: s?.weight ?? w, reps: s?.reps ?? r })
    if (next) setRest({ sec: ex.restSec, key: Date.now() })
  }

  const toggleCue = () => setCueOpen(c => ({ ...c, [ex.id]: !isCueOpen }))

  return (
    <>
      <div className="session-head">
        <div className="row">
          <div className="grow">
            <div className="eyebrow accent">{routine.name}</div>
            <h1>
              {String(totalDone).padStart(2, '0')}
              <span>/ {totalTarget} series</span>
            </h1>
          </div>
          <button className="primary" onClick={onFinish} disabled={totalDone === 0}>
            Terminar
          </button>
        </div>
        <div className="session-bar">
          <i style={{ flex: totalDone }} />
          <i style={{ flex: totalTarget - totalDone }} />
        </div>
        <div className="rail" ref={railRef}>
          {rail.map(r => (
            <button
              key={r.id}
              className={r.state === 'pending' ? undefined : r.state}
              onClick={() => setCurrentIndex(r.i)}
              aria-label={`${r.i + 1}. ${r.name} — ${r.done} de ${r.target} series`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ex-panel">
        <h2>
          {ex.name} {ex.main && <span className="pill">principal</span>}
        </h2>
        <div className="metabar">
          <span>{n} × {ex.repsLow}–{ex.repsHigh}</span>
          <span>Descanso {ex.restSec}s</span>
          {seat && <span>Asiento {seat}</span>}
        </div>

        {progress && prev && (
          <div className="tag-skew-wrap">
            <div className="tag-skew">
              <span>Sube peso</span>
            </div>
            <p>{progressLine(prev.sets.length, Math.min(...prev.sets.map(s => s.reps ?? ex.repsHigh)))}</p>
          </div>
        )}

        {prev ? (
          <div className="last-perf">
            <div className="label">La vez pasada · {fmtDate(prev.session.date)}</div>
            <div className="value num">{formatLastPerformance(prev.sets)}</div>
          </div>
        ) : (
          <p className="hint">Primera vez con este ejercicio. Empieza liviano: la primera serie es de reconocimiento.</p>
        )}

        {setRows.map(row =>
          row.state === 'current' ? (
            <div className="setnow" key={row.i}>
              <div className="setnow-head">
                <span className="lbl-current">
                  Serie {row.i + 1} de {n}
                </span>
                {row.i + 1 === n && <span className="lbl-last">La última</span>}
              </div>
              <div className="setnow-grid">
                <div>
                  <div className="micro">kg</div>
                  <input
                    type="number" inputMode="decimal" step="0.5"
                    className={`num${row.s?.weight != null ? ' filled' : ''}`}
                    placeholder={row.ref?.weight != null ? String(row.ref.weight) : '—'}
                    value={row.s?.weight ?? ''}
                    onChange={e => update(ex.id, row.i, { weight: e.target.value === '' ? null : Number(e.target.value) })}
                    aria-label={`Peso serie ${row.i + 1}`}
                  />
                </div>
                <div>
                  <div className="micro">reps</div>
                  <input
                    type="number" inputMode="numeric"
                    className={`num${row.s?.reps != null ? ' filled' : ''}`}
                    placeholder={String(ex.repsHigh)}
                    value={row.s?.reps ?? ''}
                    onChange={e => update(ex.id, row.i, { reps: e.target.value === '' ? null : Number(e.target.value) })}
                    aria-label={`Repeticiones serie ${row.i + 1}`}
                  />
                </div>
                <button
                  className="check"
                  aria-label={row.s?.done ? 'Deshacer serie' : 'Marcar serie'}
                  onClick={() => toggleSet(row.i, row.s, row.ref)}
                >
                  <Check on={!!row.s?.done} />
                </button>
              </div>
            </div>
          ) : (
            <div className={`setrow ${row.state}`} key={row.i}>
              <div className="idx num">{row.i + 1}</div>
              <input
                type="number" inputMode="decimal" step="0.5" className="num"
                placeholder={row.ref?.weight != null ? String(row.ref.weight) : '—'}
                value={row.s?.weight ?? ''}
                onChange={e => update(ex.id, row.i, { weight: e.target.value === '' ? null : Number(e.target.value) })}
                aria-label={`Peso serie ${row.i + 1}`}
              />
              <input
                type="number" inputMode="numeric" className="num"
                placeholder={String(ex.repsHigh)}
                value={row.s?.reps ?? ''}
                onChange={e => update(ex.id, row.i, { reps: e.target.value === '' ? null : Number(e.target.value) })}
                aria-label={`Repeticiones serie ${row.i + 1}`}
              />
              <button
                className={`check${row.s?.done ? ' on' : ''}`}
                aria-label={row.s?.done ? 'Deshacer serie' : 'Marcar serie'}
                onClick={() => toggleSet(row.i, row.s, row.ref)}
              >
                <Check on={!!row.s?.done} />
              </button>
            </div>
          ),
        )}

        <button className="disclosure-toggle" onClick={toggleCue}>
          <span className="lbl">Cómo se ajusta</span>
          <span className="glyph">{isCueOpen ? '−' : '+'}</span>
        </button>
        {isCueOpen && (
          <div className="disclosure-body">
            <p className="hint" style={{ marginBottom: 12 }}>{ex.cue}</p>
            <div className="btnrow" style={{ marginBottom: 16 }}>
              <a href={MW + ex.mwSlug} target="_blank" rel="noopener noreferrer" className="btn primary">
                Ver en MuscleWiki
              </a>
            </div>
            <label htmlFor={`seat-${ex.id}`}>Número de asiento o ajuste</label>
            <input
              id={`seat-${ex.id}`}
              key={ex.id}
              type="text"
              defaultValue={seat}
              placeholder="p. ej. asiento 4, pin 3"
              onBlur={e => saveMeta({ exerciseId: ex.id, seat: e.target.value, note: meta[ex.id]?.note ?? '' })}
            />
            <p className="hint">Se guarda solo y aparece aquí la próxima sesión.</p>
          </div>
        )}

        <div className="navrow">
          <button
            className="back"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex(i => i - 1)}
            aria-label={currentIndex > 0 ? `Anterior: ${routine.exercises[currentIndex - 1].name}` : 'Anterior'}
          >
            ←
          </button>
          {currentIndex < routine.exercises.length - 1 ? (
            <button className="fwd" onClick={() => setCurrentIndex(i => i + 1)}>
              Siguiente · {routine.exercises[currentIndex + 1].name}
            </button>
          ) : (
            <button className="fwd primary" onClick={onFinish} disabled={totalDone === 0}>
              Terminar sesión
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <label htmlFor="notas">Notas de la sesión</label>
        <textarea
          id="notas" value={session.notes} placeholder="Cómo te sentiste, molestias, cambios de máquina…"
          onChange={e => onChange({ ...session, notes: e.target.value })}
        />
      </div>

      <div className="btnrow" style={{ marginBottom: 20 }}>
        <button
          className="danger"
          onClick={() => {
            if (confirm('¿Descartar esta sesión? No se guarda nada.')) onDiscard()
          }}
        >
          Descartar
        </button>
      </div>

      <div style={{ height: rest ? 96 : 0 }} />

      {rest && (
        <RestTimer
          key={rest.key}
          seconds={rest.sec}
          onDone={() => toast.show('Descanso terminado')}
          onClose={() => setRest(null)}
        />
      )}
      {toast.node}
    </>
  )
}

// newSession y sessionSummary se movieron a lib/disciplines.ts como
// DISCIPLINES.strength.create/digest: Train.tsx no debe importar logica de
// dominio desde una vista.
