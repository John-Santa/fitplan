import { useState } from 'react'
import type { SwimBlock, SwimSession, SwimStroke } from '../../types'
import { mmss } from '../../lib/calc'
import { DISCIPLINES, SWIM_STROKE_LABELS, SWIM_STROKES, lapsToMetres, metresToLaps, swimHasEnteredData } from '../../lib/disciplines'
import { Check } from '../../components/ui'
import SessionShell from './SessionShell'

interface Props {
  session: SwimSession
  onChange: (s: SwimSession) => void
  onFinish: () => void
  onDiscard: () => void
}

/** Parsea lo que alguien tipea con las manos mojadas, en el celular, como
 *  tiempo de un bloque: "mm:ss" explicito, o solo digitos interpretados
 *  como cronometro (últimos dos digitos = segundos, el resto = minutos —
 *  "130" son 1:30, "45" son 0:45). null si no matchea ninguna de las dos
 *  formas o los segundos no son validos (>=60). No exportada: es un detalle
 *  de este input, no una funcion de dominio (a diferencia de mmss, que sí
 *  vive en calc.ts porque también formatea el ritmo derivado). */
function parseTimeInput(text: string): number | null {
  const t = text.trim()
  if (t === '') return null
  const withColon = t.match(/^(\d{1,3}):([0-5]?\d)$/)
  if (withColon) return Number(withColon[1]) * 60 + Number(withColon[2])
  const digitsOnly = t.match(/^\d{1,4}$/)
  if (digitsOnly) {
    if (t.length <= 2) return Number(t)
    const sec = Number(t.slice(-2))
    if (sec > 59) return null
    return Number(t.slice(0, -2)) * 60 + sec
  }
  return null
}

/** Cuerpo de natacion: bloques agregados por el usuario (entrada en calor,
 *  serie principal, vuelta a la calma — no hay una cantidad fija como
 *  targetSets en fuerza), cada uno con largos, tiempo, estilo y una marca
 *  de hecho, mas el RPE de la sesion entera. Reutiliza `.setnow`/`.setrow`
 *  tal cual (ver A4 en el plan): el bloque "actual" (el primero sin marcar)
 *  se muestra en `.setnow`, el resto en `.setrow`, exactamente el mismo
 *  patron que StrengthBody usa para sus series. */
export default function SwimBody({ session, onChange, onFinish, onDiscard }: Props) {
  // Texto crudo que el usuario esta tipeando en el campo de tiempo, por
  // indice de bloque: sin esto, un input controlado que reformatea en cada
  // tecla (mmss(timeSec)) le borraria el digito que recien tipeo apenas el
  // parseo parcial no matchea. Se limpia en el blur (ver onTimeBlur).
  const [timeDrafts, setTimeDrafts] = useState<Record<number, string>>({})

  const totalDone = session.blocks.filter(b => b.done).length
  const totalCount = session.blocks.length
  // R7: habilita "Terminar" con cualquier dato cargado, sin mirar la marca
  // de hecho — exigirla reproduciria el defecto que este cuerpo existe para
  // evitar (ver swimHasEnteredData en disciplines.ts).
  const canFinish = swimHasEnteredData(session)

  const updateBlock = (index: number, patch: Partial<SwimBlock>) => {
    onChange({ ...session, blocks: session.blocks.map(b => (b.index === index ? { ...b, ...patch } : b)) })
  }

  const addBlock = () => {
    const index = session.blocks.length
    onChange({
      ...session,
      blocks: [...session.blocks, { index, distanceM: null, timeSec: null, stroke: 'freestyle', done: false }],
    })
  }

  const onTimeChange = (b: SwimBlock, text: string) => {
    setTimeDrafts(d => ({ ...d, [b.index]: text }))
    const parsed = parseTimeInput(text)
    if (parsed != null) updateBlock(b.index, { timeSec: parsed })
    else if (text.trim() === '') updateBlock(b.index, { timeSec: null })
  }

  const onTimeBlur = (b: SwimBlock) => {
    setTimeDrafts(d => {
      if (!(b.index in d)) return d
      const next = { ...d }
      delete next[b.index]
      return next
    })
  }

  // Mismo criterio que StrengthBody's currentSetIndex: el primer bloque sin
  // marcar es el "actual" y va en .setnow; el resto (marcado o no) va en
  // .setrow. -1 (ningun bloque, o todos marcados) no matchea ningun index.
  const currentIndex = session.blocks.findIndex(b => !b.done)

  return (
    <SessionShell
      eyebrow={DISCIPLINES.swim.label}
      doneCount={totalDone}
      totalCount={totalCount}
      unitLabel="bloques"
      onFinish={onFinish}
      finishDisabled={!canFinish}
      notes={session.notes}
      onNotesChange={notes => onChange({ ...session, notes })}
      onDiscard={onDiscard}
    >
      {startRest => (
        <div className="ex-panel">
          <h2>Bloques</h2>
          {session.blocks.length === 0 && (
            <p className="hint">Agrega el primer bloque: entrada en calor, serie principal o vuelta a la calma.</p>
          )}

          {session.blocks.map(b => {
            const isCurrent = b.index === currentIndex
            const laps = metresToLaps(b.distanceM, session.poolLengthM)
            const timeText = timeDrafts[b.index] ?? (b.timeSec != null ? mmss(b.timeSec) : '')

            const toggle = () => {
              const next = !b.done
              updateBlock(b.index, { done: next })
              if (next) startRest(DISCIPLINES.swim.defaultRestSec)
            }

            const lapsInput = (
              <input
                type="number" inputMode="numeric"
                className={`num${laps != null ? ' filled' : ''}`}
                value={laps ?? ''}
                onChange={e =>
                  updateBlock(b.index, {
                    distanceM: e.target.value === '' ? null : lapsToMetres(Number(e.target.value), session.poolLengthM),
                  })
                }
                aria-label={`Largos bloque ${b.index + 1}`}
              />
            )
            const timeInput = (
              <input
                type="text" inputMode="numeric"
                className={`num${b.timeSec != null ? ' filled' : ''}`}
                placeholder="mm:ss"
                value={timeText}
                onChange={e => onTimeChange(b, e.target.value)}
                onBlur={() => onTimeBlur(b)}
                aria-label={`Tiempo bloque ${b.index + 1}`}
              />
            )

            return (
              <div className="card" key={b.index}>
                <label htmlFor={`stroke-${b.index}`}>Bloque {b.index + 1} · Estilo</label>
                <select
                  id={`stroke-${b.index}`}
                  value={b.stroke}
                  onChange={e => updateBlock(b.index, { stroke: e.target.value as SwimStroke })}
                >
                  {SWIM_STROKES.map(s => (
                    <option key={s} value={s}>{SWIM_STROKE_LABELS[s]}</option>
                  ))}
                </select>

                {isCurrent ? (
                  <div className="setnow">
                    <div className="setnow-head">
                      <span className="lbl-current">Bloque {b.index + 1}</span>
                    </div>
                    <div className="setnow-grid">
                      <div>
                        <div className="micro">Largos</div>
                        {lapsInput}
                      </div>
                      <div>
                        <div className="micro">Tiempo</div>
                        {timeInput}
                      </div>
                      <button className="check" aria-label={b.done ? 'Deshacer bloque' : 'Marcar bloque'} onClick={toggle}>
                        <Check on={b.done} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`setrow ${b.done ? 'done' : 'pending'}`}>
                    <div className="idx num">{b.index + 1}</div>
                    {lapsInput}
                    {timeInput}
                    <button
                      className={`check${b.done ? ' on' : ''}`}
                      aria-label={b.done ? 'Deshacer bloque' : 'Marcar bloque'}
                      onClick={toggle}
                    >
                      <Check on={b.done} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          <div className="btnrow" style={{ marginTop: 10, marginBottom: 16 }}>
            <button onClick={addBlock}>+ Agregar bloque</button>
          </div>

          <div className="card">
            <label htmlFor="rpe">Esfuerzo percibido (RPE 1–10)</label>
            <input
              id="rpe" type="number" inputMode="numeric" min={1} max={10}
              value={session.rpe ?? ''}
              onChange={e => onChange({ ...session, rpe: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <p className="hint">Opcional. 1 es muy suave, 10 es al máximo esfuerzo.</p>
          </div>
        </div>
      )}
    </SessionShell>
  )
}
