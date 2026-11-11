import type { CSSProperties, ReactNode } from 'react'
import { DONE_TODAY, SESSION_KIND_FOR_DAY, weekdayLabel } from '../lib/plan'
import {
  dayTitleFor,
  planWeekStates,
  routineForWeekday,
  routineShortName,
  routineSlots,
  slotExerciseName,
  weekLabel,
} from '../lib/planQueries'
import { blockWeekNumber, phaseForWeek } from '../lib/phases'
import { fmtDate, sessionVolume, todayISO } from '../lib/calc'
import { finishedIn } from '../lib/disciplines'
import { useDerivedMeasurements, useStore } from '../lib/store'
import './home.css'

type Tab = 'plan' | 'progreso' | 'perfil'

const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] // indice = Date.getDay()
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] // lunes a domingo
const MAX_CHIPS = 4

/* ---------- iconos (trazo de 2px, decorativos) ---------- */

const ICONS: Record<string, ReactNode> = {
  person: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  dumbbell: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  timer: (<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></>),
  gauge: <path d="M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0" />,
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" />,
  check: <path d="M20 6 9 17l-5-5" />,
  walk: (<><circle cx="13" cy="4.5" r="1.5" /><path d="M9 21l2-6-2-3 3-3 3 3h3M11 15l3 2v4" /></>),
  swim: <path d="M2 17c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 12c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" />,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  calendar: (<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" /></>),
  trend: <path d="M22 7l-8.5 8.5-5-5L2 17M16 7h6v6" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  chevron: <path d="m9 18 6-6-6-6" />,
}

function Icon({ name, size = 20, className }: { name: keyof typeof ICONS; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {ICONS[name]}
    </svg>
  )
}

/* ---------- utilidades ---------- */

/** Rango ISO [lunes, domingo] de la semana calendario que contiene `now`,
 *  desplazado `weeksBack` semanas hacia atras. */
function weekRange(now: Date, weeksBack: number): { start: string; end: string; days: string[] } {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - weeksBack * 7)
  const days = Array.from({ length: 7 }, (_, i) =>
    todayISO(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)),
  )
  return { start: days[0], end: days[6], days }
}

/** 4320 -> "4.320". */
const fmtThousands = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const dayNumber = (name: string): string | null => /^D[ií]a\s+(\d+)/i.exec(name)?.[1] ?? null

export default function Home({ go, startRoutine }: { go: (tab: Tab) => void; startRoutine: (routineId: string) => void }) {
  const { sessions, config, plan } = useStore()
  const rows = useDerivedMeasurements()
  const now = new Date()
  const iso = todayISO(now)
  const week = blockWeekNumber(now, config.blockStart)
  const phase = phaseForWeek(plan, week)
  const dow = now.getDay()
  const today = config.weeklyRoutine[dow]
  const suggested = routineForWeekday(plan, config.weeklyRoutine, dow)
  // "Ya entrenaste hoy" = ya hice la disciplina de HOY (un dia sin disciplina
  // asignada nunca cuenta como hecho).
  const todayKind = SESSION_KIND_FOR_DAY[today.kind]
  const doneKind =
    todayKind != null && sessions.some(s => s.kind === todayKind && s.date === iso && s.finishedAt) ? todayKind : null

  // Semana calendario (lunes a domingo): checks de la tira y tarjetas.
  const range = weekRange(now, 0)
  const finishedThisWeek = sessions.filter(s => s.finishedAt != null && s.date >= range.start && s.date <= range.end)
  const plannedDays = config.weeklyRoutine.filter(d => SESSION_KIND_FOR_DAY[d.kind] != null).length
  const doneCount = finishedThisWeek.length
  const weekVolume = finishedIn(sessions, 'strength', range.start, range.end).reduce((a, s) => a + sessionVolume(s), 0)
  // Barritas del volumen: esta semana y las 4 anteriores (la ultima resaltada).
  const volumes = [4, 3, 2, 1, 0].map(back => {
    const r = weekRange(now, back)
    return finishedIn(sessions, 'strength', r.start, r.end).reduce((a, s) => a + sessionVolume(s), 0)
  })
  const maxVol = Math.max(...volumes, 1)

  // Proximo dia con disciplina (para el estado calmo).
  let next: { label: string; title: string } | null = null
  for (let k = 1; k <= 7 && !next; k++) {
    const d = (dow + k) % 7
    const day = config.weeklyRoutine[d]
    if (SESSION_KIND_FOR_DAY[day.kind] == null) continue
    const r = routineForWeekday(plan, config.weeklyRoutine, d)
    next = { label: weekdayLabel(d), title: r ? routineShortName(r) : dayTitleFor(plan, day) }
  }

  const slots = suggested ? routineSlots(suggested, week).filter(s => s.target.kind !== 'note') : []
  const names = slots.map(s => slotExerciseName(plan, s))
  const chips = names.slice(0, MAX_CHIPS)
  const extra = names.length - chips.length

  const showHero = suggested != null && doneKind == null
  const planActive = week <= plan.weeks

  const progress = (
    <div className="hoy-progress">
      <div className="hoy-progress-row">
        <span>
          {weekLabel(plan.weeks, week)}
          {phase && ` · ${phase.goal}`}
        </span>
        {planActive && <span className="hoy-progress-now hoy-num">Semana {week}</span>}
      </div>
      <div className="hoy-seg" style={{ '--weeks': plan.weeks } as CSSProperties} aria-hidden="true">
        {planWeekStates(plan.weeks, week).map(w => (
          <i key={w.week} className={w.state} />
        ))}
      </div>
    </div>
  )

  return (
    <div className="hoy">
      <header className="hoy-header">
        <div className="hoy-header-text">
          <span className="hoy-date">{weekdayLabel(dow)} {fmtDate(iso)}</span>
          <span className="hoy-brand">FitPlan</span>
        </div>
        <button type="button" className="hoy-avatar" aria-label="Perfil" onClick={() => go('perfil')}>
          <Icon name="person" size={22} />
        </button>
      </header>

      <main className="hoy-main">
        {showHero && suggested ? (
          <section className="hoy-hero">
            <div className="hoy-hero-glow" aria-hidden="true" />
            {progress}
            <h1 className="hoy-title">{suggested.name.replace(/\s[–—-]\s/, ' · ')}</h1>
            <div className="hoy-meta">
              <span className="hoy-pill">
                <Icon name="dumbbell" size={15} />
                {slots.length} ejercicios
              </span>
              {suggested.duration !== '' && (
                <span className="hoy-pill hoy-num">
                  <Icon name="timer" size={15} />
                  ≈ {suggested.duration}
                </span>
              )}
              {phase && (
                <span className="hoy-pill accent hoy-num">
                  <Icon name="gauge" size={15} />
                  {phase.intensity}
                </span>
              )}
            </div>
            {chips.length > 0 && (
              <div className="hoy-chips-block">
                <p className="hoy-eyebrow">Ejercicios principales</p>
                <div className="hoy-chips">
                  {chips.map((n, i) => (
                    <span key={i} className="hoy-chip">{n}</span>
                  ))}
                  {extra > 0 && <span className="hoy-chip more hoy-num">+{extra}</span>}
                </div>
              </div>
            )}
            <button type="button" className="hoy-cta" onClick={() => startRoutine(suggested.id)}>
              <Icon name="play" size={22} />
              Empezar entrenamiento
            </button>
          </section>
        ) : (
          <section className="hoy-hero">
            <div className="hoy-hero-glow" aria-hidden="true" />
            {progress}
            {doneKind ? (
              <>
                <div className="hoy-calm-icon"><Icon name="check" size={20} /></div>
                <h1 className="hoy-title">{DONE_TODAY[doneKind].title}</h1>
                <p className="hoy-note">{DONE_TODAY[doneKind].note}</p>
              </>
            ) : (
              <>
                <div className="hoy-calm-icon rest">
                  <Icon name={today.kind === 'swim' ? 'swim' : today.kind === 'walk' ? 'walk' : 'moon'} size={20} />
                </div>
                <h1 className="hoy-title">{dayTitleFor(plan, today)}</h1>
                {today.note !== '' && <p className="hoy-note">{today.note}</p>}
              </>
            )}
            {next && (
              <div className="hoy-next">
                <Icon name="calendar" size={18} />
                <span>
                  Siguiente: <strong>{next.label}</strong> · {next.title}
                </span>
              </div>
            )}
            <button type="button" className="hoy-cta secondary" onClick={() => go('plan')}>
              Ver plan
            </button>
          </section>
        )}

        <section className="hoy-section" aria-label="Esta semana">
          <div className="hoy-section-head">
            <h2 className="hoy-h2">Esta semana</h2>
            <span className="hoy-section-aside hoy-num">{plannedDays} días planificados</span>
          </div>
          <div className="hoy-week">
            {WEEK_ORDER.map((d, i) => {
              const day = config.weeklyRoutine[d]
              const kind = SESSION_KIND_FOR_DAY[day.kind]
              const date = range.days[i]
              const isToday = d === dow
              const isDone = kind != null && finishedThisWeek.some(s => s.kind === kind && s.date === date)
              const routine = routineForWeekday(plan, config.weeklyRoutine, d)
              const cls = ['hoy-day']
              if (isToday) cls.push('today')
              if (isDone) cls.push('done')
              if (kind == null) cls.push('rest')

              let body: ReactNode
              if (isToday) {
                body = (
                  <>
                    <span className="hoy-day-dot hoy-num">
                      {isDone ? <Icon name="check" size={16} /> : Number(date.slice(8))}
                    </span>
                    <span className="hoy-day-sub">{isDone ? 'Listo' : 'Hoy'}</span>
                  </>
                )
              } else if (isDone) {
                body = (
                  <>
                    <span className="hoy-day-check"><Icon name="check" size={16} /></span>
                    <span className="hoy-day-sub">Listo</span>
                  </>
                )
              } else if (kind == null) {
                body = (
                  <>
                    <Icon name={day.kind === 'walk' ? 'walk' : 'moon'} size={17} className="hoy-day-main-icon" />
                    <span className="hoy-day-sub">{day.kind === 'walk' ? 'Caminar' : 'Descanso'}</span>
                  </>
                )
              } else if (routine) {
                const n = dayNumber(routine.name)
                body = (
                  <>
                    <span className="hoy-day-main hoy-num">{n ? `Día ${n}` : routineShortName(routine)}</span>
                    <span className="hoy-day-sub">{n ? routineShortName(routine) : ''}</span>
                  </>
                )
              } else {
                body = (
                  <>
                    <Icon name="swim" size={17} />
                    <span className="hoy-day-sub">Natación</span>
                  </>
                )
              }

              return (
                <div key={d} className={cls.join(' ')}>
                  <span className="hoy-day-letter">{DAY_LETTERS[d]}</span>
                  {body}
                </div>
              )
            })}
          </div>
        </section>

        <section className="hoy-stats" aria-label="Resumen semanal">
          <div className="hoy-stat">
            <div className="hoy-stat-head">
              <span className="hoy-stat-label">Sesiones</span>
              <Icon name="calendar" size={18} />
            </div>
            <div className="hoy-stat-value">
              <span className="hoy-stat-big hoy-num">{doneCount}</span>
              <span className="hoy-stat-unit hoy-num">/ {plannedDays}</span>
            </div>
            <div className="hoy-bar" aria-hidden="true">
              <i style={{ width: `${plannedDays > 0 ? Math.min(100, (doneCount / plannedDays) * 100) : 0}%` }} />
            </div>
          </div>
          <div className="hoy-stat">
            <div className="hoy-stat-head">
              <span className="hoy-stat-label">Volumen</span>
              <Icon name="trend" size={18} className="up" />
            </div>
            <div className="hoy-stat-value">
              <span className="hoy-stat-mid hoy-num">{fmtThousands(weekVolume)}</span>
              <span className="hoy-stat-unit sm">kg</span>
            </div>
            <div className="hoy-spark" aria-hidden="true">
              {volumes.map((v, i) => (
                <i key={i} className={i === volumes.length - 1 ? 'on' : ''} style={{ height: `${Math.max(20, (v / maxVol) * 100)}%` }} />
              ))}
            </div>
          </div>
        </section>

        <section className="hoy-tip">
          <div className="hoy-tip-body">
            <div className="hoy-tip-icon"><Icon name="shield" size={20} /></div>
            <div>
              <span className="hoy-tip-kicker">Cuidado lumbar</span>
              <p className="hoy-tip-text">Columna neutra: piensa en sacar un poco la cola</p>
            </div>
          </div>
          <button type="button" className="hoy-link" onClick={() => go('plan')}>
            Ver guía
            <Icon name="chevron" size={16} />
          </button>
        </section>

        {rows.length <= 1 && (
          <section className="hoy-nudge">
            <p>
              <strong>Falta tu primera medición del bloque</strong>
              Sin ella no sabrás si el peso que pierdes sale de grasa o de músculo.
            </p>
            <button type="button" className="hoy-link" onClick={() => go('progreso')}>
              Ir a progreso
              <Icon name="chevron" size={16} />
            </button>
          </section>
        )}
      </main>
    </div>
  )
}
