// S1/S10: the synced config contract for the new flat fields (disciplines,
// swimWeeklyTarget), through the real outbox and config-sync glue over an
// in-memory IndexedDB.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Config } from './types'
import { installMemoryIdb } from './testing/memoryIdb'

async function fresh() {
  vi.resetModules()
  installMemoryIdb()
  const db = await import('./db')
  const plan = await import('./plan')
  const local = await import('../features/sync/lib/localWrites')
  const sdb = await import('../features/sync/lib/syncDb')
  const configSync = await import('../features/sync/lib/configSync')
  local.setTrackingForTests(true)
  return { db, plan, local, sdb, configSync }
}

afterEach(() => vi.unstubAllGlobals())

/** A config body as an older client writes it: without the new fields. */
function olderBody(config: Config, patch: Partial<Config> = {}) {
  const body = structuredClone({ ...config, ...patch }) as Partial<Config>
  delete body.disciplines
  delete body.swimWeeklyTarget
  return body
}

describe('outbox body', () => {
  it('a config saved with disciplines round-trips through the outbox body unchanged', async () => {
    const { plan, local, sdb } = await fresh()
    const config: Config = { ...plan.DEFAULT_CONFIG, disciplines: ['strength', 'swim'], swimWeeklyTarget: 3 }
    await local.saveConfig(config)
    const entry = await sdb.getOutboxEntry('document', 'config')
    // What the API stores and hands back: the body as JSON.
    const wire = JSON.parse(JSON.stringify(entry?.body))
    expect(wire.disciplines).toEqual(['strength', 'swim'])
    expect(wire.swimWeeklyTarget).toBe(3)
    expect(plan.mergeConfig(wire)).toEqual(config)
  })
})

describe('older-client config pulled while a local change is queued', () => {
  it('keeps the local disciplines and target and records no conflict notice', async () => {
    const { db, plan, local, sdb, configSync } = await fresh()
    // Both devices last agreed on a config from before this build.
    await sdb.saveConfigBase(olderBody(plan.DEFAULT_CONFIG))
    const mine: Config = { ...plan.DEFAULT_CONFIG, disciplines: ['strength', 'swim'], swimWeeklyTarget: 3 }
    await local.saveConfig(mine)
    const pending = (await sdb.getOutboxEntry('document', 'config'))!
    // The older device changed only its height.
    const remote = { body: olderBody(plan.DEFAULT_CONFIG, { heightCm: 180 }), updatedAt: pending.updatedAt + 10, deletedAt: null }

    await configSync.mergePendingConfig(pending, remote)

    const stored = (await db.getConfig())!
    expect(stored.disciplines).toEqual(['strength', 'swim'])
    expect(stored.swimWeeklyTarget).toBe(3)
    expect(stored.heightCm).toBe(180)
    expect(await sdb.getConfigConflict()).toBeUndefined()
    // The merge is queued for the push with the local values.
    const queued = (await sdb.getOutboxEntry('document', 'config'))!.body as Config
    expect(queued.disciplines).toEqual(['strength', 'swim'])
    expect(queued.swimWeeklyTarget).toBe(3)
    expect((queued as { syncConflict?: unknown }).syncConflict).toBeUndefined()
  })
})
