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

const swimSession = { id: 'sw1', kind: 'swim', date: '2026-11-11', startedAt: 3, finishedAt: 4, notes: '', poolLengthM: 25, blocks: [] } as never

describe('hiding Natación with swim sessions stored (S3, D7-A)', () => {
  it('stays hidden after a reload and after a reboot', async () => {
    const { db, plan, local } = await fresh()
    const { store, sel } = { store: await import('./store'), sel: await import('./disciplineSelection') }
    await db.saveSession(swimSession)
    await db.saveConfig({ ...plan.DEFAULT_CONFIG, disciplines: ['strength', 'swim'] })
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
    const read = async () => plan.mergeConfig(await db.getConfig())
    const sessions = (await db.getSessions()).sessions
    const config = await read()
    const api = sel.disciplineActions({ config, stored: 'swim', setStored: () => {}, saveConfig: c => local.saveConfigEdit(config, c) })
    expect(api.list).toEqual(['strength', 'swim'])

    await api.hide('swim')

    // Re-render after the store's reload.
    expect(sel.disciplineActions({ config: await read(), stored: 'swim', setStored: () => {}, saveConfig: async () => {} }).list).toEqual(['strength'])
    // Reboot.
    await store.prepareLocalData()
    expect(sel.disciplineList(await read())).toEqual(['strength'])
    expect(sessions).toHaveLength(1)
    expect((await db.getSessions()).sessions).toHaveLength(1)
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

// D2-A on a pull (engine.ts applyRemote): a pulled body without the list
// never undoes the local list, and with no local list D2-A applies once.
describe('pulled config without a discipline list', () => {
  async function signedIn() {
    const ctx = await fresh()
    const { fakeSyncServer } = await import('../features/sync/lib/testing/fakeSyncServer')
    const server = fakeSyncServer()
    vi.stubGlobal('fetch', server.fetch)
    vi.stubEnv('VITE_API_URL', 'https://api.example.test')
    const auth = await import('../features/account/lib/auth')
    auth.setTokenGetter(async () => 'tok')
    const engine = await import('../features/sync/lib/engine')
    return { ...ctx, server, engine }
  }
  afterEach(() => vi.unstubAllEnvs())

  it('keeps the local list when the local config has one', async () => {
    const { db, plan, server, engine } = await signedIn()
    await db.saveSession(swimSession)
    await db.saveConfig({ ...plan.DEFAULT_CONFIG, disciplines: ['swim', 'strength'] })
    engine.setSyncUser('u1')
    await engine.syncNow()
    // An older device saves its height; its body has no list.
    server.seed('documents', 'config', olderBody(plan.DEFAULT_CONFIG, { heightCm: 180 }), Date.now() + 60_000)

    await engine.syncNow()

    const stored = (await db.getConfig())!
    expect(stored.heightCm).toBe(180)
    expect(stored.disciplines).toEqual(['swim', 'strength'])
    engine.resetSyncEngineForTests()
  })

  it('applies D2-A from the local sessions when no list is stored locally either', async () => {
    const { db, plan, server, engine } = await signedIn()
    await db.saveSession(swimSession)
    server.seed('documents', 'config', olderBody(plan.DEFAULT_CONFIG, { heightCm: 182 }))
    engine.setSyncUser('u1')

    await engine.syncNow()

    const stored = (await db.getConfig())!
    expect(stored.heightCm).toBe(182)
    expect(stored.disciplines).toEqual(['strength', 'swim'])
    engine.resetSyncEngineForTests()
  })

  it('a pulled body with a list is applied as is', async () => {
    const { db, plan, server, engine } = await signedIn()
    await db.saveSession(swimSession)
    await db.saveConfig({ ...plan.DEFAULT_CONFIG, disciplines: ['strength', 'swim'] })
    engine.setSyncUser('u1')
    await engine.syncNow()
    server.seed('documents', 'config', { ...plan.DEFAULT_CONFIG, disciplines: ['strength'] }, Date.now() + 60_000)

    await engine.syncNow()

    expect((await db.getConfig())!.disciplines).toEqual(['strength'])
    engine.resetSyncEngineForTests()
  })
})
