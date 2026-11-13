import { afterEach, describe, expect, it, vi } from 'vitest'
import { setSignOutHandler, signOutOfAuth } from './auth'

describe('signOutOfAuth', () => {
  afterEach(() => setSignOutHandler(null))

  it('cierra la sesión con el manejador que fijó el puente de Clerk', async () => {
    const signOut = vi.fn(async () => {})
    setSignOutHandler(signOut)
    await signOutOfAuth()
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('sin Clerk no hace nada', async () => {
    await expect(signOutOfAuth()).resolves.toBeUndefined()
  })
})
