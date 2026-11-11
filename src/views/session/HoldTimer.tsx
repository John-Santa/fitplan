import { useEffect, useState } from 'react'
import { mmss } from '../../lib/calc'
import { PlayIcon, StopIcon } from './PlanIcons'

/** Cronometro de sostenido: cuenta hacia arriba y, al detenerlo, entrega los
 *  segundos. Se calcula con la hora de inicio (no sumando ticks) para que no
 *  se atrase si el navegador frena el intervalo con la pantalla apagada. */
export default function HoldTimer({ label, onStop }: { label: string; onStop: (seconds: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (startedAt === null) return
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250)
    return () => window.clearInterval(id)
  }, [startedAt])

  const running = startedAt !== null
  const toggle = () => {
    if (startedAt === null) {
      setElapsed(0)
      setStartedAt(Date.now())
      return
    }
    onStop(Math.max(1, Math.round((Date.now() - startedAt) / 1000)))
    setStartedAt(null)
  }

  return (
    <button
      type="button"
      className={running ? 'ses-hold running' : 'ses-hold'}
      onClick={toggle}
      aria-label={`${label}: ${running ? 'detener' : 'iniciar'} cronómetro`}
    >
      {running ? <StopIcon /> : <PlayIcon />}
      <span className="num" role="timer">{running ? mmss(elapsed) : 'Iniciar'}</span>
    </button>
  )
}
