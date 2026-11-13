import { useState } from 'react'
import { useStore } from '../../../lib/store'
import { todayISO } from '../../../lib/calc'
import { bestStreak, consistency, habitGrid, intentionFor, streak, votes, type DayStatus, type HabitContext } from '../lib/habit'
import { restAllowance, weekSummary } from '../lib/week'
import type { Intention, WeeklyIntentions } from '../../../lib/types'
import './habit.css'

const ROW_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
// Monday..Sunday as Date.getDay() indices.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const STATUS_LABEL: Record<DayStatus, string> = {
  kept: 'cumplido',
  rest: 'comodín de descanso',
  missed: 'faltó',
  pending: 'pendiente hoy',
  future: 'por venir',
  none: 'sin datos',
}

const parse = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const dateLabel = (iso: string) =>
  parse(iso).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export default function Habit() {
  const { sessions, config, plan, saveConfig } = useStore()
  const [openDow, setOpenDow] = useState<number | null>(null)
  const [time, setTime] = useState('')
  const [place, setPlace] = useState('')
  const [saving, setSaving] = useState(false)

  const today = todayISO()
  const ctx: HabitContext = { sessions, config, today, restAllowance: restAllowance(plan) }
  const { days } = streak(ctx)
  const best = Math.max(bestStreak(ctx), days)
  const pct = consistency(ctx, 12)
  const grid = habitGrid(ctx, 12)
  const total = votes(ctx)
  const sessionDates = new Set(sessions.filter(s => s.finishedAt != null).map(s => s.date))

  const { done, target } = weekSummary(plan, sessions, config.habitCheckIns, today)

  const toggle = (dow: number) => {
    if (openDow === dow) { setOpenDow(null); return }
    const cur = config.intentions[dow]
    setTime(cur?.time ?? '')
    setPlace(cur?.place ?? '')
    setOpenDow(dow)
  }

  const save = async (dow: number) => {
    const next = config.intentions.map((it, i) => (i === dow ? { time, place: place.trim() } : it)) as unknown as WeeklyIntentions
    setSaving(true)
    try {
      await saveConfig({ ...config, intentions: next })
      setOpenDow(null)
    } finally {
      setSaving(false)
    }
  }

  const describe = (it: Intention | null) =>
    it ? [it.time, it.place].filter(Boolean).join(' · ') : 'Sin definir'

  const cellClass = (date: string, status: DayStatus) => {
    if (status === 'kept') return sessionDates.has(date) ? 'kept-session' : 'kept-check'
    return status
  }

  return (
    <div className="hab">
      <h1 className="sr-only">Hábito</h1>
      <section className="hab-card hab-hero" aria-label="Racha actual">
        <div className="hab-row">
          <span className="hab-badge warm">No rompas la cadena</span>
          <span className="hab-best">Mejor racha: <strong>{best} {plural(best, 'día', 'días')}</strong></span>
        </div>
        <p className="hab-sub">Racha actual</p>
        <p className="hab-big">
          <span className="hab-num">{days}</span>
          <span className="hab-unit">{plural(days, 'día', 'días')}</span>
        </p>
        <p className="hab-chip">
          <strong>Nunca faltes dos veces:</strong> un día perdido no rompe la racha si retomas al siguiente.
        </p>
      </section>

      <section className="hab-card" aria-label="Últimas 12 semanas">
        <div className="hab-row">
          <h2 className="hab-title">Últimas 12 semanas</h2>
          <span className="hab-badge good">{pct}% consistencia</span>
        </div>
        <p className="hab-sub">Adherencia por bloque diario</p>
        <div className="hab-gridwrap">
          <div className="hab-labels" aria-hidden="true">
            {ROW_LABELS.map(l => <span key={l}>{l}</span>)}
          </div>
          <div className="hab-grid" role="list">
            {grid.map((week, w) => (
              <div className="hab-col" key={w} role="presentation">
                {week.map(c => (
                  <span
                    key={c.date}
                    role="listitem"
                    className={`hab-cell ${cellClass(c.date, c.status)}`}
                    aria-label={`${dateLabel(c.date)}: ${STATUS_LABEL[c.status]}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <ul className="hab-legend">
          <li><i className="hab-cell kept-session" />Entrenado</li>
          <li><i className="hab-cell kept-check" />Hecho</li>
          <li><i className="hab-cell rest" />Comodín de descanso</li>
          <li><i className="hab-cell missed" />Faltó</li>
        </ul>
      </section>

      <section className="hab-card" aria-label="Votos por tu identidad">
        <p className="hab-sub strong">Votos por tu identidad</p>
        <p className="hab-big">
          <span className="hab-num">{total}</span>
          <span className="hab-unit plain">{plural(total, 'entrenamiento completado', 'entrenamientos completados')}</span>
        </p>
        <blockquote className="hab-quote">Cada sesión es un voto por el atleta que estás construyendo.</blockquote>
        <div className="hab-row hab-week">
          <span>Esta semana</span>
          <span className="hab-good">{done} de {target}</span>
        </div>
        <div className="hab-segs" role="img" aria-label={`Esta semana: ${done} de ${target}`}>
          {Array.from({ length: target }, (_, i) => <span key={i} className={i < done ? 'on' : ''} />)}
        </div>
      </section>

      <section className="hab-card" aria-label="Tu plan de acción">
        <h2 className="hab-title">Tu plan de acción</h2>
        <p className="hab-sub">Dónde y cuándo entrenas</p>
        <ul className="hab-plan">
          {WEEK_ORDER.map(dow => {
            const it = intentionFor(config, dow)
            const open = openDow === dow
            return (
              <li key={dow} className={open ? 'open' : ''}>
                <button type="button" className="hab-planrow" aria-expanded={open} onClick={() => toggle(dow)}>
                  <span className="hab-planmain">
                    <strong>{DAY_NAMES[dow]}</strong>
                    <span className={it ? 'hab-when' : 'hab-when empty'}>{describe(it)}</span>
                  </span>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </button>
                {open && (
                  <form className="hab-edit" onSubmit={e => { e.preventDefault(); void save(dow) }}>
                    <label>
                      Hora
                      <input type="time" value={time} onChange={e => setTime(e.target.value)} />
                    </label>
                    <label>
                      Lugar
                      <input type="text" value={place} maxLength={60} placeholder="Gimnasio, casa, parque…" onChange={e => setPlace(e.target.value)} />
                    </label>
                    <button type="submit" className="hab-save" disabled={saving}>Guardar</button>
                  </form>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
