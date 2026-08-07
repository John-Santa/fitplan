import { useState } from 'react'
import type { RoutineId, Session } from '../types'
import { ROUTINES, SESSION_KIND_FOR_DAY, blockPhase, routineById, routineDaysLabel, routineForWeekday, routineSetCount } from '../lib/plan'
import { doneSets, fmtDate, fmtDuration, mmss, sessionVolume, todayISO } from '../lib/calc'
import { DISCIPLINES, SWIM_STROKE_LABELS, finishSwimSession, metresToLaps, sessionDigest, swimDistance, swimPaceSecPer100m } from '../lib/disciplines'
import { useStore } from '../lib/store'
import ActiveSession from './ActiveSession'
import ExerciseProgress from './ExerciseProgress'
import SwimProgress from './SwimProgress'
import { Empty } from '../components/ui'

/** Que progresion mostrar: por rutina (fuerza) o la unica de natacion — a
 *  diferencia de fuerza, natacion no tiene "por ejercicio", asi que su rama
 *  no lleva id. Union en vez de un RoutineId | null ampliado a mano: agregar
 *  una disciplina nueva con progresion propia exige agregarle su rama aca. */
type ProgressTarget = { kind: 'strength'; routineId: RoutineId } | { kind: 'swim' }

export default function Train() {
  const { sessions, config, saveSession, deleteSession } = useStore()
  const [active, setActive] = useState<Session | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [progressFor, setProgressFor] = useState<ProgressTarget | null>(null)

  const phase = blockPhase(new Date(), config.blockStart)
  const suggested = routineForWeekday(config.weeklyRoutine, new Date().getDay())
  // Que disciplina, si alguna, planifica hoy — gobierna la pildora "hoy" de
  // la tarjeta de natacion, igual criterio que Home.tsx usa para su CTA.
  const todayKind = SESSION_KIND_FOR_DAY[config.weeklyRoutine[new Date().getDay()].kind]

  if (active) {
    return (
      <ActiveSession
        session={active}
        setsDelta={phase.setsDelta}
        onChange={setActive}
        onFinish={async () => {
          const finished: Session =
            active.kind === 'strength'
              ? { ...active, finishedAt: Date.now(), sets: active.sets.filter(s => s.done) }
              // R7: el fin de natacion nunca descarta un bloque por su marca
              // de "hecho" (ver finishSwimSession en disciplines.ts) — a
              // diferencia de la linea de arriba, que si filtra para fuerza.
              : finishSwimSession(active, Date.now())
          await saveSession(finished)
          setActive(null)
        }}
        onDiscard={() => setActive(null)}
      />
    )
  }

  if (progressFor) {
    return progressFor.kind === 'strength'
      ? <ExerciseProgress routineId={progressFor.routineId} onBack={() => setProgressFor(null)} />
      : <SwimProgress onBack={() => setProgressFor(null)} />
  }

  if (detail) {
    const s = sessions.find(x => x.id === detail)
    if (!s) return null
    const digest = sessionDigest(s)
    return (
      <>
        <button className="ghost" onClick={() => setDetail(null)}>← Volver</button>
        {s.kind === 'strength' ? (
          <>
            <div className="eyebrow">{fmtDate(s.date, true)} · {doneSets(s)} series</div>
            <h1>{digest.title}</h1>
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
                      const r = routineById(s.routineId)
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
          </>
        ) : (
          <>
            <div className="eyebrow">{fmtDate(s.date, true)} · {s.blocks.length} bloques</div>
            <h1>{digest.title}</h1>
            <p className="muted num">
              {Math.round(swimDistance(s)).toLocaleString('es-CO')} m
              {s.finishedAt && ` · ${fmtDuration(s.finishedAt - s.startedAt)}`}
              {s.rpe != null && ` · RPE ${s.rpe}`}
            </p>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr><th>Bloque</th><th>Largos</th><th>Tiempo</th><th>Ritmo (/100m)</th></tr>
                </thead>
                <tbody>
                  {s.blocks.map((b, i) => {
                    const laps = metresToLaps(b.distanceM, s.poolLengthM)
                    const pace = swimPaceSecPer100m(b)
                    return (
                      <tr key={i} className={b.done ? undefined : 'muted'}>
                        <td>{b.index + 1} · {SWIM_STROKE_LABELS[b.stroke]}</td>
                        <td className="num">{laps ?? '—'}</td>
                        <td className="num">{b.timeSec != null ? mmss(b.timeSec) : '—'}</td>
                        <td className="num">{pace != null ? mmss(Math.round(pace)) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
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
            <button className="ghost" style={{ marginTop: 10, padding: '7px 12px', fontSize: 13 }} onClick={() => setProgressFor({ kind: 'strength', routineId: r.id })}>
              Ver progresión
            </button>
          </div>
        ))}

        <div className="card" style={{ marginBottom: 10 }}>
          <div className="row">
            <div className="grow">
              <strong>{DISCIPLINES.swim.label}</strong>
              {todayKind === 'swim' && <span className="pill" style={{ marginLeft: 8 }}>hoy</span>}
              <div className="muted">Piscina de {config.poolLengthM} m</div>
            </div>
            <button
              className="primary"
              data-testid="start-swim"
              onClick={() => setActive(DISCIPLINES.swim.create(todayISO(), config.poolLengthM))}
            >
              {DISCIPLINES.swim.startLabel}
            </button>
          </div>
          <button className="ghost" style={{ marginTop: 10, padding: '7px 12px', fontSize: 13 }} onClick={() => setProgressFor({ kind: 'swim' })}>
            Ver progresión
          </button>
        </div>
      </div>

      <div className="col-b">
        <div className="section-title">Historial</div>
        {sessions.length === 0 ? (
          <Empty title="Todavía no hay sesiones">
            Cuando termines la primera, aquí vas a ver el detalle de cada sesión — series y peso en fuerza, largos y tiempo en natación.
          </Empty>
        ) : (
          <div className="tablewrap">
            {sessions.map(s => {
              const digest = sessionDigest(s)
              const metaLine =
                s.kind === 'strength'
                  ? `${doneSets(s)} series · ${Math.round(sessionVolume(s)).toLocaleString('es-CO')} kg`
                  : `${Math.round(swimDistance(s)).toLocaleString('es-CO')} m`
              return (
                <div className="list-item" key={s.id} onClick={() => setDetail(s.id)} style={{ cursor: 'pointer' }}>
                  <div className="grow">
                    <div className="t1">
                      {digest.title}{' '}
                      {!s.finishedAt && <span className="pill warn">sin terminar</span>}
                    </div>
                    <div className="t2 num">
                      {fmtDate(s.date, true)} · {metaLine}
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
