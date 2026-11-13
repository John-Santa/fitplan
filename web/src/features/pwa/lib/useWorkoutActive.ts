import { useEffect, useState } from 'react'
import { loadActiveDraft } from '../../session/lib/activeSession'

/** Hay un entrenamiento en curso (borrador de sesión sin terminar). Solo
 *  relee mientras `watch` es verdadero, es decir, mientras hay un aviso que
 *  depende de ello. */
export function useWorkoutActive(watch: boolean, pollMs = 2_000): boolean {
  const [active, setActive] = useState(() => loadActiveDraft() != null)
  useEffect(() => {
    if (!watch) return
    const check = () => setActive(loadActiveDraft() != null)
    check()
    const timer = setInterval(check, pollMs)
    return () => clearInterval(timer)
  }, [watch, pollMs])
  return active
}
