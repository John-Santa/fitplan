// Aviso de versión nueva (registerType: 'prompt'). El registro del service
// worker vive aquí y no en un script inyectado: la versión nueva espera hasta
// que la persona toca Actualizar (y el aviso no sale en pleno entrenamiento,
// ver PwaPrompts). Solo existe en el build; en desarrollo no hay service worker.
// main.tsx registra al arrancar (registerServiceWorker), así una instalación
// nueva que se queda en la bienvenida ya funciona sin conexión.
import { useCallback, useEffect, useState } from 'react'
import { activateWaiting, trackUpdate } from './swUpdate'

let waitingWorker: ServiceWorker | null = null
let started = false
const listeners = new Set<() => void>()

/** Registers the service worker once. Called at startup from main.tsx and
 *  again (a no-op) by useUpdatePrompt. */
export function registerServiceWorker() {
  if (started || !import.meta.env.PROD || !('serviceWorker' in navigator)) return
  started = true
  const base = import.meta.env.BASE_URL
  navigator.serviceWorker
    .register(`${base}sw.js`, { scope: base })
    .then(reg => {
      trackUpdate(reg, () => navigator.serviceWorker.controller != null, worker => {
        waitingWorker = worker
        listeners.forEach(l => l())
      })
      // Una pestaña que lleva días abierta no vuelve a pedir sw.js sola.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => {})
      })
    })
    .catch(() => {
      started = false
    })
  // Cuando la versión nueva toma el control, se recarga una vez.
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !waitingWorker) return
    reloaded = true
    location.reload()
  })
}

/** `needRefresh` pasa a verdadero cuando hay una versión nueva esperando.
 *  `apply` la activa y recarga; `later` oculta el aviso. */
export function useUpdatePrompt(): { needRefresh: boolean; apply: () => void; later: () => void } {
  const [needRefresh, setNeedRefresh] = useState(waitingWorker != null)
  useEffect(() => {
    const onNeed = () => setNeedRefresh(true)
    listeners.add(onNeed)
    registerServiceWorker()
    return () => {
      listeners.delete(onNeed)
    }
  }, [])
  const apply = useCallback(() => {
    if (waitingWorker) activateWaiting(waitingWorker)
  }, [])
  const later = useCallback(() => setNeedRefresh(false), [])
  return { needRefresh, apply, later }
}
