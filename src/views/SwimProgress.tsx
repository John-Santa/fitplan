import type { SwimSession } from '../types'
import { fmtDate, mmss } from '../lib/calc'
import { DISCIPLINES, swimDistance, swimSessionPaceSecPer100m, swimSessionSpeedMPerMin } from '../lib/disciplines'
import { useStore } from '../lib/store'
import Chart, { type Series } from '../components/Chart'
import { Tile } from '../components/ui'

interface SwimRow {
  s: SwimSession
  distanceM: number
  paceSecPer100m: number | null
  speedMPerMin: number | null
}

export default function SwimProgress({ onBack }: { onBack: () => void }) {
  const { sessions } = useStore()

  // Progresion de natacion, no de fuerza: una StrengthSession no tiene
  // blocks ni poolLengthM, asi que se descarta aca via el kind, no mas abajo
  // (mismo criterio que ExerciseProgress usa al reves para fuerza).
  const rows: SwimRow[] = sessions
    .filter((s): s is SwimSession => s.kind === 'swim' && !!s.finishedAt)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map(s => ({
      s,
      // swimDistance ya cuenta los bloques marcados con distancia cargada
      // aunque no tengan tiempo (F1-5); el ritmo/velocidad de sesion, en
      // cambio, solo usa los bloques que tienen AMBOS campos (F1-6).
      distanceM: swimDistance(s),
      paceSecPer100m: swimSessionPaceSecPer100m(s),
      speedMPerMin: swimSessionSpeedMPerMin(s),
    }))

  const totalDistance = rows.reduce((a, r) => a + r.distanceM, 0)
  const latest = rows[rows.length - 1]

  const distanceSeries: Series[] = [
    {
      key: 'distancia',
      label: 'Distancia (m)',
      color: 'var(--s1)',
      points: rows.map(r => ({ x: r.s.date, y: r.distanceM })),
    },
  ]

  // Velocidad, no ritmo: mejor-cuanto-mas-alta, asi que el eje de Chart (que
  // siempre sube hacia arriba, sin invertir) ya apunta en la direccion
  // correcta sin tocar Chart.tsx mas que con dec (ver "Graficas" en el
  // plan). Solo las sesiones con algun bloque cronometrado aportan un punto.
  const speedSeries: Series[] = [
    {
      key: 'velocidad',
      label: 'Velocidad media (m/min)',
      color: 'var(--s2)',
      points: rows.flatMap(r => (r.speedMPerMin != null ? [{ x: r.s.date, y: r.speedMPerMin }] : [])),
    },
  ]

  return (
    <>
      <button className="ghost" onClick={onBack}>← Volver</button>
      <div className="eyebrow">{DISCIPLINES.swim.label}</div>
      <h1>Progresión</h1>

      <div className="col-a">
        <div className="tiles" style={{ marginTop: 12 }}>
          <Tile label="Distancia total" value={totalDistance} unit="m" dec={0} accent />
          <div className="tile">
            <div className="label">Último ritmo</div>
            <div className="value num">
              {latest?.paceSecPer100m != null ? mmss(Math.round(latest.paceSecPer100m)) : '—'} <span>/100 m</span>
            </div>
          </div>
        </div>

        <figure>
          <div className="chart-title">Distancia por sesión</div>
          <div className="chart-sub">Metros nadados en cada sesión terminada</div>
          <Chart series={distanceSeries} unit="m" height={220} xLabel={x => fmtDate(x)} dec={0} />
        </figure>

        <figure>
          <div className="chart-title">Velocidad media</div>
          <div className="chart-sub">Metros por minuto: la línea que tiene que subir</div>
          <Chart series={speedSeries} unit="m/min" height={200} xLabel={x => fmtDate(x)} />
        </figure>
      </div>

      <div className="col-b">
        <div className="section-title">Sesión por sesión</div>
        {rows.slice().reverse().map(r => (
          <div className="histrow" key={r.s.id}>
            <div className="date">{fmtDate(r.s.date, true)}</div>
            <div className="kg">
              <strong>{Math.round(r.distanceM)}</strong>
              <span>m</span>
            </div>
            {r.paceSecPer100m != null && <span className="pill">{mmss(Math.round(r.paceSecPer100m))} /100m</span>}
          </div>
        ))}
      </div>
    </>
  )
}
