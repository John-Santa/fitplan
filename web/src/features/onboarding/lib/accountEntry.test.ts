import { describe, expect, it } from 'vitest'
import { connectingText } from './accountEntry'
import { CONNECTING_TEXT } from '../../sync/lib/statusText'
import type { SyncStatus } from '../../sync/lib/engine'

const idle: SyncStatus = { state: 'idle', pending: 0, lastSyncAt: null, lastError: null, rejected: 0, rejectedError: null, backupAt: null }

describe('connectingText (first sync after signing in)', () => {
  it('speaks while the first sync runs', () => {
    expect(connectingText({ ...idle, state: 'syncing' })).toBe(
      'Conectando con el servidor… la primera vez puede tardar hasta un minuto.',
    )
  })

  it("also speaks in the engine's cold-start state ('connecting')", () => {
    expect(connectingText({ ...idle, state: 'connecting' })).toBe(
      'Conectando con el servidor… la primera vez puede tardar hasta un minuto.',
    )
  })

  it('starts with the same "Conectando con el servidor" text as the sync indicator', () => {
    expect(connectingText({ ...idle, state: 'connecting' })?.startsWith(CONNECTING_TEXT)).toBe(true)
  })

  it('stays silent once a sync finished, with no status, or in any other state', () => {
    expect(connectingText({ ...idle, state: 'connecting', lastSyncAt: 1 })).toBeNull()
    expect(connectingText({ ...idle, state: 'syncing', lastSyncAt: 1 })).toBeNull()
    expect(connectingText(null)).toBeNull()
    for (const state of ['idle', 'offline', 'error', 'blocked', 'auth_expired'] as const) {
      expect(connectingText({ ...idle, state })).toBeNull()
    }
  })
})
