import { describe, expect, it, vi } from 'vitest'
import { SKIP_WAITING_MESSAGE, activateWaiting, trackUpdate, type UpdateRegistration } from './swUpdate'

type Listener = () => void

function fakeWorker(state: string) {
  const listeners: Listener[] = []
  return {
    state,
    postMessage: vi.fn(),
    addEventListener: (_t: 'statechange', fn: Listener) => void listeners.push(fn),
    emit(next: string) {
      this.state = next
      listeners.forEach(l => l())
    },
  }
}

function fakeRegistration(init: { waiting?: ReturnType<typeof fakeWorker> | null; installing?: ReturnType<typeof fakeWorker> | null } = {}) {
  const listeners: Listener[] = []
  const reg = {
    waiting: init.waiting ?? null,
    installing: init.installing ?? null,
    addEventListener: (_t: 'updatefound', fn: Listener) => void listeners.push(fn),
    foundUpdate: () => listeners.forEach(l => l()),
  }
  return reg as typeof reg & UpdateRegistration
}

describe('trackUpdate', () => {
  it('una versión que ya espera al abrir la app se avisa', () => {
    const waiting = fakeWorker('installed')
    const onWaiting = vi.fn()
    trackUpdate(fakeRegistration({ waiting }), () => true, onWaiting)
    expect(onWaiting).toHaveBeenCalledWith(waiting)
  })

  it('la primera instalación (sin controlador previo) no es una actualización', () => {
    const waiting = fakeWorker('installed')
    const onWaiting = vi.fn()
    trackUpdate(fakeRegistration({ waiting }), () => false, onWaiting)
    expect(onWaiting).not.toHaveBeenCalled()
  })

  it('al encontrar una versión nueva avisa cuando termina de instalarse', () => {
    const installing = fakeWorker('installing')
    const reg = fakeRegistration()
    const onWaiting = vi.fn()
    trackUpdate(reg, () => true, onWaiting)
    reg.installing = installing
    reg.foundUpdate()
    expect(onWaiting).not.toHaveBeenCalled()
    installing.emit('installed')
    expect(onWaiting).toHaveBeenCalledWith(installing)
  })
})

describe('activateWaiting', () => {
  it('pide al service worker en espera que tome el control', () => {
    const waiting = fakeWorker('installed')
    activateWaiting(waiting)
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING_MESSAGE })
    expect(SKIP_WAITING_MESSAGE).toBe('SKIP_WAITING')
  })
})
