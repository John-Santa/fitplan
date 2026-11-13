// Perfil (S8): the selected discipline's metrics summary. No settings here:
// they live in Ajustes, opened through `onOpenSettings`. The discipline chip
// is mounted by the parent above this screen.
import type { ReactNode } from 'react'
import { fmt, fmtDate, mmss, todayISO } from '../../../lib/calc'
import { useStore } from '../../../lib/store'
import { useDiscipline } from '../../../lib/useDiscipline'
import { Tile } from '../../../components/ui'
import { profileMetrics, type ProfileMetrics, type StrengthMetrics, type SwimMetrics } from '../lib/profileMetrics'
import './profile.css'

export interface ProfileProps {
  /** Opens Ajustes (the gear button). */
  onOpenSettings: () => void
  /** Opens Progreso › Entrenamientos ("Ver todos" on the records). */
  onOpenTraining?: () => void
  /** Opens Progreso › Medidas ("Anotar medición"). */
  onOpenMeasures?: () => void
}

const EMPTY_GYM = 'Todavía no entrenaste. Tu progreso aparece aquí después de tu primera sesión.'
const EMPTY_SWIM = 'Todavía no nadaste. Tu progreso aparece aquí después de tu primera sesión.'

/** Whole metres with a dot every three digits: "1.500 m". */
const metres = (m: number): string => `${String(Math.round(m)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} m`
const days = (n: number): string => `${n} ${n === 1 ? 'día' : 'días'}`
const kg = (w: number): string => fmt(w, Number.isInteger(w) ? 0 : 1)

function Block({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card profile-block">
      <div className="profile-block-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const Muted = ({ children }: { children: ReactNode }) => <p className="muted profile-empty">{children}</p>

function Bars({ values }: { values: { key: string; value: number; current: boolean }[] }) {
  const max = Math.max(...values.map(v => v.value), 1)
  return (
    <div className="profile-bars" aria-hidden="true">
      {values.map(v => (
        <i key={v.key} className={v.current ? 'on' : undefined} style={{ height: `${Math.max(4, (v.value / max) * 100)}%` }} />
      ))}
    </div>
  )
}

function StreakBlock({ metrics, empty }: { metrics: ProfileMetrics; empty: string }) {
  return (
    <Block title="Racha">
      {metrics.hasSessions
        ? <p className="profile-big num">{`${days(metrics.streak.days)} · mejor: ${metrics.streak.best}`}</p>
        : <Muted>{empty}</Muted>}
    </Block>
  )
}

function StrengthBlocks({ m, onOpenTraining, onOpenMeasures }: { m: StrengthMetrics } & Omit<ProfileProps, 'onOpenSettings'>) {
  const delta = m.volume.deltaVsFirst
  return (
    <>
      <StreakBlock metrics={m} empty={EMPTY_GYM} />

      <Block title="Este bloque">
        {m.hasSessions ? (
          <>
            <p className="profile-big num">{m.block.label}</p>
            <p className="num">{`Entrenamientos: ${m.block.done} de ${m.block.target}`}</p>
          </>
        ) : <Muted>{EMPTY_GYM}</Muted>}
      </Block>

      <Block title="Volumen por semana">
        {m.hasSessions && m.volume.weeks.length > 0 ? (
          <>
            <Bars values={m.volume.weeks.map(w => ({ key: String(w.week), value: w.volume, current: w.current }))} />
            {delta != null && <p className="muted num">{`${delta > 0 ? '+' : ''}${delta} % frente a la semana 1`}</p>}
          </>
        ) : <Muted>{EMPTY_GYM}</Muted>}
      </Block>

      <Block
        title="Récords personales"
        action={onOpenTraining && <button className="ghost" onClick={onOpenTraining}>Ver todos</button>}
      >
        {m.records.length > 0 ? (
          <ul className="profile-list">
            {m.records.map(r => (
              <li key={r.exerciseId} className="num">
                {`${r.name}: ${kg(r.weight)} kg${r.reps != null ? ` × ${r.reps}` : ''}`}
              </li>
            ))}
          </ul>
        ) : <Muted>{EMPTY_GYM}</Muted>}
      </Block>

      <Block
        title="Cuerpo frente a tus metas"
        action={onOpenMeasures && <button className="ghost" onClick={onOpenMeasures}>Anotar medición</button>}
      >
        {m.body.hasMeasurement ? (
          <div className="tiles">
            {m.body.items.map(i => (
              <Tile key={i.key} label={i.label} value={i.value} unit={i.unit} delta={i.delta} deltaGood={i.deltaGood}
                {...(i.goal != null ? { goalText: `meta ${fmt(i.goal)} ${i.unit}`, progress: i.progress ?? undefined } : {})} />
            ))}
          </div>
        ) : <Muted>Todavía no anotaste mediciones.</Muted>}
        {!m.body.anyGoalSet && <Muted>Define tus metas en Ajustes</Muted>}
      </Block>
    </>
  )
}

function SwimBlocks({ m }: { m: SwimMetrics }) {
  return (
    <>
      <StreakBlock metrics={m} empty={EMPTY_SWIM} />

      <Block title="Esta semana">
        {m.hasSessions ? (
          <>
            <p className="num">{`Sesiones: ${m.week.done} de ${m.week.target}`}</p>
            <p className="num">{`Distancia: ${metres(m.week.distanceM)}`}</p>
          </>
        ) : <Muted>{EMPTY_SWIM}</Muted>}
      </Block>

      <Block title="Últimas 4 semanas">
        {m.hasSessions ? (
          <>
            <p className="profile-big num">
              {`${metres(m.last4.distanceM)} · ${m.last4.sessions} ${m.last4.sessions === 1 ? 'sesión' : 'sesiones'}`}
            </p>
            <Bars values={m.last4.weeks.map(w => ({ key: w.monday, value: w.distanceM, current: w.current }))} />
          </>
        ) : <Muted>{EMPTY_SWIM}</Muted>}
      </Block>

      <Block title="Mejor ritmo">
        {!m.hasSessions ? <Muted>{EMPTY_SWIM}</Muted> : m.bestPaceSecPer100m != null ? (
          <p className="profile-big num">{`${mmss(Math.round(m.bestPaceSecPer100m))} /100 m`}</p>
        ) : <Muted>Cronometra un bloque para ver tu ritmo.</Muted>}
        {m.hasSessions && (
          <p className="num">
            {`Velocidad media: ${m.last4.avgSpeedMPerMin != null ? `${fmt(m.last4.avgSpeedMPerMin)} m/min` : '—'}`}
          </p>
        )}
      </Block>

      <Block title="Sesión más larga">
        {m.longest ? (
          <p className="profile-big num">{`${metres(m.longest.distanceM)} · ${fmtDate(m.longest.date, true)}`}</p>
        ) : <Muted>{EMPTY_SWIM}</Muted>}
      </Block>

      <Block title="Distancia total">
        {m.hasSessions ? <p className="profile-big num">{metres(m.totalDistanceM)}</p> : <Muted>{EMPTY_SWIM}</Muted>}
      </Block>
    </>
  )
}

/** Presentational Perfil for already computed metrics. */
export function ProfileView({ metrics, onOpenSettings, onOpenTraining, onOpenMeasures }: ProfileProps & { metrics: ProfileMetrics }) {
  return (
    <>
      <div className="profile-head">
        <h1>{metrics.kind === 'strength' ? 'Tu progreso en gimnasio' : 'Tu progreso en natación'}</h1>
        <button className="ghost" onClick={onOpenSettings}>
          <span aria-hidden="true">⚙ </span>Ajustes
        </button>
      </div>
      {metrics.kind === 'strength'
        ? <StrengthBlocks m={metrics} onOpenTraining={onOpenTraining} onOpenMeasures={onOpenMeasures} />
        : <SwimBlocks m={metrics} />}
    </>
  )
}

/** Perfil for the selected discipline, from the store. */
export default function Profile(props: ProfileProps) {
  const { sessions, measurements, config, plan } = useStore()
  const { active } = useDiscipline()
  const metrics = profileMetrics(active, sessions, measurements, config, plan, todayISO())
  return <ProfileView metrics={metrics} {...props} />
}
