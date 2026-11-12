import { useEffect, useState, type ReactNode } from 'react'
import { mmss } from '../../../lib/calc'
import { RestTimer, useToast } from '../../../components/ui'
import { AlertIcon, CheckCircle, CloseIcon } from './PlanIcons'
import './session.css'

interface Props {
  /** Nombre de la rutina (fuerza) o de la disciplina (natacion). */
  eyebrow: string
  /** Inicio de la sesion (ms), para el cronometro transcurrido. */
  startedAt: number
  doneCount: number
  totalCount: number
  onFinish: () => void
  finishDisabled: boolean
  notes: string
  onNotesChange: (v: string) => void
  onDiscard: () => void
  /** Boton de alarma de la barra superior; sin el, no se muestra. */
  onAlarm?: () => void
  /** Progreso propio bajo la barra (segmentos de ejercicios en fuerza). Si se
   *  omite, se muestra una barra continua de series/bloques. */
  progress?: ReactNode
  /** Notas + descartar al final del cuerpo. Fuerza solo las muestra en el
   *  ultimo ejercicio. */
  showEnd?: boolean
  /** Zona del pulgar propia. Si se omite: un solo boton "Terminar entrenamiento". */
  footer?: (startRest: (sec: number) => void) => ReactNode
  /** El cuerpo especifico de cada disciplina recibe `startRest` para poder
   *  disparar el temporizador de descanso, que el caparazon posee (junto
   *  con el toast que muestra "Descanso terminado"). */
  children: (startRest: (sec: number) => void) => ReactNode
}

/** Cronometro transcurrido desde `startedAt`, calculado con la hora (no sumando
 *  ticks) para que no se atrase con la pantalla apagada. */
function useElapsed(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

/** Caparazon compartido por toda sesion activa (modo enfoque, sin barra de
 *  pestañas): barra superior con cerrar, rutina + cronometro y alarma; cuerpo;
 *  notas y descartar; zona del pulgar fija abajo; temporizador de descanso y
 *  toast. Mientras esta montado, `body.fp-focus` esconde la barra de pestañas. */
export default function SessionShell({
  eyebrow,
  startedAt,
  doneCount,
  totalCount,
  onFinish,
  finishDisabled,
  notes,
  onNotesChange,
  onDiscard,
  onAlarm,
  progress,
  showEnd = true,
  footer,
  children,
}: Props) {
  const toast = useToast()
  const [rest, setRest] = useState<{ sec: number; key: number } | null>(null)
  const startRest = (sec: number) => setRest({ sec, key: Date.now() })
  const elapsed = useElapsed(startedAt)

  useEffect(() => {
    document.body.classList.add('fp-focus')
    return () => document.body.classList.remove('fp-focus')
  }, [])

  const askDiscard = () => {
    if (confirm('¿Descartar esta sesión? No se guarda nada.')) onDiscard()
  }

  return (
    <div className="ses">
      <header className="ses-top">
        <div className="ses-bar">
          <button type="button" className="ses-iconbtn" aria-label="Cerrar entrenamiento" onClick={askDiscard}>
            <CloseIcon />
          </button>
          <div className="ses-bar-mid">
            <span className="ses-bar-name">{eyebrow}</span>
            <span className="ses-bar-time" role="timer" aria-label="Tiempo transcurrido">
              <i className="ses-dot" aria-hidden="true" />
              {mmss(elapsed)}
            </span>
          </div>
          {onAlarm ? (
            <button type="button" className="ses-iconbtn warn" aria-label="Alarma: señales de alarma" onClick={onAlarm}>
              <AlertIcon />
            </button>
          ) : (
            <span className="ses-bar-spacer" aria-hidden="true" />
          )}
        </div>
        {progress ?? (
          <div className="ses-prog">
            <div className="ses-prog-meta">
              <span>{doneCount} de {totalCount}</span>
            </div>
            <div className="ses-linebar" aria-hidden="true">
              <i style={{ flex: doneCount }} />
              <i className="rest" style={{ flex: Math.max(totalCount - doneCount, 0) }} />
            </div>
          </div>
        )}
      </header>

      <main className="ses-main">
        {children(startRest)}

        {showEnd && (
          <>
            <section className="ses-notes">
              <label htmlFor="notas">Notas de la sesión</label>
              <textarea
                id="notas" value={notes} placeholder="Cómo te sentiste, molestias, cambios de máquina…"
                onChange={e => onNotesChange(e.target.value)}
              />
            </section>
            <button type="button" className="ses-discard" onClick={askDiscard}>Descartar sesión</button>
          </>
        )}
      </main>

      <footer className="ses-foot">
        {footer ? (
          footer(startRest)
        ) : (
          <button type="button" className="ses-primary" onClick={onFinish} disabled={finishDisabled}>
            <CheckCircle /> Terminar entrenamiento
          </button>
        )}
      </footer>

      {rest && (
        <div className="ses-rest">
          <RestTimer
            key={rest.key}
            seconds={rest.sec}
            onDone={() => toast.show('Descanso terminado')}
            onClose={() => setRest(null)}
          />
        </div>
      )}
      {toast.node}
    </div>
  )
}
