import { fmtDuration } from '../../../lib/calc'
import { formatVolume, recordLine } from '../../../lib/records'
import type { SessionSummaryData } from '../lib/summary'

interface Props {
  routineName: string
  summary: SessionSummaryData
  /** Display name of an exercise in the session's routine. */
  nameOf: (exerciseId: string) => string
  /** Back to the Entrenar list. */
  onDone: () => void
}

const signed = (n: number, text: string) => `${n > 0 ? '+' : ''}${text}`

/** Closing screen after "Terminar entrenamiento". Presentational only: the
 *  session is already saved when this shows, so leaving it loses nothing. */
export default function SessionSummary({ routineName, summary, nameOf, onDone }: Props) {
  const { volume, durationMs, records, comparison, streakDays } = summary
  return (
    <section className="ses-summary" aria-labelledby="ses-summary-title">
      <div className="eyebrow">{[routineName, durationMs != null ? fmtDuration(durationMs) : ''].filter(Boolean).join(' · ')}</div>
      <h1 id="ses-summary-title">Sesión terminada</h1>

      <div className="card ses-summary-card">
        {volume > 0 && <p className="num">Volumen total: {formatVolume(volume)} kg</p>}
        {comparison?.kind === 'previous' && (
          <p className="num">
            Frente a la sesión anterior: {signed(comparison.volumeDelta, formatVolume(comparison.volumeDelta))} kg de volumen ·{' '}
            {signed(comparison.setsDelta, String(comparison.setsDelta))} {Math.abs(comparison.setsDelta) === 1 ? 'serie' : 'series'}
          </p>
        )}
        {comparison?.kind === 'first' && <p>Primera vez con esta rutina</p>}
        <p className="num">Racha: {streakDays} {streakDays === 1 ? 'día' : 'días'}</p>
      </div>

      {records.length > 0 && (
        <div className="card ses-summary-card">
          <div className="section-title">Récords de hoy</div>
          <ul className="ses-summary-records">
            {records.map(r => (
              <li key={`${r.exerciseId}:${r.kind}`}>{recordLine(r, nameOf(r.exerciseId))}</li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" className="primary block ses-summary-done" onClick={onDone}>Listo</button>
    </section>
  )
}
