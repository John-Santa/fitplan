import { useState, type ReactNode } from 'react'
import { RestTimer, useToast } from '../../components/ui'

interface Props {
  /** Nombre de la rutina (fuerza) o de la disciplina (natacion). */
  eyebrow: string
  doneCount: number
  totalCount: number
  /** "series" para fuerza, "bloques" para natacion. */
  unitLabel: string
  onFinish: () => void
  finishDisabled: boolean
  notes: string
  onNotesChange: (v: string) => void
  onDiscard: () => void
  /** Contenido propio de la cabecera, dentro de `.session-head` (el riel de
   *  ejercicios en fuerza). Natacion no tiene equivalente: omitido. */
  headerExtra?: ReactNode
  /** El cuerpo especifico de cada disciplina recibe `startRest` para poder
   *  disparar el temporizador de descanso, que el caparazon posee (junto
   *  con el toast que muestra "Descanso terminado"). */
  children: (startRest: (sec: number) => void) => ReactNode
}

/** Caparazon compartido por toda sesion activa, sin importar la disciplina:
 *  cabecera con el contador NN/NN, barra de progreso, notas, descartar,
 *  terminar, el temporizador de descanso y el toast. `SessionShell` es
 *  dueno de `.session-head`, asi que `.main:has(.session-head)`
 *  (styles.css, ADR-06) coincide automaticamente en la pantalla de
 *  natacion tambien, con cero CSS nuevo (ver A4 en el plan). */
export default function SessionShell({
  eyebrow,
  doneCount,
  totalCount,
  unitLabel,
  onFinish,
  finishDisabled,
  notes,
  onNotesChange,
  onDiscard,
  headerExtra,
  children,
}: Props) {
  const toast = useToast()
  const [rest, setRest] = useState<{ sec: number; key: number } | null>(null)
  const startRest = (sec: number) => setRest({ sec, key: Date.now() })

  return (
    <>
      <div className="session-head">
        <div className="row">
          <div className="grow">
            <div className="eyebrow accent">{eyebrow}</div>
            <h1>
              {String(doneCount).padStart(2, '0')}
              <span>/ {totalCount} {unitLabel}</span>
            </h1>
          </div>
          <button className="primary" onClick={onFinish} disabled={finishDisabled}>
            Terminar
          </button>
        </div>
        <div className="session-bar">
          <i style={{ flex: doneCount }} />
          <i style={{ flex: totalCount - doneCount }} />
        </div>
        {headerExtra}
      </div>

      {children(startRest)}

      <div className="card">
        <label htmlFor="notas">Notas de la sesión</label>
        <textarea
          id="notas" value={notes} placeholder="Cómo te sentiste, molestias, cambios de máquina…"
          onChange={e => onNotesChange(e.target.value)}
        />
      </div>

      <div className="btnrow" style={{ marginBottom: 20 }}>
        <button
          className="danger"
          onClick={() => {
            if (confirm('¿Descartar esta sesión? No se guarda nada.')) onDiscard()
          }}
        >
          Descartar
        </button>
      </div>

      <div style={{ height: rest ? 96 : 0 }} />

      {rest && (
        <RestTimer
          key={rest.key}
          seconds={rest.sec}
          onDone={() => toast.show('Descanso terminado')}
          onClose={() => setRest(null)}
        />
      )}
      {toast.node}
    </>
  )
}
