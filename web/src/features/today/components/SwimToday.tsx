// Natación's Hoy (S5): hero with the "Nadar" button, the week's count, the
// distance with the last 5 weeks' bars and the last session. Presentational:
// the numbers come from swimToday() and the swim start from Home's prop.
import { DISCIPLINES } from '../../../lib/disciplines'
import { fmtThousands, mmss, type SwimToday as SwimTodayData } from '../lib/swimToday'

export default function SwimToday({ data, poolLengthM, onStart }: {
  data: SwimTodayData
  poolLengthM: number
  /** Starts a swim session, like Train's "Nadar" button. */
  onStart?: () => void
}) {
  const { done, target, distance, weekDistances, state, doneToday, todayDistance, last } = data
  const maxDist = Math.max(...weekDistances, 1)
  return (
    <>
      <section className="hoy-hero" aria-label={DISCIPLINES.swim.label}>
        <div className="hoy-hero-glow" aria-hidden="true" />
        <h1 className="hoy-title">{DISCIPLINES.swim.label}</h1>
        <div className="hoy-meta">
          <span className="hoy-pill">Piscina de {poolLengthM} m</span>
        </div>
        {doneToday && (
          <p className="hoy-note">Ya nadaste hoy · {fmtThousands(todayDistance)} m</p>
        )}
        {state === 'week-met' && <p className="hoy-note">Semana cumplida. Puedes nadar igual.</p>}
        <button type="button" className="hoy-cta" data-testid="hoy-start-swim" onClick={onStart}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
          </svg>
          {DISCIPLINES.swim.startLabel}
        </button>
      </section>

      <section className="hoy-section" aria-label="Esta semana">
        <div className="hoy-section-head">
          <h2 className="hoy-h2">Esta semana: {done} de {target}</h2>
        </div>
      </section>

      <section className="hoy-stats" aria-label="Resumen semanal">
        <div className="hoy-stat">
          <div className="hoy-stat-head">
            <span className="hoy-stat-label">Distancia</span>
          </div>
          <div className="hoy-stat-value">
            <span className="hoy-stat-mid hoy-num">{fmtThousands(distance)}</span>
            <span className="hoy-stat-unit sm">m</span>
          </div>
          <div className="hoy-spark" aria-hidden="true">
            {weekDistances.map((v, i) => (
              <i key={i} className={i === weekDistances.length - 1 ? 'on' : ''} style={{ height: `${Math.max(20, (v / maxDist) * 100)}%` }} />
            ))}
          </div>
        </div>
      </section>

      {last != null && (
        <p className="hoy-rest-line">
          Última sesión: {fmtThousands(last.distanceM)} m{last.paceSecPer100m != null ? ` · ${mmss(last.paceSecPer100m)} /100 m` : ''}
        </p>
      )}
    </>
  )
}
