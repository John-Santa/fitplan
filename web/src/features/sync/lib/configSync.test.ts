// F26/F27 (S15): config is merged field by field on the client before it is
// pushed, against the server copy and the last synced base. Two simulated
// devices (own modules, own in-memory IndexedDB) share one fake server.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installMemoryIdb, type MemoryIdb } from '../../../lib/testing/memoryIdb'
import type { Config, Exercise } from '../../../lib/types'
import { fakeSyncServer } from './testing/fakeSyncServer'

// Each test boots two or three devices (fresh modules each) and runs several
// syncs: well past the 5 s default on a loaded machine.
vi.setConfig({ testTimeout: 30_000 })

type Device = {
  engine: typeof import('./engine')
  syncDb: typeof import('./syncDb')
  local: typeof import('./localWrites')
  db: typeof import('../../../lib/db')
  idb: MemoryIdb
}

let server: ReturnType<typeof fakeSyncServer>
const devices: Device[] = []
let clock = 1_800_000_000_000

/** Another phone against the same fake server: fresh modules and its own
 *  in-memory IndexedDB, both opened right away so each module stays bound
 *  to it. */
async function device(): Promise<Device> {
  vi.resetModules()
  const idb = installMemoryIdb()
  const auth = await import('../../account/lib/auth')
  auth.setTokenGetter(async () => 'tok')
  const engine = await import('./engine')
  const syncDb = await import('./syncDb')
  const local = await import('./localWrites')
  const db = await import('../../../lib/db')
  local.setTrackingForTests(true)
  await db.getConfig()
  await syncDb.getMeta()
  const d = { engine, syncDb, local, db, idb }
  devices.push(d)
  return d
}

const plan = () => import('../../../lib/plan')
const configOf = (d: Device) => d.idb.dump('config', 'fitplan').get('config') as Config
const serverConfig = () => server.body('documents', 'config') as Config
const outboxOf = (d: Device) => d.idb.dump('outbox', 'magnifit-sync')

/** Edits the stored config through the app's write path at a given clock. */
async function edit(d: Device, at: number, fn: (c: Config) => Config) {
  clock = at
  await d.local.saveConfig(fn(configOf(d)))
}

/** Two phones of the same account, both synced with the same config. */
async function syncedPair(initial?: (c: Config) => Config) {
  const { DEFAULT_CONFIG } = await plan()
  const a = await device()
  await a.db.saveConfig(initial ? initial(DEFAULT_CONFIG) : DEFAULT_CONFIG)
  a.engine.setSyncUser('u1')
  await a.engine.syncNow()
  const b = await device()
  b.engine.setSyncUser('u1')
  await b.engine.syncNow()
  expect(configOf(b)).toEqual(configOf(a))
  return { a, b }
}

/** Sync attempts while the network is down: they fail and keep the outbox. */
async function offline(...ds: Device[]) {
  server.setOffline(true)
  for (const d of ds) await d.engine.syncNow()
  server.setOffline(false)
}

const checkIn = (date: string) => (c: Config): Config => ({ ...c, habitCheckIns: [...c.habitCheckIns, date].sort() })

beforeEach(() => {
  clock = 1_800_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  server = fakeSyncServer()
  vi.stubGlobal('fetch', server.fetch)
  vi.stubEnv('VITE_API_URL', 'https://api.example.test')
})

afterEach(() => {
  for (const d of devices.splice(0)) d.engine.resetSyncEngineForTests()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('config merge across devices (S15)', () => {
  it('dos cambios concurrentes a config desde dos colas simuladas; después de sincronizar, ambos están presentes', async () => {
    const { a, b } = await syncedPair()
    await edit(a, clock + 1_000, c => ({ ...c, heightCm: 180 }))
    await edit(b, clock + 2_000, c => ({
      ...c,
      intentions: c.intentions.map((it, i) => (i === 1 ? { time: '07:00', place: 'Gimnasio' } : it)) as unknown as Config['intentions'],
    }))
    await offline(a, b)

    await a.engine.syncNow()
    await b.engine.syncNow()
    await a.engine.syncNow()

    for (const c of [serverConfig(), configOf(a), configOf(b)]) {
      expect(c.heightCm).toBe(180)
      expect(c.intentions[1]).toEqual({ time: '07:00', place: 'Gimnasio' })
    }
    expect(configOf(a)).toEqual(configOf(b))
    expect(outboxOf(a).size).toBe(0)
    expect(outboxOf(b).size).toBe(0)
  })

  it.each([
    ['the later writer syncs last', false],
    ['the earlier writer syncs last', true],
  ])('Dos registros de hábito hechos sin conexión en dos dispositivos sobreviven ambos tras sincronizar (%s)', async (_label, reversed) => {
    const { a, b } = await syncedPair()
    await edit(a, clock + 1_000, checkIn('2026-11-10'))
    await edit(b, clock + 2_000, checkIn('2026-11-11'))
    await offline(a, b)

    const [first, second] = reversed ? [b, a] : [a, b]
    await first.engine.syncNow()
    await second.engine.syncNow()
    await first.engine.syncNow()

    for (const c of [serverConfig(), configOf(a), configOf(b)]) expect(c.habitCheckIns).toEqual(['2026-11-10', '2026-11-11'])
  })

  it('a check-in undone on one device stays undone while the other device logs another day', async () => {
    const { a, b } = await syncedPair(checkIn('2026-11-09'))
    await edit(a, clock + 1_000, c => ({ ...c, habitCheckIns: c.habitCheckIns.filter(d => d !== '2026-11-09') }))
    await edit(b, clock + 2_000, checkIn('2026-11-10'))
    await offline(a, b)

    await a.engine.syncNow()
    await b.engine.syncNow()
    await a.engine.syncNow()

    for (const c of [serverConfig(), configOf(a), configOf(b)]) expect(c.habitCheckIns).toEqual(['2026-11-10'])
  })

  // P11: with the losing device syncing first, the winner runs the merge and
  // the loser only sees a plain pull; it must still get the notice.
  it.each([
    ['the winner syncs first', false],
    ['the losing device syncs first (P11)', true],
  ])('both devices change the same setting: the last write wins and the losing device keeps the "esto cambió en otro dispositivo" notice (%s)', async (_label, loserFirst) => {
    const { a, b } = await syncedPair()
    await edit(a, clock + 1_000, c => ({ ...c, heightCm: 180 }))
    await edit(b, clock + 2_000, c => ({ ...c, heightCm: 185 }))
    await offline(a, b)

    const [first, second] = loserFirst ? [a, b] : [b, a]
    await first.engine.syncNow()
    await second.engine.syncNow()
    await first.engine.syncNow()

    for (const c of [serverConfig(), configOf(a), configOf(b)]) expect(c.heightCm).toBe(185)
    expect((await a.syncDb.getConfigConflict())?.fields).toEqual(['Altura'])
    expect(await b.syncDb.getConfigConflict()).toBeUndefined()
    // The conflict record travels only in the synced document: the stored
    // config (what older clients and the app read) has no such field.
    expect(Object.keys(configOf(a))).not.toContain('syncConflict')
    expect(Object.keys(configOf(b))).not.toContain('syncConflict')
    const { configConflictText } = await import('./configMerge')
    expect(configConflictText(['Altura'])).toBe('Altura: esto cambió en otro dispositivo y se conservó esa versión.')
  })

  it.each([
    ['the editing device syncs first', false],
    ['the resetting device syncs first (P9)', true],
  ])('a routine reset on one device and edited on another keeps the edit, whatever the clocks say (%s)', async (_label, loserFirst) => {
    const { ROUTINES } = await plan()
    const r = ROUTINES[0]
    const custom = (sets: number): Exercise[] => r.exercises.map((e, i) => (i === 0 ? { ...e, sets } : { ...e }))
    const { a, b } = await syncedPair(c => ({ ...c, routineExercises: { [r.id]: custom(4) } }))
    // b edits first, a resets (deletes the override) later: the edit still wins.
    await edit(b, clock + 1_000, c => ({ ...c, routineExercises: { [r.id]: custom(5) } }))
    await edit(a, clock + 2_000, c => ({ ...c, routineExercises: {} }))
    await offline(a, b)

    const [first, second] = loserFirst ? [a, b] : [b, a]
    await first.engine.syncNow()
    await second.engine.syncNow()
    await first.engine.syncNow()

    for (const c of [serverConfig(), configOf(a), configOf(b)]) expect(c.routineExercises[r.id]?.[0].sets).toBe(5)
    expect((await a.syncDb.getConfigConflict())?.fields).toEqual([`Ejercicios de ${r.name}`])
    expect(await b.syncDb.getConfigConflict()).toBeUndefined()
  })

  it('a push that comes back stale is merged with the newer server copy instead of being dropped', async () => {
    const { a } = await syncedPair()
    await edit(a, clock + 1_000, checkIn('2026-11-10'))
    // Another device writes between this device's pre-push pull and its push,
    // with a clock ahead of this one.
    const before = configOf(a)
    server.onceBeforePush(() =>
      server.seed('documents', 'config', { ...before, habitCheckIns: ['2026-11-12'] }, clock + 60_000),
    )
    await a.engine.syncNow()

    // The stale entry stays queued, the full pull merges it with the newer
    // copy and the same sync pushes the merge.
    for (const c of [serverConfig(), configOf(a)]) expect(c.habitCheckIns).toEqual(['2026-11-10', '2026-11-12'])
    expect(outboxOf(a).size).toBe(0)
    expect(a.engine.getSyncStatus()).toMatchObject({ state: 'idle', lastError: null, pending: 0 })
  })

  it('an install synced before this change (no stored base) unions the collections and stores a base', async () => {
    const { a } = await syncedPair()
    // Legacy phone: same account and data, but synced by a version that never
    // stored a base.
    const legacy = await device()
    await legacy.db.saveConfig(configOf(a))
    await legacy.syncDb.updateMeta({ userId: 'u1', cursor: Math.max(...[...server.rows.values()].map(r => r.rev)) })
    expect(await legacy.syncDb.getConfigBase()).toBeUndefined()

    await edit(a, clock + 1_000, checkIn('2026-11-10'))
    await a.engine.syncNow()
    await edit(legacy, clock + 2_000, checkIn('2026-11-11'))
    legacy.engine.setSyncUser('u1')
    await legacy.engine.syncNow()
    await a.engine.syncNow()

    for (const c of [serverConfig(), configOf(a), configOf(legacy)]) expect(c.habitCheckIns).toEqual(['2026-11-10', '2026-11-11'])
    expect((await legacy.syncDb.getConfigBase() as Config).habitCheckIns).toEqual(['2026-11-10', '2026-11-11'])
  })

  it('check-in dates are local calendar keys and keep the day the person saw (no UTC shift)', async () => {
    const tz = process.env.TZ
    process.env.TZ = 'America/Santiago'
    try {
      const { todayISO } = await import('../../../lib/calc')
      const { toggleCheckIn } = await import('../../habit/lib/habit')
      const lateNight = new Date(2026, 10, 12, 23, 30)
      expect(lateNight.toISOString().slice(0, 10)).toBe('2026-11-13')
      const { a, b } = await syncedPair()
      await edit(a, clock + 1_000, c => toggleCheckIn(c, todayISO(lateNight)))
      await edit(b, clock + 2_000, checkIn('2026-11-11'))
      await offline(a, b)
      await a.engine.syncNow()
      await b.engine.syncNow()
      await a.engine.syncNow()
      for (const c of [serverConfig(), configOf(a), configOf(b)]) expect(c.habitCheckIns).toEqual(['2026-11-11', '2026-11-12'])
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })

  it('the workout in progress stays device-only in localStorage and never reaches the merge or the server', async () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    })
    const { saveActiveDraft } = await import('../../session/lib/activeSession')
    const draft = {
      id: 'live-workout', kind: 'strength', routineId: 'dia1', date: '2026-11-12', startedAt: 1, finishedAt: null, notes: '',
      sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 10, done: true }],
    }
    saveActiveDraft(draft as never)
    const stored = storage.get('fitplan:active-session')

    const { a, b } = await syncedPair()
    await edit(a, clock + 1_000, checkIn('2026-11-10'))
    await edit(b, clock + 2_000, checkIn('2026-11-11'))
    await a.engine.syncNow()
    await b.engine.syncNow()
    await a.engine.syncNow()

    expect(storage.get('fitplan:active-session')).toBe(stored)
    expect(JSON.stringify(server.pushes)).not.toContain('live-workout')
    expect([...server.rows.keys()].some(k => k.includes('live-workout'))).toBe(false)
    for (const d of [a, b]) expect(d.idb.dump('sessions', 'fitplan').has('live-workout')).toBe(false)
  })
})

describe('behavior kept (pins)', () => {
  it('a single-device config edit is pushed as is and pulled back unchanged', async () => {
    const { a } = await syncedPair()
    await edit(a, clock + 1_000, c => ({ ...c, heightCm: 181 }))
    const entry = outboxOf(a).get('document:config') as { body: Config; updatedAt: number }
    server.pushes.length = 0
    await a.engine.syncNow()

    expect(server.pushes).toHaveLength(1)
    expect(server.pushes[0].documents).toEqual([{ kind: 'config', body: configOf(a), updatedAt: entry.updatedAt, deletedAt: null }])
    expect(server.rows.get('documents:config')?.updatedAt).toBe(entry.updatedAt)
    expect(configOf(a).heightCm).toBe(181)
    expect(outboxOf(a).size).toBe(0)
  })

  it('the plan document keeps last-write-wins as a whole (no field merge)', async () => {
    const { defaultPlanWithLegacy } = await import('../../../lib/defaultPlan')
    const { DEFAULT_CONFIG } = await plan()
    const a = await device()
    await a.db.saveConfig(DEFAULT_CONFIG)
    await a.db.savePlan(defaultPlanWithLegacy())
    a.engine.setSyncUser('u1')
    await a.engine.syncNow()
    const b = await device()
    b.engine.setSyncUser('u1')
    await b.engine.syncNow()

    const planOf = (d: Device) => d.idb.dump('config', 'fitplan').get('plan') as { name: string; tips: string[] }
    const original = planOf(a)
    clock += 1_000
    await a.local.savePlan({ ...planOf(a), name: 'Plan A' } as never)
    clock += 1_000
    await b.local.savePlan({ ...planOf(b), tips: [...planOf(b).tips, 'Tip B'] } as never)
    await a.engine.syncNow()
    await b.engine.syncNow()
    await a.engine.syncNow()

    for (const p of [server.body('documents', 'plan') as { name: string; tips: string[] }, planOf(a), planOf(b)]) {
      expect(p.name).toBe(original.name)
      expect(p.tips.at(-1)).toBe('Tip B')
    }
  })
})

describe('store edits over a merge that landed meanwhile', () => {
  it('a local edit before the push keeps the conflict record queued for the other device', async () => {
    const d = await device()
    const { DEFAULT_CONFIG } = await plan()
    await d.db.saveConfig(DEFAULT_CONFIG)
    const record = { fields: ['Altura'], lostAt: 123 }
    await d.syncDb.enqueueUpsert('document', 'config', { ...DEFAULT_CONFIG, heightCm: 185, syncConflict: record })
    await d.local.saveConfigEdit(configOf(d), checkIn('2026-11-11')(configOf(d)))

    const body = (outboxOf(d).get('document:config') as { body: Config & { syncConflict?: unknown } }).body
    expect(body.syncConflict).toEqual(record)
    expect(body.habitCheckIns).toEqual(['2026-11-11'])
  })

  it('saving an edit made on a stale in-memory config keeps what the merge added', async () => {
    const d = await device()
    const { DEFAULT_CONFIG } = await plan()
    await d.db.saveConfig(DEFAULT_CONFIG)
    const seen = configOf(d)
    // A remote merge writes a check-in after the screen read `seen`.
    await d.db.saveConfig(checkIn('2026-11-10')(seen))
    await d.local.saveConfigEdit(seen, checkIn('2026-11-11')(seen))

    expect(configOf(d).habitCheckIns).toEqual(['2026-11-10', '2026-11-11'])
    expect((outboxOf(d).get('document:config') as { body: Config }).body.habitCheckIns).toEqual(['2026-11-10', '2026-11-11'])
  })

  it('an undo made on the stale config still removes the day', async () => {
    const d = await device()
    const { DEFAULT_CONFIG } = await plan()
    await d.db.saveConfig(checkIn('2026-11-09')(DEFAULT_CONFIG))
    const seen = configOf(d)
    await d.db.saveConfig(checkIn('2026-11-10')(seen))
    await d.local.saveConfigEdit(seen, { ...seen, habitCheckIns: [] })

    expect(configOf(d).habitCheckIns).toEqual(['2026-11-10'])
  })
})

// S10: a config body from an older client carries neither disciplines nor
// swimWeeklyTarget; on both pull paths the local values are kept.
describe('older-client config body without the new fields', () => {
  async function pushedDevice() {
    const { DEFAULT_CONFIG } = await plan()
    const a = await device()
    await a.db.saveConfig({ ...DEFAULT_CONFIG, disciplines: ['strength', 'swim'], swimWeeklyTarget: 4 })
    a.engine.setSyncUser('u1')
    await a.engine.syncNow()
    return a
  }
  /** The device's config as an older client would push it. */
  const olderBody = (a: Device, patch: Partial<Config>) => {
    const o = structuredClone(configOf(a)) as Partial<Config>
    delete o.disciplines
    delete o.swimWeeklyTarget
    return { ...o, ...patch }
  }

  it('with a local edit queued, keeps the local list and target here and on the server (B1)', async () => {
    const a = await pushedDevice()
    clock += 1000
    await a.local.saveConfig({ ...configOf(a), habitCheckIns: ['2026-11-12'] })
    clock += 10000
    server.seed('documents', 'config', olderBody(a, { heightCm: 180, habitCheckIns: [] }), clock)

    await a.engine.syncNow()
    await a.engine.syncNow()

    expect(configOf(a).disciplines).toEqual(['strength', 'swim'])
    expect(configOf(a).swimWeeklyTarget).toBe(4)
    expect(configOf(a).heightCm).toBe(180)
    expect(configOf(a).habitCheckIns).toEqual(['2026-11-12'])
    expect(serverConfig().disciplines).toEqual(['strength', 'swim'])
    expect(serverConfig().swimWeeklyTarget).toBe(4)
    expect(await a.syncDb.getConfigConflict()).toBeUndefined()
  })

  it('with nothing queued, keeps the local list and target and applies the rest (B2)', async () => {
    const a = await pushedDevice()
    clock += 10000
    server.seed('documents', 'config', olderBody(a, { heightCm: 180 }), clock)

    await a.engine.syncNow()

    expect(configOf(a).heightCm).toBe(180)
    expect(configOf(a).disciplines).toEqual(['strength', 'swim'])
    expect(configOf(a).swimWeeklyTarget).toBe(4)
  })

  it('a body from this build that changes the target and the list is applied as a normal remote change', async () => {
    const a = await pushedDevice()
    clock += 10000
    server.seed('documents', 'config', { ...configOf(a), swimWeeklyTarget: 5, disciplines: ['strength'] }, clock)

    await a.engine.syncNow()

    expect(configOf(a).swimWeeklyTarget).toBe(5)
    expect(configOf(a).disciplines).toEqual(['strength'])
  })

  it('after an older-client pull, a queued edit still loses the target and list to a later body from this build', async () => {
    const a = await pushedDevice()
    clock += 10000
    server.seed('documents', 'config', olderBody(a, { heightCm: 180 }), clock)
    await a.engine.syncNow()
    clock += 1000
    await a.local.saveConfig({ ...configOf(a), habitCheckIns: ['2026-11-12'] })
    clock += 10000
    server.seed('documents', 'config', { ...configOf(a), habitCheckIns: [], swimWeeklyTarget: 5, disciplines: ['strength'] }, clock)

    await a.engine.syncNow()
    await a.engine.syncNow()

    expect(configOf(a).swimWeeklyTarget).toBe(5)
    expect(configOf(a).disciplines).toEqual(['strength'])
    expect(configOf(a).habitCheckIns).toEqual(['2026-11-12'])
  })
})
