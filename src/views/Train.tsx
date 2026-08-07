import { useState } from 'react'
import type { RoutineId, StrengthSession } from '../types'
import { ROUTINES, blockPhase, routineById, routineDaysLabel, routineForWeekday, routineSetCount } from '../lib/plan'
import { doneSets, fmtDate, fmtDuration, sessionVolume, todayISO } from '../lib/calc'
import { DISCIPLINES, sessionDigest } from '../lib/disciplines'
import { useStore } from '../lib/store'
import ActiveSession from './ActiveSession'
import ExerciseProgress from './ExerciseProgress'
import { Empty } from '../components/ui'

export default function Train() {
  const { sessions, config, saveSession, deleteSession } = useStore()
  // Entrenar es, por ahora, exclusivamente de fuerza (la natacion llega en
  // F1-5 con su propia pantalla): filtrar aca es lo que le permite a
  // ActiveSession, sessionVolume y doneSets seguir tipados a StrengthSession
  // sin narrowing repetido en cada uso mas abajo.
  const strengthSessions = sessions.filter((s): s is StrengthSession => s.kind === 'strength')
  const [active, setActive] = useState<StrengthSession | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [progressFor, setProgressFor] = useState<RoutineId | null>(null)

  const phase = blockPhase(new Date(), config.blockStart)
  const suggested = routineForWeekday(config.weeklyRoutine, new Date().getDay())

  if (active) {
    return (
      <ActiveSession
        session={active}
        setsDelta={phase.setsDelta}
        onChange={setActive}
        onFinish={async () => {
          const finished: StrengthSession = {
            ...active,
            finishedAt: Date.now(),
            sets: active.sets.filter(s => s.done),
          }
          await saveSession(finished)
          setActive(null)
        }}
        onDiscard={() => setActive(null)}
      />
    )
  }

  if (progressFor) {
    return <ExerciseProgress routineId={progressFor} onBack={() => setProgressFor(null)} />
  }

  if (detail) {
    const s = strengthSessions.find(x => x.id === detail)
    if (!s) return null
    const r = routineById(s.routineId)
    return (
      <>
        <button className="ghost" onClick={() => setDetail(null)}>← Volver</button>
        <div className="eyebrow">{fmtDate(s.date, true)} · {doneSets(s)} series</div>
        <h1>{r?.name}</h1>
        <p className="muted num">
          {Math.round(sessionVolume(s)).toLocaleString('es-CO')} kg de volumen
          {s.finishedAt && ` · ${fmtDuration(s.finishedAt - s.startedAt)}`}
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Ejercicio</th><th>Serie</th><th>kg</th><th>Reps</th></tr>
            </thead>
            <tbody>
              {s.sets
                .slice()
                .sort((a, b) => a.exerciseId.localeCompare(b.exerciseId) || a.setIndex - b.setIndex)
                .map((x, i) => {
                  const ex = r?.exercises.find(e => e.id === x.exerciseId)
                  return (
                    <tr key={i}>
                      <td>{ex?.name ?? x.exerciseId}</td>
                      <td className="num">{x.setIndex + 1}</td>
                      <td className="num">{x.weight ?? '—'}</td>
                      <td className="num">{x.reps ?? '—'}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        {s.notes && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Notas</div>
            <p style={{ margin: 0 }}>{s.notes}</p>
          </div>
        )}
        <button
          className="danger block"
          style={{ marginTop: 12 }}
          onClick={async () => {
            if (confirm('¿Eliminar esta sesión del historial?')) {
              await deleteSession(s.id)
              setDetail(null)
            }
          }}
        >
          Eliminar sesión
        </button>
      </>
    )
  }

  return (
    <>
      <div className="eyebrow">Semana {phase.week} de 8</div>
      <h1>Entrenar</h1>

      <div className="card accent tight">
        <div className="row">
          <div className="grow">
            <strong>{phase.label}</strong>
            <div className="muted">{phase.rir}{phase.setsDelta !== 0 && ' · una serie menos por ejercicio'}</div>
          </div>
        </div>
      </div>

      <div className="col-a">
        <div className="section-title">Empezar sesión</div>
        {ROUTINES.map(r => (
          <div className="card" key={r.id} style={{ marginBottom: 10 }}>
            <div className="row">
              <div className="grow">
                <strong>{r.name}</strong>
                {suggested?.id === r.id && <span className="pill" style={{ marginLeft: 8 }}>hoy</span>}
                <div className="muted">{routineDaysLabel(config.weeklyRoutine, r.id)} · {r.zone}</div>
                <div className="muted num" style={{ fontSize: 12.5 }}>
                  {r.exercises.length} ejercicios · {routineSetCount(r, phase.setsDelta)} series
                </div>
              </div>
              <button
                className="primary"
                data-testid={`start-${r.id}`}
                onClick={() => setActive(DISCIPLINES.strength.create(todayISO(), r.id))}
              >
                {DISCIPLINES.strength.startLabel}
              </button>
            </div>
            <button className="ghost" style={{ marginTop: 10, padding: '7px 12px', fontSize: 13 }} onClick={() => setProgressFor(r.id)}>
              Ver progresión
            </button>
          </div>
        ))}
      </div>

      <div className="col-b">
        <div className="section-title">Historial</div>
        {strengthSessions.length === 0 ? (
          <Empty title="Todavía no hay sesiones">
            Cuando termines la primera, aquí vas a ver el peso de cada ejercicio — que es lo que necesitas para saber cuándo subir de placa.
          </Empty>
        ) : (
          <div className="tablewrap">
            {strengthSessions.map(s => {
              const digest = sessionDigest(s)
              return (
                <div className="list-item" key={s.id} onClick={() => setDetail(s.id)} style={{ cursor: 'pointer' }}>
                  <div className="grow">
                    <div className="t1">
                      {digest.title}{' '}
                      {!s.finishedAt && <span className="pill warn">sin terminar</span>}
                    </div>
                    <div className="t2 num">
                      {fmtDate(s.date, true)} · {doneSets(s)} series ·{' '}
                      {Math.round(sessionVolume(s)).toLocaleString('es-CO')} kg
                    </div>
                    {digest.lines.length > 0 && <div className="t2" style={{ marginTop: 2 }}>{digest.lines.slice(0, 2).join(' · ')}</div>}
                  </div>
                  <div className="muted">›</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
