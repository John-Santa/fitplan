const kg = (n: number): string => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} kg`

interface Props {
  /** Volumen (kg) de la semana 1 y de la ultima semana del bloque. */
  first: number
  last: number
  weeks?: number
  onStartNew: () => void
}

/** Estado de fin de bloque en Hoy: explica por que ya no hay fases y ofrece
 *  empezar otro bloque conservando las metas. */
export default function BlockEndCard({ first, last, weeks = 12, onStartNew }: Props) {
  return (
    <div className="card accent" data-testid="block-end">
      <strong>Bloque terminado</strong>
      <p className="muted" style={{ margin: '4px 0 8px' }}>Completaste las {weeks} semanas. Tu historial se conserva.</p>
      <div className="row">
        <div className="grow"><div className="muted">Semana 1</div><strong className="num">{kg(first)}</strong></div>
        <div className="grow"><div className="muted">{`Semana ${weeks}`}</div><strong className="num">{kg(last)}</strong></div>
      </div>
      <button className="primary block" style={{ marginTop: 12 }} onClick={onStartNew}>Empezar nuevo bloque</button>
    </div>
  )
}
