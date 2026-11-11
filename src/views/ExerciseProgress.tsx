import { useState } from 'react'
import type { PlanSlot, RoutineId, StrengthSession } from '../types'
import { blockWeekNumber, formatTarget, phaseForWeek, setsForSlot } from '../lib/phases'
import { findRoutine, slotExerciseName } from '../lib/planQueries'
import { bestSet, fmt, fmtDate, fmtSigned, shouldProgress } from '../lib/calc'
import { useStore } from '../lib/store'
import Chart, { type Series } from '../components/Chart'
import { Empty, Tile } from '../components/ui'

export default function ExerciseProgress({ routineId, onBack }: { routineId: RoutineId; onBack: () => void }) {
  const { sessions, plan, config } = useStore()
  const routine = findRoutine(plan, routineId)
  // Ejercicios con peso de la rutina (archivada o no), uno por id. Los de
  // tiempo, distancia o nota no tienen una carga que graficar. Toma todos los
  // bloques sin filtrar por semana: el historial cubre las 12.
  const slots: PlanSlot[] = []
  for (const b of routine?.blocks ?? []) {
    for (const s of b.slots) {
      if (s.target.kind === 'reps' && !slots.some(x => x.exerciseId === s.exerciseId)) slots.push(s)
    }
  }
  const [selectedId, setExId] = useState(slots[0]?.exerciseId ?? '')
  const slot = slots.find(s => s.exerciseId === selectedId) ?? slots[0]
  const activeId = slot?.exerciseId ?? ''

  // Series que tocaban en la semana de una sesion: el criterio de "Rango" no
  // puede depender de una cantidad fija (antes 2) ni de la semana de hoy.
  const expectedSets = (s: StrengthSession) => {
    if (!slot) return 0
    const sessionWeek = blockWeekNumber(new Date(s.date + 'T00:00:00'), config.blockStart)
    return setsForSlot(slot, phaseForWeek(plan, sessionWeek))
  }

  if (!routine || !slot || slot.target.kind !== 'reps') {
    return (
      <>
        <button className="ghost" onClick={onBack}>← Volver</button>
        <h1>Progresión</h1>
        <Empty title="Sin ejercicios con peso">
          Esta rutina no tiene ejercicios de repeticiones para graficar.
        </Empty>
      </>
    )
  }
  const target = slot.target
  const weekNow = blockWeekNumber(new Date(), config.blockStart)
  const setsNow = setsForSlot(slot, phaseForWeek(plan, weekNow))

  // La progresion por ejercicio solo existe para fuerza: una SwimSession no
  // tiene routineId ni .sets, asi que se descarta aca, no mas abajo.
  const done = sessions
    .filter((s): s is StrengthSession => s.kind === 'strength' && !!s.finishedAt && s.routineId === routineId)
    .sort((a, b) => a.startedAt - b.startedAt)

  const rows = done.flatMap(s => {
    const b = bestSet(s.sets, activeId)
    return b && b.weight != null ? [{ s, b, weight: b.weight, reps: b.reps }] : []
  })

  const first = rows[0]
  const latest = rows[rows.length - 1]
  const gain = first && latest ? latest.weight - first.weight : 0

  const series: Series[] = [
    {
      key: 'peso',
      label: 'Mejor serie (kg)',
      color: 'var(--s1)',
      points: rows.map(r => ({ x: r.s.date, y: r.weight })),
    },
  ]

  const volume: Series[] = [
    {
      key: 'vol',
      label: 'Volumen del ejercicio (kg)',
      color: 'var(--s2)',
      points: done.map(s => ({
        x: s.date,
        y: s.sets.filter(x => x.exerciseId === activeId && x.done).reduce((a, x) => a + (x.weight ?? 0) * (x.reps ?? 0), 0),
      })).filter(p => p.y > 0),
    },
  ]

  return (
    <>
      <button className="ghost" onClick={onBack}>← Volver</button>
      <div className="eyebrow">{routine.name}</div>
      <h1>Progresión</h1>
      <div className="card" style={{ marginTop: 12 }}>
        <label htmlFor="ex">Ejercicio de {routine.name.toLowerCase()}</label>
        <select id="ex" value={slot.exerciseId} onChange={e => setExId(e.target.value)}>
          {slots.map(s => (
            <option key={s.exerciseId} value={s.exerciseId}>{slotExerciseName(plan, s)}</option>
          ))}
        </select>
        <p className="hint" style={{ marginBottom: 0 }}>
          Objetivo esta semana: {setsNow} × {formatTarget(target)}. Cuando completes todas las series con {target.high}{' '}
          repeticiones, sube a la siguiente placa.
        </p>
      </div>

      {rows.length === 0 || !first || !latest ? (
        <Empty title="Sin datos de este ejercicio">
          Aparece aquí después de tu primera sesión terminada con él.
        </Empty>
      ) : (
        <>
          <div className="col-a">
            <div className="tiles" style={{ marginTop: 12 }}>
              <Tile label="Mejor serie" value={latest.weight} unit={`kg × ${latest.reps ?? '—'}`} accent />
              <div className="tile">
                <div className="label">Desde el {fmtDate(first.s.date)}</div>
                <div className="value num">{fmtSigned(gain)} <span>kg</span></div>
              </div>
            </div>

            <figure>
              <div className="chart-title">Carga máxima por sesión</div>
              <div className="chart-sub">La línea que tiene que subir escalón por escalón</div>
              <Chart series={series} unit="kg" height={220} xLabel={x => fmtDate(x)} />
            </figure>

            <figure>
              <div className="chart-title">Volumen del ejercicio</div>
              <div className="chart-sub">Peso × repeticiones sumado de todas las series</div>
              <Chart series={volume} unit="kg" height={200} xLabel={x => fmtDate(x)} />
            </figure>
          </div>

          <div className="col-b">
            <div className="section-title">Sesión por sesión</div>
            {rows.slice().reverse().map(r => {
              const rango = shouldProgress(r.s.sets.filter(x => x.exerciseId === activeId), expectedSets(r.s), target.high)
              return (
                <div className="histrow" key={r.s.id}>
                  <div className="date">{fmtDate(r.s.date, true)}</div>
                  <div className="kg">
                    <strong>{fmt(r.weight)}</strong>
                    <span>kg × {r.reps ?? '—'}</span>
                  </div>
                  {rango && <span className="pill good">Rango</span>}
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
