import { blockPhase, blockWeeks, dayTitle, DONE_TODAY, nextWeekdayFor, routineForWeekday, routineSetCount, routineShortName, ROUTINES, SESSION_KIND_FOR_DAY, weekdayAbbr, WEEKDAYS } from '../lib/plan'
import { fmt, fmtDate, fmtSigned, todayISO } from '../lib/calc'
import { blockSessionCount, weeklySummary } from '../lib/disciplines'
import { useDerivedMeasurements, useStore } from '../lib/store'
import { Tile } from '../components/ui'

/** Clase de color de una fila de composición, según si el cambio va en la dirección buena. */
function deltaClass(delta: number | null, deltaGood: 'lower' | 'higher'): 'up' | 'down' | 'flat' {
  if (delta == null || Math.abs(delta) < 0.05) return 'flat'
  const good = deltaGood === 'lower' ? delta < 0 : delta > 0
  return good ? 'up' : 'down'
}

export default function Home({ go }: { go: (tab: 'train' | 'measure') => void }) {
  const { sessions, config } = useStore()
  const rows = useDerivedMeasurements()
  const now = new Date()
  const phase = blockPhase(now, config.blockStart)
  const dow = now.getDay()
  const today = config.weeklyRoutine[dow]
  const suggested = routineForWeekday(config.weeklyRoutine, dow)
  // "Ya entrenaste hoy" debe significar "ya hice la disciplina de HOY", no
  // "termine cualquier sesion hoy": sin esto, una natacion de mañana
  // reemplazaba el llamado a accion del gimnasio (R1). Un dia sin
  // disciplina asignada (descanso, caminata, personalizado) nunca cuenta
  // como "hecho".
  const todayKind = SESSION_KIND_FOR_DAY[today.kind]
  const doneKind =
    todayKind != null && sessions.some(s => s.kind === todayKind && s.date === todayISO() && s.finishedAt)
      ? todayKind
      : null

  const base = rows[0]
  const last = rows[rows.length - 1]
  const finished = sessions.filter(s => s.finishedAt)
  const blockFinished = blockSessionCount(finished, config.blockStart, config.blockEnd)
  // Una linea por disciplina (conteo semanal, meta y valor de trabajo con su
  // unidad): recorre DISCIPLINES, asi que una disciplina nueva aparece sola
  // en los tiles de mas abajo sin tocar este componente.
  const weekLines = weeklySummary(sessions, config.weeklyRoutine)

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(config.blockEnd + 'T00:00:00').getTime() - now.getTime()) / 86400000),
  )

  return (
    <>
      <div className="eyebrow">
        {WEEKDAYS[dow]} {fmtDate(todayISO())} · Semana {phase.week} de 8
      </div>
      <h1 className="hero">
        Hoy
        {suggested && (
          <>
            <br />
            <span className="slab">{routineShortName(suggested)}</span>
          </>
        )}
      </h1>

      <div className="col-a">
        <div className="card accent">
          <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Hoy es {WEEKDAYS[dow]}
          </div>
          {doneKind ? (
            <>
              <h2 style={{ fontSize: 19, marginTop: 2 }}>{DONE_TODAY[doneKind].title}</h2>
              <p style={{ marginBottom: 0 }}>{DONE_TODAY[doneKind].note}</p>
            </>
          ) : todayKind ? (
            <>
              <h2 style={{ fontSize: 19, marginTop: 2 }}>{dayTitle(today)}</h2>
              {/* suggested es null en un dia de natacion (routineForWeekday
                 solo resuelve dias de entreno): sin zona de rutina que
                 mostrar, solo la nota del dia si existe. El boton, en
                 cambio, se habilita por disciplina planificada (todayKind),
                 no por si hay una rutina de fuerza — antes routineForWeekday
                 devolvia null para natacion y el CTA desaparecia entero. */}
              {(suggested ? suggested.zone : today.note) !== '' && (
                <p style={{ marginBottom: 10 }}>
                  {suggested ? suggested.zone : today.note}
                  {suggested && today.note !== '' && ` · ${today.note}`}
                </p>
              )}
              <button className="primary big block" onClick={() => go('train')}>Empezar la sesión</button>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 19, marginTop: 2 }}>{dayTitle(today)}</h2>
              {today.note !== '' && <p style={{ marginBottom: 0 }}>{today.note}</p>}
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
          <div className="weekbar" style={{ marginTop: 9 }}>
            {blockWeeks(phase.week).map(w => (
              <div key={w.week}>
                <i className={w.state} />
                <span className={w.state === 'current' ? 'wnum current' : 'wnum'}>{w.week}</span>
              </div>
            ))}
          </div>
          <div className="muted num" style={{ fontSize: 12.5, marginTop: 4 }}>
            {daysLeft} días para la remedición del {fmtDate(config.blockEnd, true)}
          </div>
        </div>
      </div>

      <div className="col-b">
        <div className="section-title">Esta semana</div>
        <div className="tiles">
          {/* Un tile nunca mezcla unidades: conteo de sesiones (sin unidad,
             contra la meta de dias programados) y valor de trabajo (kg o m)
             van separados, uno por disciplina. Solo se muestra una
             disciplina si tiene dias programados o ya tiene sesiones esta
             semana — evita un "Natación 0" permanente para quien solo hace
             fuerza. */}
          {weekLines
            .filter(l => l.target > 0 || l.count > 0)
            .flatMap(l => [
              <Tile
                key={`${l.kind}-count`}
                testId={`tile-${l.kind}-count`}
                label={l.label}
                value={l.count}
                dec={0}
                progress={l.target > 0 ? (l.count / l.target) * 100 : undefined}
                goalText={l.target > 0 ? `meta ${l.target} por semana` : 'sin días programados'}
              />,
              <Tile
                key={`${l.kind}-work`}
                testId={`tile-${l.kind}-work`}
                label={l.workLabel}
                value={l.workValue}
                unit={l.workUnit}
                dec={0}
              />,
            ])}
          {/* Cuenta sesiones de cualquier disciplina: es un conteo, no una
             suma de unidades incompatibles, asi que mezclarlas no lo vuelve
             incorrecto (ver R1). */}
          <Tile testId="tile-block" label="Sesiones del bloque" value={blockFinished} dec={0} />
        </div>
      </div>

      <div className="col-a">
        {base && last && rows.length > 1 && (
          <>
            <div className="section-title">Composición</div>
            {[
              { label: 'Peso', value: last.weight, unit: 'kg',
                delta: last.weight - base.weight, deltaGood: 'lower' as const },
              { label: 'Masa grasa', value: last.fatMass ?? null, unit: 'kg',
                delta: last.fatMass != null && base.fatMass != null ? last.fatMass - base.fatMass : null, deltaGood: 'lower' as const },
              { label: 'Músculo', value: last.muscle ?? null, unit: 'kg',
                delta: last.muscle != null && base.muscle != null ? last.muscle - base.muscle : null, deltaGood: 'higher' as const },
              { label: 'Cintura', value: last.waist ?? null, unit: 'cm',
                delta: last.waist != null && base.waist != null ? last.waist - base.waist : null, deltaGood: 'lower' as const },
            ].map(c => (
              <div className="comprow" key={c.label}>
                <div className="l">{c.label}</div>
                <div className="v num">{fmt(c.value)}<span>{c.unit}</span></div>
                <div className={`d num ${deltaClass(c.delta, c.deltaGood)}`}>{fmtSigned(c.delta)}</div>
              </div>
            ))}
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
      </div>

      <div className="col-b">
        <div className="section-title">Las tres rutinas</div>
        {ROUTINES.map(r => {
          const badgeDow = nextWeekdayFor(config.weeklyRoutine, r.id, dow)
          return (
            <div className="list-item" key={r.id}>
              <div className={r.id === suggested?.id ? 'day-badge today' : 'day-badge'}>
                {badgeDow == null ? '—' : weekdayAbbr(badgeDow)}
              </div>
              <div className="grow">
                <div className="t1">{r.name}</div>
                <div className="t2">{r.zone}</div>
              </div>
              <div className="muted num">{routineSetCount(r, phase.setsDelta)} ser</div>
            </div>
          )
        })}
      </div>
    </>
  )
}
