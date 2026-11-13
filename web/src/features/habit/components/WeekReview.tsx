import { useState } from 'react'
import type { Config, Session, TrainingPlan } from '../../../lib/types'
import { blockReview, closedWeekSummaryFor, deltaPct, weekDays, weekTitle } from '../lib/week'
import { useDiscipline } from '../../../lib/useDiscipline'

const kg = (n: number): string => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} kg`
const meters = (n: number): string => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} m`
const pct = (n: number): string => `${n > 0 ? '+' : ''}${n} %`

const parse = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (iso: string, days: number): string => {
  const d = parse(iso)
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

interface Props {
  plan: Pick<TrainingPlan, 'routines' | 'weeks' | 'phases'>
  sessions: readonly Session[]
  config: Pick<Config, 'blockStart' | 'blockEnd' | 'habitCheckIns' | 'swimWeeklyTarget'>
  today: string
}

/** Review of a closed calendar week, stepping back to earlier ones. No stored
 *  state: the week shown is derived from `today` and a local offset. */
export default function WeekReview({ plan, sessions, config, today }: Props) {
  const { active } = useDiscipline()
  const [back, setBack] = useState(0)
  const lastMonday = addDays(weekDays(today)[0], -7)
  const monday = addDays(lastMonday, -7 * back)

  const firstActivity = [...sessions.filter(s => s.finishedAt != null).map(s => s.date), ...config.habitCheckIns].sort()[0]
  // The week can be reviewed from the first week with any activity onwards.
  const hasWeeks = firstActivity != null && weekDays(firstActivity)[0] <= lastMonday
  const canGoBack = hasWeeks && weekDays(firstActivity)[0] < monday

  if (!hasWeeks) {
    return (
      <section className="hab-card" aria-label="Semana cerrada">
        <h2 className="hab-title">Semana anterior</h2>
        <p className="hab-sub">Aún no hay semanas cerradas para repasar.</p>
      </section>
    )
  }

  const r = closedWeekSummaryFor(active, plan, sessions, config.habitCheckIns, monday, config.swimWeeklyTarget)
  const nav = (
    <span className="hab-nav">
      <button type="button" className="hab-link" disabled={!canGoBack} onClick={() => setBack(back + 1)}>Semana anterior</button>
      <button type="button" className="hab-link" disabled={back === 0} onClick={() => setBack(back - 1)}>Semana siguiente</button>
    </span>
  )

  if (r.kind === 'swim') {
    const swimChange = deltaPct(r.distance, r.prevDistance)
    return (
      <section className="hab-card hab-review" aria-label="Semana cerrada">
        <div className="hab-row">
          <h2 className="hab-title">{weekTitle(monday)}</h2>
          {nav}
        </div>
        <ul className="hab-review-list">
          <li>{`Sesiones: ${r.done} de ${r.target}`}</li>
          <li>
            {`Distancia: ${meters(r.distance)}`}
            {swimChange != null && <span className="hab-sub">{` · ${pct(swimChange)} frente a la semana anterior`}</span>}
          </li>
        </ul>
      </section>
    )
  }

  const block = blockReview(plan, config, sessions, monday)
  const change = deltaPct(r.volume, r.prevVolume)
  const vsFirst = block != null && block.week > 1 ? deltaPct(r.volume, block.firstVolume) : null

  return (
    <section className="hab-card hab-review" aria-label="Semana cerrada">
      <div className="hab-row">
        <h2 className="hab-title">{weekTitle(monday)}</h2>
        {nav}
      </div>
      <ul className="hab-review-list">
        <li>{`Entrenamientos: ${r.done} de ${r.target}`}</li>
        <li>
          {`Volumen: ${kg(r.volume)}`}
          {change != null && <span className="hab-sub">{` · ${pct(change)} frente a la semana anterior`}</span>}
        </li>
        <li>{`Caminatas: ${r.walks}`}</li>
        {block && (
          <li>
            {`Bloque: ${block.text}`}
            {vsFirst != null && <span className="hab-sub">{` · ${pct(vsFirst)} de volumen frente a la semana 1`}</span>}
          </li>
        )}
      </ul>
    </section>
  )
}
