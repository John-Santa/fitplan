// Detección de "versión nueva" sobre la API estándar de service workers.
// Reemplaza a virtual:pwa-register, que en el build necesita el paquete
// workbox-window como dependencia directa (ver el informe de W4). Sin DOM
// propio: recibe la registración y el controlador, así que se prueba con
// objetos falsos.

/** Mensaje que el service worker que genera Workbox con registerType
 *  'prompt' escucha para activarse. */
export const SKIP_WAITING_MESSAGE = 'SKIP_WAITING'

type Worker = { state: string; postMessage: (message: unknown) => void; addEventListener: (type: 'statechange', fn: () => void) => void }

export type UpdateRegistration = {
  waiting: Worker | null
  installing: Worker | null
  addEventListener: (type: 'updatefound', fn: () => void) => void
}

/** Llama a `onWaiting` cuando hay una versión nueva instalada y esperando.
 *  La primera instalación (sin controlador) no cuenta: no hay nada que
 *  reemplazar. */
export function trackUpdate<W extends Worker>(reg: UpdateRegistration & { waiting: W | null; installing: W | null }, hasController: () => boolean, onWaiting: (w: W) => void) {
  if (reg.waiting && hasController()) onWaiting(reg.waiting)
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing
    if (!worker) return
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && hasController()) onWaiting(worker)
    })
  })
}

/** Pide a la versión en espera que tome el control; la página se recarga
 *  cuando cambia el controlador. */
export function activateWaiting(worker: Pick<Worker, 'postMessage'>) {
  worker.postMessage({ type: SKIP_WAITING_MESSAGE })
}
