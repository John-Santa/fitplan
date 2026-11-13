import { useState, type CSSProperties, type ReactNode } from 'react'
import { DONE_TODAY, weekdayLabel } from '../../../lib/plan'
import { planWeekStates, routineShortName, routineSlots, slotExerciseName, weekLabel, routineDisplayName } from '../../../lib/planQueries'
import { blockStatus, blockWeekNumber, phaseForWeek } from '../../../lib/phases'
import BlockEndCard from '../components/BlockEndCard'
import { startNewBlock, weekVolumes } from '../lib/blockEnd'
import { fmtDate, sessionVolume, todayISO } from '../../../lib/calc'
import { finishedIn } from '../../../lib/disciplines'
import { dayStatus, intentionFor, missedYesterday, streak as habitStreak, toggleCheckIn, votes as habitVotes } from '../../habit/lib/habit'
import { nextRoutine, restAllowance, restHint, routinesDoneThisWeek, weekDays, weekRotation, weekSummary } from '../../habit/lib/week'
import { useDerivedMeasurements, useStore } from '../../../lib/store'
import BottomSheet from '../../../components/BottomSheet'
import { isBackCarePlan } from '../../../lib/defaultPlan'
import HoyBackupNotice from '../components/BackupNotice'
import './home.css'

type Tab = 'plan' | 'progreso' | 'perfil'

const DAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] // Monday..Sunday, same order as weekDays()
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
  flame: <path d="M12 22a7 7 0 0 0 7-7c0-3-2-5-3-7-1 1-2 2-3 2 0-3-1-6-4-8 0 4-4 6-4 12a7 7 0 0 0 7 8z" />,
  badge: (<><path d="M12 2l2.4 2 3.1-.3 1 3 2.8 1.5-.9 3 .9 3-2.8 1.5-1 3-3.1-.3L12 22l-2.4-2-3.1.3-1-3L2.7 15.8l.9-3-.9-3 2.8-1.5 1-3 3.1.3z" /><path d="m9 12 2 2 4-4" /></>),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  alarm: (<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M5 3 2 6M19 3l3 3" /></>),
  pin: (<><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>),
  sliders: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
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

/** 4320 -> "4.320". */
const fmtThousands = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export default function Home({ go, startRoutine }: { go: (tab: Tab) => void; startRoutine: (routineId: string, opts?: { minimal?: boolean; date?: string }) => void }) {
  const { sessions, config, plan, saveConfig } = useStore()
  const rows = useDerivedMeasurements()
  const now = new Date()
  const iso = todayISO(now)
  const week = blockWeekNumber(now, config.blockStart)
  const phase = phaseForWeek(plan, week)
  const blockEnded = blockStatus(now, config.blockStart, config.blockEnd).state === 'ended'
  const dow = now.getDay()
  const allowance = restAllowance(plan)
  const habitCtx = { sessions, config, today: iso, restAllowance: allowance }
  const streakInfo = habitStreak(habitCtx)
  const voteCount = habitVotes(habitCtx)
  const todayKept = dayStatus(iso, habitCtx) === 'kept'
  const showMissedBanner = missedYesterday(habitCtx) && !todayKept

  // Flexible week: no routine is tied to a weekday. The hero suggests the next
  // routine not yet done this week, and any active routine can be picked instead.
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Day being logged from the week strip (today or a past date).
  const [logDate, setLogDate] = useState<string | null>(null)
  const rotation = weekRotation(plan)
  const doneIds = routinesDoneThisWeek(sessions, iso)
  const suggestion = nextRoutine(plan, sessions, iso)
  const picked = pickedId != null ? rotation.find(r => r.id === pickedId) ?? null : null
  const selected = picked ?? suggestion
  const summary = weekSummary(plan, sessions, config.habitCheckIns, iso)
  const restLeft = summary.restAllowance - summary.restUsed

  const intention = intentionFor(config, dow)
  const intentionText = intention
    ? `Hoy${intention.time !== '' ? ` a las ${intention.time}` : ''}${intention.place !== '' ? ` en ${intention.place}` : ''}`
    : null
  const intentionRow = intentionText != null ? (
    <div className="hoy-intention">
      <Icon name={intention!.time !== '' ? 'alarm' : 'pin'} size={18} />
      <span className="hoy-intention-text">{intentionText}</span>
      <button type="button" className="hoy-intention-edit" onClick={() => go('progreso')}>Editar</button>
    </div>
  ) : (
    <button type="button" className="hoy-intention-set" onClick={() => go('progreso')}>
      <Icon name="alarm" size={16} />
      Define cuándo y dónde entrenas
    </button>
  )

  const finishedToday = sessions.some(s => s.finishedAt != null && s.date === iso)
  const strengthDoneToday = sessions.some(s => s.kind === 'strength' && s.finishedAt != null && s.date === iso)
  const checkedToday = config.habitCheckIns.includes(iso)
  const hint = restHint({
    restLeft,
    activeToday: finishedToday || checkedToday,
    blockEnded,
    routineName: suggestion != null ? routineDisplayName(suggestion.name) : null,
  })

  // Calendar week (Monday..Sunday): volume stats and the day cells.
  const days = weekDays(iso)
  const weekVolume = finishedIn(sessions, 'strength', days[0], days[6]).reduce((a, s) => a + sessionVolume(s), 0)
  // Volume bars: this week and the 4 previous ones (the last one highlighted).
  const volumes = [4, 3, 2, 1, 0].map(back => {
    const d = weekDays(todayISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back * 7)))
    return finishedIn(sessions, 'strength', d[0], d[6]).reduce((a, s) => a + sessionVolume(s), 0)
  })
  const maxVol = Math.max(...volumes, 1)

  const slots = selected ? routineSlots(selected, week).filter(s => s.target.kind !== 'note') : []
  const names = slots.map(s => slotExerciseName(plan, s))
  const chips = names.slice(0, MAX_CHIPS)
  const extra = names.length - chips.length

  // "Ya entrenaste hoy" calms the hero until the user explicitly picks another routine.
  const showHero = selected != null && (picked != null || !strengthDoneToday)
  const planActive = week <= plan.weeks

  const choose = (id: string) => {
    setPickedId(id)
    setPickerOpen(false)
  }

  const picker = rotation.length > 0 && (
    <div className="hoy-picker">
      <button
        type="button"
        className="hoy-link hoy-picker-toggle"
        aria-expanded={pickerOpen}
        onClick={() => setPickerOpen(o => !o)}
      >
        {showHero ? 'Elegir otra rutina' : 'Entrenar otra'}
      </button>
      {pickerOpen && (
        <div className="hoy-picker-list" role="group" aria-label="Elegir rutina">
          {rotation.map(r => {
            const done = doneIds.has(r.id)
            const on = showHero && selected?.id === r.id
            return (
              <button
                key={r.id}
                type="button"
                className={`hoy-pick${on ? ' on' : ''}${done ? ' done' : ''}`}
                aria-pressed={on}
                onClick={() => choose(r.id)}
              >
                {done && <Icon name="check" size={14} />}
                {routineDisplayName(r.name)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

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

  // The lower-back tip belongs to the "espalda protegida" template.
  const tip = isBackCarePlan(plan)
    ? { kicker: 'Cuidado lumbar', text: 'Columna neutra: piensa en sacar un poco la cola' }
    : { kicker: 'Técnica', text: 'Termina cada serie con 2 o 3 repeticiones en reserva' }

  const restLine =
    summary.restAllowance === 0
      ? 'Esta semana no hay comodines de descanso'
      : `Comodines de descanso: ${restLeft} de ${summary.restAllowance} ${restLeft === 1 ? 'disponible' : 'disponibles'}`

  return (
    <div className="hoy">
      <header className="hoy-header">
        <div className="hoy-header-text">
          <span className="hoy-date">{weekdayLabel(dow)} {fmtDate(iso)}</span>
          <span className="hoy-brand">MagniFit</span>
        </div>
        <button type="button" className="hoy-avatar" aria-label="Perfil" onClick={() => go('perfil')}>
          <Icon name="person" size={22} />
        </button>
      </header>

      <main className="hoy-main">
        {blockEnded && (
          <BlockEndCard
            {...weekVolumes(sessions, config.blockStart, plan.weeks)}
            weeks={plan.weeks}
            onStartNew={() => void saveConfig(startNewBlock(config, new Date(), plan.weeks))}
          />
        )}
        <section className="hoy-identity" aria-label="Tu racha">
          <div className="hoy-identity-item">
            <span className="hoy-identity-icon flame"><Icon name="flame" size={22} /></span>
            <div className="hoy-identity-text">
              <strong className="hoy-num">
                {streakInfo.days > 0 ? `${streakInfo.days} ${streakInfo.days === 1 ? 'día' : 'días'}` : 'Empieza tu racha'}
              </strong>
              <span>{streakInfo.days > 0 ? 'Racha activa' : 'Hoy es un buen día'}</span>
            </div>
          </div>
          <div className="hoy-identity-sep" aria-hidden="true" />
          <div className="hoy-identity-item">
            <span className="hoy-identity-icon vote"><Icon name="badge" size={20} /></span>
            <div className="hoy-identity-text">
              <strong className="hoy-num">{voteCount} {voteCount === 1 ? 'entrenamiento' : 'entrenamientos'}</strong>
              <span>Un voto más por tu atleta</span>
            </div>
          </div>
        </section>

        {showMissedBanner && (
          <section className="hoy-banner" role="status">
            <span className="hoy-banner-icon"><Icon name="bolt" size={20} /></span>
            <div>
              <strong>Ayer no se pudo. Hoy no falles dos veces.</strong>
              <p>Una sesión corta también cuenta.</p>
            </div>
          </section>
        )}

        {showHero && selected ? (
          <section className="hoy-hero">
            <div className="hoy-hero-glow" aria-hidden="true" />
            {progress}
            <h1 className="hoy-title">{routineDisplayName(selected.name)}</h1>
            <div className="hoy-meta">
              <span className="hoy-pill">
                <Icon name="dumbbell" size={15} />
                {slots.length} ejercicios
              </span>
              {selected.duration !== '' && (
                <span className="hoy-pill hoy-num">
                  <Icon name="timer" size={15} />
                  ≈ {selected.duration}
                </span>
              )}
              {phase && (
                <span className="hoy-pill accent hoy-num">
                  <Icon name="gauge" size={15} />
                  {phase.intensity}
                </span>
              )}
            </div>
            {intentionRow}
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
            <button type="button" className="hoy-cta" onClick={() => startRoutine(selected.id)}>
              <Icon name="play" size={22} />
              Empezar entrenamiento
            </button>
            <button type="button" className="hoy-minimal" onClick={() => startRoutine(selected.id, { minimal: true })}>
              <span>
                <strong>Día difícil: versión mínima</strong>
                <small>Calentamiento + primer ejercicio</small>
              </span>
              <Icon name="sliders" size={20} />
            </button>
            {hint != null && <p className="hoy-rest-line">{hint}</p>}
            {picker}
          </section>
        ) : (
          <section className="hoy-hero">
            <div className="hoy-hero-glow" aria-hidden="true" />
            {progress}
            {strengthDoneToday ? (
              <>
                <div className="hoy-calm-icon"><Icon name="check" size={20} /></div>
                <h1 className="hoy-title">{DONE_TODAY.strength.title}</h1>
                <p className="hoy-note">{DONE_TODAY.strength.note}</p>
              </>
            ) : (
              <>
                <div className="hoy-calm-icon"><Icon name="check" size={20} /></div>
                <h1 className="hoy-title">Semana completa</h1>
                <p className="hoy-note">Hiciste todas tus rutinas. Descansa o suma una extra.</p>
              </>
            )}
            {picker}
            <button type="button" className="hoy-cta secondary" onClick={() => go('plan')}>
              Ver plan
            </button>
          </section>
        )}

        {!finishedToday && (
          <button
            type="button"
            className={`hoy-cta secondary hoy-checkin${checkedToday ? ' on' : ''}`}
            aria-pressed={checkedToday}
            onClick={() => void saveConfig(toggleCheckIn(config, iso))}
          >
            <Icon name="walk" size={20} />
            {checkedToday ? 'Caminata hecha ✓ · Deshacer' : 'Marcar caminata hecha'}
          </button>
        )}

        <section className="hoy-section" aria-label="Esta semana">
          <div className="hoy-section-head">
            <h2 className="hoy-h2">
              Esta semana · {summary.done} de {summary.target} {summary.target === 1 ? 'entrenamiento' : 'entrenamientos'}
            </h2>
          </div>
          <p className="hoy-rest-line">{restLine}</p>
          <button type="button" className="hoy-link hoy-logdate" onClick={() => setLogDate(iso)}>Registrar otra fecha</button>
          <div className="hoy-week">
            {days.map((date, i) => {
              const isToday = date === iso
              const status = dayStatus(date, habitCtx)
              const doneSession = sessions.find(s => s.kind === 'strength' && s.finishedAt != null && s.date === date)
              const doneRoutine = doneSession && doneSession.kind === 'strength' ? plan.routines.find(r => r.id === doneSession.routineId) : undefined
              const kept = status === 'kept'
              const cls = ['hoy-day']
              if (isToday) cls.push('today')
              if (kept) cls.push('done')
              if (status === 'rest') cls.push('rest')
              if (status === 'missed') cls.push('missed')

              let body: ReactNode = null
              let label = ''
              if (kept) {
                const name = doneRoutine ? routineShortName(doneRoutine) : null
                label = name ?? 'Hecho'
                body = (
                  <>
                    <span className="hoy-day-check"><Icon name="check" size={16} /></span>
                    {name != null ? <span className="hoy-day-name">{name}</span> : <span className="hoy-day-sub">Hecho</span>}
                  </>
                )
              } else if (status === 'rest') {
                label = 'Descanso'
                body = (
                  <>
                    <Icon name="moon" size={17} className="hoy-day-main-icon" />
                    <span className="hoy-day-sub">Descanso</span>
                  </>
                )
              } else if (status === 'missed') {
                label = 'Faltó'
                body = (
                  <>
                    <span className="hoy-day-miss"><i /></span>
                    <span className="hoy-day-sub">Faltó</span>
                  </>
                )
              } else if (isToday) {
                label = 'Hoy'
                body = (
                  <>
                    <span className="hoy-day-dot hoy-num">{Number(date.slice(8))}</span>
                    <span className="hoy-day-sub">Hoy</span>
                  </>
                )
              }

              const aria = `${weekdayLabel((i + 1) % 7)} ${fmtDate(date)}${label !== '' ? `: ${label}` : ''}`
              // Today and past days can be logged with any routine.
              return date <= iso ? (
                <button type="button" key={date} className={`${cls.join(' ')} tap`} aria-label={`${aria}. Registrar una rutina`} onClick={() => setLogDate(date)}>
                  <span className="hoy-day-letter">{DAY_LETTERS[i]}</span>
                  {body}
                </button>
              ) : (
                <div key={date} className={cls.join(' ')} aria-label={aria}>
                  <span className="hoy-day-letter">{DAY_LETTERS[i]}</span>
                  {body}
                </div>
              )
            })}
          </div>
        </section>

        {rotation.length > 0 && (
          <section className="hoy-section" aria-label="Rutinas de la semana">
            <div className="hoy-section-head">
              <h2 className="hoy-h2">Rutinas de la semana</h2>
            </div>
            <ul className="hoy-checklist">
              {rotation.map(r => {
                const done = doneIds.has(r.id)
                const inner = (
                  <>
                    <span className={`hoy-check${done ? ' on' : ''}`} aria-hidden="true">
                      {done && <Icon name="check" size={14} />}
                    </span>
                    <span className="hoy-checklist-name">{routineDisplayName(r.name)}</span>
                    <span className="hoy-checklist-state">{done ? 'Hecha' : 'Pendiente'}</span>
                  </>
                )
                return (
                  <li key={r.id}>
                    {done ? (
                      <div className="hoy-checklist-row done">{inner}</div>
                    ) : (
                      <button
                        type="button"
                        className={`hoy-checklist-row${selected?.id === r.id && showHero ? ' on' : ''}`}
                        onClick={() => {
                          choose(r.id)
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                      >
                        {inner}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section className="hoy-stats" aria-label="Resumen semanal">
          <div className="hoy-stat">
            <div className="hoy-stat-head">
              <span className="hoy-stat-label">Sesiones</span>
              <Icon name="calendar" size={18} />
            </div>
            <div className="hoy-stat-value">
              <span className="hoy-stat-big hoy-num">{summary.done}</span>
              <span className="hoy-stat-unit hoy-num">/ {summary.target}</span>
            </div>
            <div className="hoy-bar" aria-hidden="true">
              <i style={{ width: `${summary.target > 0 ? Math.min(100, (summary.done / summary.target) * 100) : 0}%` }} />
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
              <span className="hoy-tip-kicker">{tip.kicker}</span>
              <p className="hoy-tip-text">{tip.text}</p>
            </div>
          </div>
          <button type="button" className="hoy-link" onClick={() => go('plan')}>
            Ver guía
            <Icon name="chevron" size={16} />
          </button>
        </section>

        <HoyBackupNotice />

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

      {logDate && (() => {
        const onDate = sessions.filter(s => s.kind === 'strength' && s.finishedAt != null && s.date === logDate)
        const dow = new Date(Number(logDate.slice(0, 4)), Number(logDate.slice(5, 7)) - 1, Number(logDate.slice(8))).getDay()
        return (
          <BottomSheet title={logDate === iso ? 'Entrenar hoy' : `Registrar ${weekdayLabel(dow).toLowerCase()} ${fmtDate(logDate)}`} onClose={() => setLogDate(null)}>
            <label className="hoy-log-field">
              <span>Fecha</span>
              <input type="date" value={logDate} max={iso} onChange={e => { if (e.target.value !== '' && e.target.value <= iso) setLogDate(e.target.value) }} />
            </label>
            {onDate.length > 0 && (
              <p className="hoy-log-note">
                Ya registraste: {onDate.map(s => (s.kind === 'strength' ? routineDisplayName(plan.routines.find(r => r.id === s.routineId)?.name ?? 'Rutina') : '')).join(', ')}
              </p>
            )}
            <p className="hoy-log-note">Elige la rutina que hiciste o vas a hacer ese día.</p>
            <ul className="hoy-checklist">
              {rotation.map(r => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="hoy-checklist-row"
                    onClick={() => {
                      const date = logDate
                      setLogDate(null)
                      startRoutine(r.id, date === iso ? undefined : { date })
                    }}
                  >
                    <span className={`hoy-check${doneIds.has(r.id) ? ' on' : ''}`} aria-hidden="true">
                      {doneIds.has(r.id) && <Icon name="check" size={14} />}
                    </span>
                    <span className="hoy-checklist-name">{routineDisplayName(r.name)}</span>
                    <span className="hoy-checklist-state">{doneIds.has(r.id) ? 'Hecha esta semana' : 'Pendiente'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </BottomSheet>
        )
      })()}
    </div>
  )
}
