import { useState } from 'react'
import type { Exercise, Session, SetLog } from '../types'
import { MW, routineById } from '../lib/plan'
import { bestSet, fmt, lastPerformance, shouldProgress } from '../lib/calc'
import { useStore } from '../lib/store'
import { Check, RestTimer, useToast } from '../components/ui'

interface Props {
  session: Session
  setsDelta: number
  onChange: (s: Session) => void
  onFinish: () => void
  onDiscard: () => void
}

export default function ActiveSession({ session, setsDelta, onChange, onFinish, onDiscard }: Props) {
  const { sessions, meta, saveMeta } = useStore()
  const routine = routineById(session.routineId)!
  const toast = useToast()
  const [open, setOpen] = useState<string | null>(routine.exercises[0]?.id ?? null)
  const [rest, setRest] = useState<{ sec: number; key: number } | null>(null)

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

  return (
    <>
      <div className="card accent tight">
        <div className="row">
          <div className="grow">
            <h1 className="eyebrow accent">{routine.name}</h1>
            <div className="muted num">
              {totalDone} de {totalTarget} series · {routine.zone}
            </div>
          </div>
          <button className="primary" onClick={onFinish} disabled={totalDone === 0}>
            Terminar
          </button>
        </div>
        <div className="bar" style={{ marginTop: 9 }}>
          <i style={{ width: `${totalTarget ? (totalDone / totalTarget) * 100 : 0}%` }} />
        </div>
      </div>

      {routine.exercises.map(ex => {
        const n = targetSets(ex)
        const mine = setsFor(ex.id)
        const doneCount = mine.filter(s => s.done).length
        const prev = lastPerformance(sessions, ex.id, session.id)
        const progress = prev && shouldProgress(prev.sets, Math.max(1, ex.sets + setsDelta), ex.repsHigh)
        const isOpen = open === ex.id
        const seat = meta[ex.id]?.seat ?? ''
        return (
          <section key={ex.id} className={`exercise${doneCount >= n ? ' done' : ''}`}>
            <div className="ex-head" onClick={() => setOpen(isOpen ? null : ex.id)}>
              <div className="grow">
                <h3>
                  {ex.name} {ex.main && <span className="pill">principal</span>}
                </h3>
                <div className="meta num">
                  {n} × {ex.repsLow}–{ex.repsHigh} · descanso {ex.restSec}s
                  {seat && ` · asiento ${seat}`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="num" style={{ fontWeight: 700, fontSize: 15 }}>
                  {doneCount}/{n}
                </div>
                {progress && <span className="pill good">sube peso</span>}
              </div>
            </div>

            {isOpen && (
              <div className="ex-body">
                <p className="hint" style={{ marginBottom: 4 }}>{ex.cue}</p>
                <p className="hint" style={{ marginTop: 2 }}>
                  <a href={MW + ex.mwSlug} target="_blank" rel="noopener noreferrer">Ver la ejecución ↗</a>
                </p>

                {prev ? (
                  <div className="card tight" style={{ margin: '10px 0 0', background: 'var(--plane)' }}>
                    <div className="muted" style={{ fontWeight: 700, fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase' }}>
                      Sesión anterior
                    </div>
                    <div className="num" style={{ fontSize: 13.5 }}>
                      {prev.sets.map(s => `${fmt(s.weight)} kg × ${s.reps}`).join('  ·  ')}
                    </div>
                    {progress && (
                      <div className="num" style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                        Completaste el rango: hoy sube a la siguiente placa.
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="hint">Primera vez con este ejercicio. Empieza liviano: la primera serie es de reconocimiento.</p>
                )}

                <div className="setlabels">
                  <span>#</span><span>kg</span><span>reps</span><span />
                </div>
                {Array.from({ length: n }, (_, i) => {
                  const s = mine.find(x => x.setIndex === i)
                  const ref = prev?.sets[i] ?? prev?.sets[prev.sets.length - 1]
                  return (
                    <div className="setrow" key={i}>
                      <div className="idx num">{i + 1}</div>
                      <input
                        type="number" inputMode="decimal" step="0.5" className="num"
                        placeholder={ref?.weight != null ? String(ref.weight) : '—'}
                        value={s?.weight ?? ''}
                        onChange={e => update(ex.id, i, { weight: e.target.value === '' ? null : Number(e.target.value) })}
                        aria-label={`Peso serie ${i + 1}`}
                      />
                      <input
                        type="number" inputMode="numeric" className="num"
                        placeholder={String(ex.repsHigh)}
                        value={s?.reps ?? ''}
                        onChange={e => update(ex.id, i, { reps: e.target.value === '' ? null : Number(e.target.value) })}
                        aria-label={`Repeticiones serie ${i + 1}`}
                      />
                      <button
                        className={`check${s?.done ? ' on' : ''}`}
                        aria-label={s?.done ? 'Deshacer serie' : 'Marcar serie'}
                        onClick={() => {
                          const next = !s?.done
                          const w = s?.weight ?? ref?.weight ?? null
                          const r = s?.reps ?? ex.repsHigh
                          update(ex.id, i, { done: next, weight: s?.weight ?? w, reps: s?.reps ?? r })
                          if (next) setRest({ sec: ex.restSec, key: Date.now() })
                        }}
                      >
                        <Check on={!!s?.done} />
                      </button>
                    </div>
                  )
                })}

                <div style={{ marginTop: 12 }}>
                  <label htmlFor={`seat-${ex.id}`}>Número de asiento o ajuste</label>
                  <input
                    id={`seat-${ex.id}`} type="text" defaultValue={seat} placeholder="p. ej. asiento 4, pin 3"
                    onBlur={e => saveMeta({ exerciseId: ex.id, seat: e.target.value, note: meta[ex.id]?.note ?? '' })}
                  />
                  <p className="hint">Se guarda solo y aparece aquí la próxima sesión.</p>
                </div>
              </div>
            )}
          </section>
        )
      })}

      <div className="card">
        <label htmlFor="notas">Notas de la sesión</label>
        <textarea
          id="notas" value={session.notes} placeholder="Cómo te sentiste, molestias, cambios de máquina…"
          onChange={e => onChange({ ...session, notes: e.target.value })}
        />
      </div>

      <div className="btnrow" style={{ marginBottom: 20 }}>
        <button className="primary big grow" onClick={onFinish} disabled={totalDone === 0}>
          Terminar sesión
        </button>
        <button
          className="danger"
          onClick={() => {
            if (confirm('¿Descartar esta sesión? No se guarda nada.')) onDiscard()
          }}
        >
          Descartar
        </button>
      </div>

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

export function newSession(routineId: Session['routineId'], date: string): Session {
  return {
    id: `${routineId}-${Date.now()}`,
    routineId,
    date,
    startedAt: Date.now(),
    finishedAt: null,
    sets: [],
    notes: '',
  }
}

export function sessionSummary(s: Session) {
  const r = routineById(s.routineId)
  const best = r?.exercises.map(e => ({ e, b: bestSet(s.sets, e.id) })).filter(x => x.b) ?? []
  return best.map(x => `${x.e.name}: ${fmt(x.b!.weight)} kg × ${x.b!.reps}`)
}
