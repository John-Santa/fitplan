import { useState } from 'react'
import type { Session } from '../../../lib/types'
import { monthActivity, monthWeeks, shiftMonth, type MonthActivityKind } from '../lib/month'

const LABEL: Record<MonthActivityKind, string> = { strength: 'fuerza', swim: 'natación', walk: 'caminata' }
const LEGEND: [MonthActivityKind, string][] = [['strength', 'Fuerza'], ['swim', 'Natación'], ['walk', 'Caminata']]
const ROW_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const part = (o: Intl.DateTimeFormatOptions) => date.toLocaleDateString('es', o)
  // "martes 12 de noviembre" (the locale's own format inserts commas).
  return `${part({ weekday: 'long' })} ${d} de ${part({ month: 'long' })}`
}

interface Props {
  sessions: readonly Session[]
  checkIns: readonly string[]
  /** Local date, YYYY-MM-DD. */
  today: string
}

export function MonthCalendar({ sessions, checkIns, today }: Props) {
  const [ty, tm] = today.split('-').map(Number)
  const [cursor, setCursor] = useState({ year: ty, month: tm })
  const { year, month } = cursor
  const isCurrent = year === ty && month === tm
  const activity = monthActivity(sessions, checkIns, year, month)
  const title = new Date(year, month - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' })
  const go = (delta: number) => setCursor(c => shiftMonth(c.year, c.month, delta))

  return (
    <section className="hab-card" aria-label="Calendario">
      <h2 className="hab-title">Calendario</h2>
      <div className="hab-row hab-monthnav">
        <button type="button" className="hab-navbtn" onClick={() => go(-1)}>Mes anterior</button>
        <strong className="hab-monthname">{title}</strong>
        <button type="button" className="hab-navbtn" disabled={isCurrent} onClick={() => go(1)}>Mes siguiente</button>
      </div>
      <div className="hab-month" role="grid" aria-label={title}>
        <div className="hab-monthrow hab-monthhead" role="row" aria-hidden="true">
          {ROW_LABELS.map(l => <span key={l}>{l}</span>)}
        </div>
        {monthWeeks(year, month).map((week, w) => (
          <div className="hab-monthrow" role="row" key={w}>
            {week.map((date, i) => {
              if (!date) return <span key={i} className="hab-day pad" role="gridcell" />
              const kinds = activity[date] ?? []
              const label = `${dayLabel(date)}${kinds.length ? `: ${kinds.map(k => LABEL[k]).join(', ')}` : ''}`
              return (
                <span key={date} className="hab-day" role="gridcell" aria-label={label}>
                  <span className="hab-daynum" aria-hidden="true">{Number(date.slice(8))}</span>
                  <span className="hab-marks" aria-hidden="true">
                    {kinds.map(k => <i key={k} className={`hab-mark ${k}`} />)}
                  </span>
                </span>
              )
            })}
          </div>
        ))}
      </div>
      <ul className="hab-legend">
        {LEGEND.map(([k, text]) => <li key={k}><i className={`hab-mark ${k}`} />{text}</li>)}
      </ul>
    </section>
  )
}
