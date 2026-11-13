import { describe, expect, it } from 'vitest'
import { CLOUD_DELETION_OFFLINE, dangerZoneStep, runCloudDeletion, type CloudDeletionDeps } from './cloudDeletion'

function fakeDeps(over: Partial<CloudDeletionDeps> = {}) {
  const calls: string[] = []
  const deps: CloudDeletionDeps = {
    isOnline: () => true,
    pauseSync: async () => { calls.push('pauseSync') },
    resumeSync: () => { calls.push('resumeSync') },
    remoteDelete: async kind => { calls.push(`remoteDelete ${kind}`) },
    eraseLocal: async () => { calls.push('eraseLocal') },
    signOut: async () => { calls.push('signOut') },
    ...over,
  }
  return { deps, calls }
}

describe('runCloudDeletion', () => {
  it('eliminar cuenta: pausa la sincronización, borra en el servidor, limpia el dispositivo y cierra la sesión, en ese orden', async () => {
    const { deps, calls } = fakeDeps()
    await runCloudDeletion('account', deps)
    expect(calls).toEqual(['pauseSync', 'remoteDelete account', 'eraseLocal', 'signOut'])
  })

  it('borrar mis datos en la nube usa DELETE /v1/data y también limpia el dispositivo y cierra la sesión', async () => {
    const { deps, calls } = fakeDeps()
    await runCloudDeletion('data', deps)
    expect(calls).toEqual(['pauseSync', 'remoteDelete data', 'eraseLocal', 'signOut'])
  })

  it('si el servidor falla no borra nada local, reanuda la sincronización y propaga el error', async () => {
    const boom = new Error('Error 500 del servidor')
    const { deps, calls } = fakeDeps({ remoteDelete: async () => { calls.push('remoteDelete'); throw boom } })
    await expect(runCloudDeletion('account', deps)).rejects.toBe(boom)
    expect(calls).toEqual(['pauseSync', 'remoteDelete', 'resumeSync'])
  })

  it('sin conexión se bloquea antes de tocar nada', async () => {
    const { deps, calls } = fakeDeps({ isOnline: () => false })
    await expect(runCloudDeletion('account', deps)).rejects.toThrow(CLOUD_DELETION_OFFLINE)
    expect(calls).toEqual([])
  })

  it('un fallo al cerrar sesión no deshace el borrado (la cuenta de Clerk ya no existe)', async () => {
    const { deps, calls } = fakeDeps({ signOut: async () => { calls.push('signOut'); throw new Error('session gone') } })
    await expect(runCloudDeletion('account', deps)).resolves.toBeUndefined()
    expect(calls).toEqual(['pauseSync', 'remoteDelete account', 'eraseLocal', 'signOut'])
  })
})

describe('dangerZoneStep (doble confirmación dentro de la página)', () => {
  it('elegir una acción abre la primera confirmación, con la oferta de exportar', () => {
    expect(dangerZoneStep({ stage: 'idle' }, { type: 'start', kind: 'account' })).toEqual({ stage: 'confirm', kind: 'account' })
  })

  it('continuar pasa a la confirmación final de la misma acción', () => {
    expect(dangerZoneStep({ stage: 'confirm', kind: 'data' }, { type: 'continue' })).toEqual({ stage: 'final', kind: 'data' })
  })

  it('cancelar vuelve al inicio desde cualquier paso', () => {
    expect(dangerZoneStep({ stage: 'confirm', kind: 'account' }, { type: 'cancel' })).toEqual({ stage: 'idle' })
    expect(dangerZoneStep({ stage: 'final', kind: 'account' }, { type: 'cancel' })).toEqual({ stage: 'idle' })
  })

  it('continuar sin una primera confirmación no salta a la final', () => {
    expect(dangerZoneStep({ stage: 'idle' }, { type: 'continue' })).toEqual({ stage: 'idle' })
  })
})
