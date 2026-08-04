import { blockPhase, routineForWeekday, ROUTINES } from '../lib/plan'
import { doneSets, fmt, fmtDate, progressPct, sessionVolume, todayISO, weeklyCount } from '../lib/calc'
import { useDerivedMeasurements, useStore } from '../lib/store'
import { Tile } from '../components/ui'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export default function Home({ go }: { go: (tab: 'train' | 'measure') => void }) {
  const { sessions, config } = useStore()
  const rows = useDerivedMeasurements()
  const now = new Date()
  const phase = blockPhase(now, config.blockStart)
  const dow = now.getDay()
  const suggested = routineForWeekday(dow)
  const isSwim = dow === 2 || dow === 4
  const doneToday = sessions.some(s => s.date === todayISO() && s.finishedAt)

  const base = rows[0]
  const last = rows[rows.length - 1]
  const finished = sessions.filter(s => s.finishedAt)
  const weeks = weeklyCount(finished, 4)
  const thisWeek = weeks[weeks.length - 1]?.count ?? 0

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(config.blockEnd + 'T00:00:00').getTime() - now.getTime()) / 86400000),
  )

  return (
    <>
      <div className="card accent">
        <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
          Hoy es {DIAS[dow]}
        </div>
        {doneToday ? (
          <>
            <h2 style={{ fontSize: 19, marginTop: 2 }}>Sesión hecha</h2>
            <p style={{ marginBottom: 0 }}>Ya entrenaste hoy. Lo que queda es dormir 7 horas y media.</p>
          </>
        ) : suggested ? (
          <>
            <h2 style={{ fontSize: 19, marginTop: 2 }}>{suggested.name}</h2>
            <p style={{ marginBottom: 10 }}>{suggested.zone} · 20:30 en el gimnasio</p>
            <button className="primary big block" onClick={() => go('train')}>Empezar la sesión</button>
          </>
        ) : isSwim ? (
          <>
            <h2 style={{ fontSize: 19, marginTop: 2 }}>Natación</h2>
            <p style={{ marginBottom: 0 }}>
              20:00 a 21:00. Cierra el segundo trabajo a las 19:30 y come la fruta o el batido antes de salir. En casa a
              las 22:30, cena lista para calentar y a dormir a las 23:30.
            </p>
          </>
        ) : dow === 6 ? (
          <>
            <h2 style={{ fontSize: 19, marginTop: 2 }}>Caminata larga</h2>
            <p style={{ marginBottom: 0 }}>60 a 75 minutos a la hora que quieras. Dormir 8 h 45.</p>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 19, marginTop: 2 }}>Descanso activo</h2>
            <p style={{ marginBottom: 0 }}>
              Estiramiento y caminata liviana. Dedica dos horas a cocinar las cinco cenas de la semana: con cena a las
              22:15, esta es la tarea más importante del domingo.
            </p>
          </>
        )}
      </div>

      <div className="card tight">
        <div className="row">
          <div className="grow">
            <strong>Semana {phase.week} de 8 · {phase.label}</strong>
            <div className="muted">{phase.intent}</div>
          </div>
        </div>
        <div className="bar" style={{ marginTop: 9 }}>
          <i style={{ width: `${(phase.week / 8) * 100}%` }} />
        </div>
        <div className="muted num" style={{ fontSize: 12.5, marginTop: 4 }}>
          {daysLeft} días para la remedición del {fmtDate(config.blockEnd, true)}
        </div>
      </div>

      <div className="section-title">Esta semana</div>
      <div className="tiles">
        <Tile label="Sesiones de fuerza" value={thisWeek} dec={0} progress={(thisWeek / 3) * 100} goalText="meta 3 por semana" />
        <Tile label="Sesiones totales" value={finished.length} dec={0} />
        <Tile
          label="Volumen última sesión"
          value={finished.length ? Math.round(sessionVolume(finished[0])) : null}
          unit="kg" dec={0}
        />
        <Tile label="Series última sesión" value={finished.length ? doneSets(finished[0]) : null} dec={0} />
      </div>

      {base && last && rows.length > 1 && (
        <>
          <div className="section-title">Composición</div>
          <div className="tiles">
            <Tile label="Peso" value={last.weight} unit="kg" delta={last.weight - base.weight} deltaGood="lower"
              progress={progressPct(last.weight, base.weight, config.goal.weight)} goalText={`meta ${fmt(config.goal.weight)} kg`} />
            <Tile label="Masa grasa" value={last.fatMass ?? null} unit="kg"
              delta={last.fatMass != null && base.fatMass != null ? last.fatMass - base.fatMass : null} deltaGood="lower" />
            <Tile label="Músculo" value={last.muscle ?? null} unit="kg"
              delta={last.muscle != null && base.muscle != null ? last.muscle - base.muscle : null} deltaGood="higher" />
            <Tile label="Cintura" value={last.waist ?? null} unit="cm"
              delta={last.waist != null && base.waist != null ? last.waist - base.waist : null} deltaGood="lower" />
          </div>
        </>
      )}

      {rows.length <= 1 && (
        <div className="card" style={{ marginTop: 12 }}>
          <strong>Falta tu primera medición del bloque</strong>
          <p style={{ marginBottom: 10 }}>
            Tienes la línea base del 3 de agosto. La siguiente toca a las dos semanas, y sin ella no hay forma de saber
            si el peso que pierdes sale de la grasa o del músculo.
          </p>
          <button className="block" onClick={() => go('measure')}>Ir a medidas</button>
        </div>
      )}

      <div className="section-title">Las tres rutinas</div>
      {ROUTINES.map(r => (
        <div className="list-item card tight" key={r.id} style={{ marginBottom: 8, borderBottom: '1px solid var(--ring)' }}>
          <div className="grow">
            <div className="t1">{r.name}</div>
            <div className="t2">{r.weekday} · {r.zone}</div>
          </div>
        </div>
      ))}
    </>
  )
}
