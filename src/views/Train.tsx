import { useEffect, useState } from 'react'
import type { RoutineId, Session } from '../types'
import { SESSION_KIND_FOR_DAY } from '../lib/plan'
import { exerciseNameInRoutine, routineDaysLabel, routineForWeekday, routineSetCount, routineSlots, weekLabel } from '../lib/planQueries'
import { blockWeekNumber, phaseForWeek } from '../lib/phases'
import { isPainValue, painVerdict } from '../lib/pain'
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

export default function Train({ autoStart, autoStartMinimal, onAutoStarted }: { autoStart?: string; autoStartMinimal?: boolean; onAutoStarted?: () => void } = {}) {
  const { sessions, config, plan, saveSession, deleteSession } = useStore()
  const [active, setActive] = useState<Session | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [progressFor, setProgressFor] = useState<ProgressTarget | null>(null)

  // Arranque directo desde Hoy: igual que el boton "start" de la rutina.
  useEffect(() => {
    if (!autoStart || active) return
    const created = DISCIPLINES.strength.create(todayISO(), autoStart)
    setActive(autoStartMinimal ? { ...created, minimal: true } : created)
    onAutoStarted?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  const week = blockWeekNumber(new Date(), config.blockStart)
  const phase = phaseForWeek(plan, week)
  const suggested = routineForWeekday(plan, config.weeklyRoutine, new Date().getDay())
  // Las activas, mas la de hoy si el dia semanal todavia apunta a una archivada.
  const routines = plan.routines.filter(r => !r.archived || r.id === suggested?.id)
  // Rutinas archivadas con historial: ya no se empiezan, pero su progresion
  // sigue consultable.
  const archivedWithHistory = plan.routines.filter(
    r => r.archived && sessions.some(s => s.kind === 'strength' && s.routineId === r.id),
  )
  // Que disciplina, si alguna, planifica hoy — gobierna la pildora "hoy" de
  // la tarjeta de natacion, igual criterio que Home.tsx usa para su CTA.
  const todayKind = SESSION_KIND_FOR_DAY[config.weeklyRoutine[new Date().getDay()].kind]

  if (active) {
    return (
      <ActiveSession
        session={active}
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
    const digest = sessionDigest(s, plan)
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
                      const done = x.durationSec != null ? `${x.durationSec} s` : x.distanceM != null ? `${x.distanceM} m` : '—'
                      return (
                        <tr key={i}>
                          <td>{exerciseNameInRoutine(plan, s.routineId, x.exerciseId)}</td>
                          <td className="num">{x.setIndex + 1}</td>
                          <td className="num">{x.weight ?? '—'}</td>
                          <td className="num">{x.reps ?? done}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
            {s.pain && Object.keys(s.pain).length > 0 && (
              <div className="card" style={{ marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Dolor registrado</div>
                {Object.entries(s.pain).filter(([, v]) => isPainValue(v)).map(([id, v]) => (
                  <p key={id} style={{ margin: 0 }}>
                    {exerciseNameInRoutine(plan, s.routineId, id)}: <strong className="num">{v}/10</strong> · {painVerdict(v).label}
                  </p>
                ))}
              </div>
            )}
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
      <div className="eyebrow">{weekLabel(plan.weeks, week)}</div>
      <h1>Entrenar</h1>

      {phase && (
        <div className="card accent tight">
          <div className="row">
            <div className="grow">
              <strong>{phase.intensity}</strong>
              <div className="muted">
                {phase.sets}
                {phase.loadNote !== '' && ` · ${phase.loadNote}`}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="col-a">
        <div className="section-title">Empezar sesión</div>
        {routines.map(r => (
          <div className="card" key={r.id} style={{ marginBottom: 10 }}>
            <div className="row">
              <div className="grow">
                <strong>{r.name}</strong>
                {suggested?.id === r.id && <span className="pill" style={{ marginLeft: 8 }}>hoy</span>}
                <div className="muted">{routineDaysLabel(config.weeklyRoutine, r.id)}{r.focus !== '' && ` · ${r.focus}`}</div>
                <div className="muted num" style={{ fontSize: 12.5 }}>
                  {routineSlots(r, week).length} ejercicios · {routineSetCount(plan, r, week)} series
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

        {archivedWithHistory.map(r => (
          <div className="card" key={r.id} style={{ marginBottom: 10 }}>
            <strong>{r.name}</strong> <span className="pill">archivada</span>
            <div className="muted">Ya no se empieza desde aquí; tu historial se conserva.</div>
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
              const digest = sessionDigest(s, plan)
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
