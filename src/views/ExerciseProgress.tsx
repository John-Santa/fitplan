import { useState } from 'react'
import type { RoutineId, StrengthSession } from '../types'
import { routineById } from '../lib/plan'
import { bestSet, fmt, fmtDate, fmtSigned, shouldProgress } from '../lib/calc'
import { useStore } from '../lib/store'
import Chart, { type Series } from '../components/Chart'
import { Empty, Tile } from '../components/ui'

export default function ExerciseProgress({ routineId, onBack }: { routineId: RoutineId; onBack: () => void }) {
  const { sessions } = useStore()
  const routine = routineById(routineId)!
  const [exId, setExId] = useState(routine.exercises[0].id)
  const ex = routine.exercises.find(e => e.id === exId)!

  // La progresion por ejercicio solo existe para fuerza: una SwimSession no
  // tiene routineId ni .sets, asi que se descarta aca, no mas abajo.
  const done = sessions
    .filter((s): s is StrengthSession => s.kind === 'strength' && !!s.finishedAt && s.routineId === routineId)
    .sort((a, b) => a.startedAt - b.startedAt)

  const rows = done.flatMap(s => {
    const b = bestSet(s.sets, exId)
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
        y: s.sets.filter(x => x.exerciseId === exId && x.done).reduce((a, x) => a + (x.weight ?? 0) * (x.reps ?? 0), 0),
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
        <select id="ex" value={exId} onChange={e => setExId(e.target.value)}>
          {routine.exercises.map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <p className="hint" style={{ marginBottom: 0 }}>
          Objetivo: {ex.sets} × {ex.repsLow}–{ex.repsHigh}. Cuando completes todas las series con {ex.repsHigh}{' '}
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
              const rango = shouldProgress(r.s.sets.filter(x => x.exerciseId === exId), 2, ex.repsHigh)
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
