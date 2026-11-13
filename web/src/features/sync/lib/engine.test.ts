// Motor de sincronización sobre IndexedDB en memoria y un servidor falso que
// imita /v1/sync (rev monotónico, última escritura gana, campos estrictos).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installMemoryIdb, type MemoryIdb } from '../../../lib/testing/memoryIdb'

type Coll = 'documents' | 'sessions' | 'measurements' | 'exerciseMeta'
const KEY_FIELD: Record<Coll, string> = { documents: 'kind', sessions: 'id', measurements: 'date', exerciseMeta: 'exerciseId' }
const COLLS = Object.keys(KEY_FIELD) as Coll[]

type Row = { coll: Coll; key: string; body: unknown; updatedAt: number; deletedAt: number | null; rev: number }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function fakeServer(pageSize = 500) {
  let rev = 0
  const rows = new Map<string, Row>()
  const pushes: Record<Coll, Record<string, unknown>[]>[] = []
  let active = 0
  let maxActive = 0
  let offline = false
  // Cuenta eliminada (DELETE /v1/me): la API responde 410 a todo /v1/sync.
  let gone = false
  let failWith: number | null = null
  let delay = 2

  function seed(coll: Coll, key: string, body: unknown, updatedAt = 1000, deletedAt: number | null = null) {
    rows.set(`${coll}:${key}`, { coll, key, body, updatedAt, deletedAt, rev: ++rev })
  }

  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (offline) throw new TypeError('Failed to fetch')
    if (gone) return json({ type: 'about:blank', title: 'Gone', status: 410, detail: 'account deleted' }, 410)
    active++
    maxActive = Math.max(maxActive, active)
    try {
      await new Promise(r => setTimeout(r, delay))
      if (failWith) return json({ detail: `fake ${failWith}` }, failWith)
      if (init?.method === 'POST') {
        const cs = JSON.parse(String(init.body)) as Record<Coll, Record<string, unknown>[]>
        pushes.push(cs)
        // Como la API real: un NUL en cualquier texto rechaza el lote entero.
        if (String(init.body).includes('\\u0000')) return json({ error: 'body contains NUL' }, 400)
        if (Object.keys(cs).some(k => !COLLS.includes(k as Coll))) return json({ error: 'unknown field' }, 400)
        const out: Record<string, unknown[]> = {}
        for (const coll of COLLS) {
          out[coll] = (cs[coll] ?? []).map(item => {
            const allowed = [KEY_FIELD[coll], 'body', 'updatedAt', 'deletedAt']
            if (Object.keys(item).some(k => !allowed.includes(k))) throw new Error(`unknown field in ${coll}`)
            const key = String(item[KEY_FIELD[coll]])
            const cur = rows.get(`${coll}:${key}`)
            if (cur && cur.updatedAt > (item.updatedAt as number)) return { key, status: 'stale', rev: 0 }
            seed(coll, key, item.body, item.updatedAt as number, item.deletedAt as number | null)
            return { key, status: 'applied', rev }
          })
        }
        return json(out)
      }
      const u = new URL(url)
      const since = Number(u.searchParams.get('since'))
      const limit = Math.min(Number(u.searchParams.get('limit')), pageSize)
      const changed = [...rows.values()].filter(r => r.rev > since).sort((a, b) => a.rev - b.rev)
      const page = changed.slice(0, limit)
      const cs: Record<string, unknown> = {
        cursor: page.length ? page[page.length - 1].rev : since,
        hasMore: changed.length > limit,
      }
      for (const coll of COLLS) {
        cs[coll] = page
          .filter(r => r.coll === coll)
          .map(r => ({ [KEY_FIELD[coll]]: r.key, body: r.body, updatedAt: r.updatedAt, deletedAt: r.deletedAt, rev: r.rev }))
      }
      return json(cs)
    } finally {
      active--
    }
  })

  return {
    fetch,
    rows,
    pushes,
    seed,
    get maxActive() { return maxActive },
    setOffline(v: boolean) { offline = v },
    setGone(v: boolean) { gone = v },
    /** Todas las respuestas pasan a ser este estado HTTP (null: normal). */
    setFailWith(v: number | null) { failWith = v },
    setDelay(ms: number) { delay = ms },
    gets: () => fetch.mock.calls.filter(c => !c[1] || c[1].method !== 'POST').length,
  }
}

const session = (id: string, notes = '', date = '2026-11-01') => ({
  id, kind: 'strength', routineId: 'dia1', date, startedAt: 1, finishedAt: 2, notes,
  sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 10, done: true }],
})
const measurement = (date: string, weight: number) => ({ date, weight })

let idb: MemoryIdb
let server: ReturnType<typeof fakeServer>

async function fresh(pageSize?: number) {
  vi.resetModules()
  idb = installMemoryIdb()
  server = fakeServer(pageSize)
  vi.stubGlobal('fetch', server.fetch)
  vi.stubEnv('VITE_API_URL', 'https://api.example.test')
  const auth = await import('../../account/lib/auth')
  auth.setTokenGetter(async () => 'tok')
  const engine = await import('./engine')
  const syncDb = await import('./syncDb')
  const local = await import('./localWrites')
  const db = await import('../../../lib/db')
  local.setTrackingForTests(true)
  return { engine, syncDb, local, db }
}

let mods: Awaited<ReturnType<typeof fresh>>

/** Otro teléfono contra el mismo servidor falso: módulos nuevos y su propio
 *  IndexedDB en memoria. Abre las dos bases de inmediato para que cada módulo
 *  quede atado a su IndexedDB aunque después se instale otro. */
type Device = Awaited<ReturnType<typeof fresh>> & { idb: MemoryIdb }
const devices: Device[] = []
async function device(): Promise<Device> {
  vi.resetModules()
  const memory = installMemoryIdb()
  const auth = await import('../../account/lib/auth')
  auth.setTokenGetter(async () => 'tok')
  const engine = await import('./engine')
  const syncDb = await import('./syncDb')
  const local = await import('./localWrites')
  const db = await import('../../../lib/db')
  local.setTrackingForTests(true)
  await db.getConfig()
  await syncDb.getMeta()
  const d = { engine, syncDb, local, db, idb: memory }
  devices.push(d)
  return d
}

/** Lo mismo que siembra store.tsx en la primera apertura. */
async function seedFirstOpen(d: Device) {
  const { BASELINE, DEFAULT_CONFIG } = await import('../../../lib/plan')
  const { planMigration } = await import('../../../lib/migration')
  await d.db.saveConfig(DEFAULT_CONFIG)
  await d.db.saveMeasurement(BASELINE)
  // applyPlanMigration usa el db.ts del último teléfono cargado: se replica
  // con su parte pura.
  const r = planMigration(undefined, DEFAULT_CONFIG)
  if (r.config) await d.db.saveConfig(r.config)
  if (r.plan) await d.db.savePlan(r.plan)
}

/** Datos de 'fitplan' comparables entre teléfonos. */
function fitplanState(d: Device) {
  const config = d.idb.dump('config', 'fitplan')
  const sorted = (m: Map<unknown, unknown>) => [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  return {
    sessions: sorted(d.idb.dump('sessions', 'fitplan')),
    measurements: sorted(d.idb.dump('measurements', 'fitplan')),
    exerciseMeta: sorted(d.idb.dump('exerciseMeta', 'fitplan')),
    config: config.get('config'),
    plan: config.get('plan'),
  }
}

const liveServerSessions = () =>
  [...server.rows.values()].filter(r => r.coll === 'sessions' && r.deletedAt == null).map(r => r.key).sort()
const outbox = () => idb.dump('outbox', 'magnifit-sync')
const sessionsOnDisk = () => idb.dump('sessions', 'fitplan')

beforeEach(async () => {
  mods = await fresh()
})
afterEach(() => {
  mods.engine.resetSyncEngineForTests()
  for (const d of devices.splice(0)) d.engine.resetSyncEngineForTests()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/** Usuario ya sincronizado antes (sin primer ingreso). */
async function asKnownUser(uid = 'u1') {
  await mods.syncDb.updateMeta({ userId: uid })
  mods.engine.setSyncUser(uid)
}

describe('outbox', () => {
  it('coalesce por llave: dos escrituras dejan una sola entrada con lo último', async () => {
    await mods.local.saveSession(session('s1', 'a') as never)
    await mods.local.saveSession(session('s1', 'b') as never)
    const entries = [...outbox().values()] as { key: string; body: { notes: string }; deletedAt: unknown }[]
    expect(entries).toHaveLength(1)
    expect(outbox().has('session:s1')).toBe(true)
    expect(entries[0].body.notes).toBe('b')
    expect(entries[0].deletedAt).toBeNull()
  })

  it('un borrado guarda la lápida con el último body conocido (kind y date)', async () => {
    await mods.db.saveSession(session('s1', 'x') as never)
    await mods.local.deleteSession('s1')
    const e = outbox().get('session:s1') as { body: { kind: string; date: string }; deletedAt: number; updatedAt: number }
    expect(e.deletedAt).toBe(e.updatedAt)
    expect(e.body.kind).toBe('strength')
    expect(e.body.date).toBe('2026-11-01')
    expect(sessionsOnDisk().has('s1')).toBe(false)

    await mods.local.saveMeasurement(measurement('2026-11-02', 80) as never)
    await mods.local.deleteMeasurement('2026-11-02')
    const m = outbox().get('measurement:2026-11-02') as { body: { weight: number }; deletedAt: number }
    expect(m.deletedAt).not.toBeNull()
    expect(m.body.weight).toBe(80)
  })

  it('con el registro desactivado (login deshabilitado) no encola nada', async () => {
    mods.local.setTrackingForTests(false)
    await mods.local.saveSession(session('s1') as never)
    expect(outbox().size).toBe(0)
    expect(sessionsOnDisk().has('s1')).toBe(true)
  })
})

describe('subida', () => {
  it('manda solo los campos del contrato y quita applied y stale del outbox', async () => {
    await asKnownUser()
    server.seed('measurements', '2026-11-03', measurement('2026-11-03', 90), Date.now() + 60_000)
    await mods.local.saveSession(session('s1') as never)
    await mods.local.saveMeasurement(measurement('2026-11-03', 70) as never)
    await mods.engine.syncNow()
    expect(server.pushes[0].sessions[0]).toEqual({
      id: 's1', body: expect.objectContaining({ id: 's1' }), updatedAt: expect.any(Number), deletedAt: null,
    })
    expect(outbox().size).toBe(0)
    expect(server.rows.get('sessions:s1')?.body).toMatchObject({ id: 's1' })
    // stale: el servidor tenía algo más nuevo y la bajada lo trae.
    expect((idb.dump('measurements', 'fitplan').get('2026-11-03') as { weight: number }).weight).toBe(90)
    expect(mods.engine.getSyncStatus()).toMatchObject({ state: 'idle', pending: 0, lastError: null })
  })

  it('parte la subida en lotes de máximo 200 registros', async () => {
    await asKnownUser()
    for (let i = 0; i < 205; i++) await mods.syncDb.enqueueUpsert('exerciseMeta', `e${i}`, { exerciseId: `e${i}`, seat: '', note: '' })
    await mods.engine.syncNow()
    expect(server.pushes.map(p => p.exerciseMeta.length)).toEqual([200, 5])
    expect(outbox().size).toBe(0)
  })
})

describe('bajada', () => {
  it('aplica lo remoto, salta llaves pendientes, aplica lápidas y guarda el cursor por página', async () => {
    mods = await fresh(2)
    await asKnownUser()
    await mods.db.saveSession(session('gone') as never)
    server.seed('sessions', 'r1', session('r1', 'remote'))
    server.seed('measurements', '2026-11-04', measurement('2026-11-04', 77))
    server.seed('sessions', 'gone', session('gone'), 2000, 2000)
    server.seed('documents', 'config', { heightCm: 181 })
    await mods.engine.syncNow()

    const disk = sessionsOnDisk()
    expect((disk.get('r1') as { notes: string }).notes).toBe('remote')
    expect(disk.has('gone')).toBe(false)
    expect((idb.dump('measurements', 'fitplan').get('2026-11-04') as { weight: number }).weight).toBe(77)
    expect((idb.dump('config', 'fitplan').get('config') as { heightCm: number }).heightCm).toBe(181)
    expect((await mods.syncDb.getMeta()).cursor).toBe(4)
    const urls = server.fetch.mock.calls.map(c => String(c[0]))
    expect(urls.filter(u => u.includes('since=')).map(u => new URL(u).searchParams.get('since'))).toEqual(['0', '2'])
    // Sin eco: nada de lo bajado volvió al outbox.
    expect(outbox().size).toBe(0)
  })

  it('si falla una página, conserva el cursor de las ya aplicadas', async () => {
    mods = await fresh(2)
    await asKnownUser()
    for (const id of ['a', 'b', 'c', 'd']) server.seed('sessions', id, session(id))
    const real = server.fetch.getMockImplementation()!
    let gets = 0
    server.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (!init?.method && ++gets === 2) throw new TypeError('Failed to fetch')
      return real(url, init)
    })
    await mods.engine.syncNow()
    expect((await mods.syncDb.getMeta()).cursor).toBe(2)
    expect([...sessionsOnDisk().keys()].sort()).toEqual(['a', 'b'])
  })

  it('una llave pendiente que sigue en el outbox no se pisa con la copia remota', async () => {
    await asKnownUser()
    server.seed('sessions', 'p', session('p', 'remote'))
    await mods.db.saveSession(session('p', 'local') as never)
    // Simula un cambio local hecho durante la subida: la entrada sigue ahí.
    server.fetch.mockImplementationOnce(async () => json({ documents: [], sessions: [], measurements: [], exerciseMeta: [] }))
    await mods.syncDb.enqueueUpsert('session', 'p', session('p', 'local'))
    await mods.engine.syncNow()
    expect((sessionsOnDisk().get('p') as { notes: string }).notes).toBe('local')
    expect(outbox().has('session:p')).toBe(true)
  })

  it('el cursor guardado hace que la próxima bajada pida desde ahí', async () => {
    await asKnownUser()
    server.seed('sessions', 'a', session('a'))
    await mods.engine.syncNow()
    server.fetch.mockClear()
    await mods.engine.syncNow()
    expect(String(server.fetch.mock.calls[0][0])).toContain('since=1&')
  })

  it('llama al recargador de la tienda solo si la bajada cambió algo', async () => {
    await asKnownUser()
    const reload = vi.fn()
    mods.engine.setRemoteChangeHandler(reload)
    await mods.engine.syncNow()
    expect(reload).not.toHaveBeenCalled()
    server.seed('sessions', 'a', session('a'))
    await mods.engine.syncNow()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('concurrencia y errores', () => {
  it('una sola sincronización a la vez', async () => {
    await asKnownUser()
    await mods.local.saveSession(session('s1') as never)
    const a = mods.engine.syncNow()
    const b = mods.engine.syncNow()
    expect(b).toBe(a)
    await Promise.all([a, b, mods.engine.syncNow()])
    expect(server.maxActive).toBe(1)
  })

  it('sin red conserva el outbox y deja lastError', async () => {
    await asKnownUser()
    await mods.local.saveSession(session('s1') as never)
    server.setOffline(true)
    await mods.engine.syncNow()
    expect(outbox().has('session:s1')).toBe(true)
    expect(mods.engine.getSyncStatus()).toMatchObject({ state: 'offline', lastError: mods.engine.OFFLINE_ERROR, pending: 1 })
    expect((await mods.syncDb.getMeta()).lastError).toBe(mods.engine.OFFLINE_ERROR)

    server.setOffline(false)
    await mods.engine.syncNow()
    expect(outbox().size).toBe(0)
    expect(mods.engine.getSyncStatus()).toMatchObject({ state: 'idle', lastError: null })
  })

  it('un 429 es transitorio: conserva el outbox y reintenta tras Retry-After', async () => {
    await asKnownUser()
    await mods.local.saveSession(session('s1') as never)
    const limited = (retryAfter: string) =>
      new Response(JSON.stringify({ type: 'about:blank', title: 'Too Many Requests', status: 429, detail: 'too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/problem+json', 'Retry-After': retryAfter },
      })
    // Retry delays only: the cold-start timer (COLD_START_MS) of every run is not a retry.
    const delays = () =>
      timers.mock.calls.map(c => c[1]).filter(d => typeof d === 'number' && d >= 1_000 && d !== mods.engine.COLD_START_MS)
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const real = server.fetch.getMockImplementation()!
    server.fetch.mockImplementationOnce(async () => limited('42'))
    await mods.engine.syncNow()
    expect(outbox().has('session:s1')).toBe(true)
    expect(mods.engine.getSyncStatus()).toMatchObject({ state: 'error', pending: 1 })
    expect(mods.engine.getSyncStatus().lastError).toContain('42')
    // Pide 42 s: gana a los 5 s del retroceso base.
    expect(delays()).toEqual([42_000])

    // Un Retry-After corto no acorta el retroceso exponencial.
    timers.mockClear()
    server.fetch.mockImplementation(real)
    server.fetch.mockImplementationOnce(async () => limited('1'))
    await mods.engine.syncNow()
    expect(delays()).toEqual([10_000])
    timers.mockRestore()

    // Pasada la espera, la sincronización normal sube lo pendiente.
    await mods.engine.syncNow()
    expect(outbox().size).toBe(0)
    expect(mods.engine.getSyncStatus()).toMatchObject({ state: 'idle', lastError: null })
  })

  it('ClerkOfflineError cuenta como sin conexión', async () => {
    await asKnownUser()
    const auth = await import('../../account/lib/auth')
    auth.setTokenGetter(async () => {
      throw Object.assign(new Error('offline'), { code: 'clerk_offline' })
    })
    await mods.engine.syncNow()
    expect(mods.engine.getSyncStatus().state).toBe('offline')
  })

  it('sin usuario no toca la red', async () => {
    await mods.local.saveSession(session('s1') as never)
    await mods.engine.syncNow()
    expect(server.fetch).not.toHaveBeenCalled()
    expect(outbox().size).toBe(1)
  })
})

describe('cuenta eliminada (S4)', () => {
  it('un 410 al subir borra la copia local y el estado de sincronización, y deja de sincronizar', async () => {
    await asKnownUser()
    await mods.local.saveSession(session('s1') as never)
    await mods.local.saveMeasurement(measurement('2026-11-01', 80) as never)
    server.setGone(true)
    await mods.engine.syncNow()

    expect(sessionsOnDisk().size).toBe(0)
    expect(idb.dump('measurements', 'fitplan').size).toBe(0)
    expect(outbox().size).toBe(0)
    expect((await mods.syncDb.getMeta()).userId).toBeNull()
    expect(mods.engine.getSyncStatus()).toMatchObject({
      state: 'blocked', lastError: mods.engine.ACCOUNT_DELETED_ERROR, pending: 0,
    })
    // Sin reintentos: la siguiente vuelta no toca la red.
    const calls = server.fetch.mock.calls.length
    await mods.engine.syncNow()
    expect(server.fetch.mock.calls.length).toBe(calls)
  })

  it('un 410 al bajar también borra la copia local y recarga la tienda', async () => {
    await asKnownUser()
    await mods.db.saveSession(session('s1') as never)
    const reload = vi.fn()
    mods.engine.setRemoteChangeHandler(reload)
    server.setGone(true)
    await mods.engine.syncNow()

    expect(sessionsOnDisk().size).toBe(0)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(mods.engine.getSyncStatus().state).toBe('blocked')
  })

  it('otros errores del servidor no borran nada', async () => {
    await asKnownUser()
    await mods.local.saveSession(session('s1') as never)
    server.fetch.mockImplementationOnce(async () => json({ detail: 'boom' }, 500))
    await mods.engine.syncNow()

    expect(sessionsOnDisk().size).toBe(1)
    expect(outbox().has('session:s1')).toBe(true)
    expect(mods.engine.getSyncStatus().state).toBe('error')
  })
})

describe('primer ingreso (S7)', () => {
  it('sube lo solo-local, gana el servidor en llaves compartidas y no borra nada local', async () => {
    // Local: s-local (solo aquí), s-both (en ambos), medida, plan y config.
    await mods.db.saveSession(session('s-local', 'local') as never)
    await mods.db.saveSession(session('s-both', 'local') as never)
    await mods.db.saveSession(session('s-dead', 'local') as never)
    await mods.db.saveMeasurement(measurement('2026-11-05', 81) as never)
    const { DEFAULT_CONFIG } = await import('../../../lib/plan')
    await mods.db.saveConfig({ ...DEFAULT_CONFIG, heightCm: 170 })
    // Remoto: s-both más nuevo, s-dead como lápida y config.
    server.seed('sessions', 's-both', session('s-both', 'server'))
    server.seed('sessions', 's-dead', session('s-dead'), 1000, 1000)
    server.seed('documents', 'config', { ...DEFAULT_CONFIG, heightCm: 190 })

    mods.engine.setSyncUser('u1')
    const before = Date.now()
    await mods.engine.syncNow()

    const disk = sessionsOnDisk()
    expect((disk.get('s-both') as { notes: string }).notes).toBe('server')
    expect(disk.has('s-local')).toBe(true)
    expect(disk.has('s-dead')).toBe(true)
    expect((idb.dump('config', 'fitplan').get('config') as { heightCm: number }).heightCm).toBe(190)

    const pushed = server.pushes.flatMap(p => p.sessions.map(s => s.id))
    expect(pushed.sort()).toEqual(['s-dead', 's-local'])
    expect(server.pushes[0].sessions[0].updatedAt as number).toBeGreaterThanOrEqual(before)
    expect(server.pushes.flatMap(p => p.measurements.map(m => m.date))).toEqual(['2026-11-05'])
    expect(server.pushes.flatMap(p => p.documents.map(d => d.kind))).toEqual([])
    expect(server.rows.get('sessions:s-dead')?.deletedAt).toBeNull()
    expect((await mods.syncDb.getMeta()).userId).toBe('u1')
    expect(outbox().size).toBe(0)
  })

  it('con el servidor vacío sube todo, incluidos plan y config', async () => {
    await mods.db.saveSession(session('s1') as never)
    const { DEFAULT_CONFIG } = await import('../../../lib/plan')
    const { defaultPlanWithLegacy } = await import('../../../lib/defaultPlan')
    await mods.db.saveConfig(DEFAULT_CONFIG)
    await mods.db.savePlan(defaultPlanWithLegacy())
    mods.engine.setSyncUser('u1')
    await mods.engine.syncNow()
    expect(server.rows.has('sessions:s1')).toBe(true)
    expect(server.rows.has('documents:config')).toBe(true)
    expect(server.rows.has('documents:plan')).toBe(true)
  })

  it('otra cuenta en el mismo teléfono: no mezcla, conserva lo local y avisa', async () => {
    await mods.db.saveSession(session('s1') as never)
    await mods.local.saveSession(session('s2') as never)
    await mods.syncDb.updateMeta({ userId: 'u1' })
    mods.engine.setSyncUser('u2')
    await mods.engine.syncNow()
    expect(server.fetch).not.toHaveBeenCalled()
    expect(mods.engine.getSyncStatus()).toMatchObject({ state: 'blocked', lastError: mods.engine.OTHER_ACCOUNT_ERROR })
    expect(mods.engine.OTHER_ACCOUNT_ERROR).toMatch(/^Esta app tiene datos de otra cuenta/)
    expect((await mods.syncDb.getMeta()).userId).toBe('u1')
    expect(sessionsOnDisk().size).toBe(2)
    expect(outbox().has('session:s2')).toBe(true)

    // De vuelta con la cuenta original, sincroniza normal.
    mods.engine.setSyncUser('u1')
    await mods.engine.syncNow()
    expect(server.rows.has('sessions:s2')).toBe(true)
  })
})

describe('primer ingreso con semillas (B1)', () => {
  it('el teléfono viejo con plan, config y medida propios no los pierde ante las semillas de uno nuevo', async () => {
    const fresh1 = await device()
    await seedFirstOpen(fresh1)
    fresh1.engine.setSyncUser('u1')
    await fresh1.engine.syncNow()
    expect(server.rows.has('documents:plan')).toBe(true)

    const old = await device()
    await seedFirstOpen(old)
    const { BASELINE } = await import('../../../lib/plan')
    const cfg = old.idb.dump('config', 'fitplan').get('config') as Record<string, unknown>
    const plan = old.idb.dump('config', 'fitplan').get('plan') as Record<string, unknown>
    await old.db.saveConfig({ ...cfg, heightCm: 181 } as never)
    await old.db.savePlan({ ...plan, name: 'Mi plan' } as never)
    await old.db.saveMeasurement({ ...BASELINE, weight: 79 } as never)
    old.engine.setSyncUser('u1')
    await old.engine.syncNow()

    const mine = fitplanState(old)
    expect((mine.config as { heightCm: number }).heightCm).toBe(181)
    expect((mine.plan as { name: string }).name).toBe('Mi plan')
    expect((old.idb.dump('measurements', 'fitplan').get(BASELINE.date) as { weight: number }).weight).toBe(79)
    expect((server.rows.get('documents:config')?.body as { heightCm: number }).heightCm).toBe(181)
    expect((server.rows.get('documents:plan')?.body as { name: string }).name).toBe('Mi plan')
    expect((server.rows.get(`measurements:${BASELINE.date}`)?.body as { weight: number }).weight).toBe(79)
    expect(await old.syncDb.getPreBootstrapBackup()).toBeUndefined()
    expect(old.idb.dump('outbox', 'magnifit-sync').size).toBe(0)

    // El nuevo recibe lo del viejo, y un tercero recién instalado también.
    await fresh1.engine.syncNow()
    expect(fitplanState(fresh1)).toEqual(mine)
    const third = await device()
    await seedFirstOpen(third)
    third.engine.setSyncUser('u1')
    await third.engine.syncNow()
    expect(fitplanState(third)).toEqual(mine)
    expect(await third.syncDb.getPreBootstrapBackup()).toBeUndefined()
  })

  it('si ambos lados difieren de la semilla gana el servidor, pero antes guarda una copia de todo lo local', async () => {
    const { BASELINE, DEFAULT_CONFIG } = await import('../../../lib/plan')
    server.seed('documents', 'config', { ...DEFAULT_CONFIG, heightCm: 190 })
    server.seed('measurements', BASELINE.date, { ...BASELINE, weight: 82 })
    const d = await device()
    await seedFirstOpen(d)
    await d.db.saveConfig({ ...DEFAULT_CONFIG, heightCm: 170 })
    await d.db.saveMeasurement({ ...BASELINE, weight: 80 } as never)
    await d.db.saveSession(session('mine') as never)
    d.engine.setSyncUser('u1')
    const before = Date.now()
    await d.engine.syncNow()

    expect((d.idb.dump('config', 'fitplan').get('config') as { heightCm: number }).heightCm).toBe(190)
    expect((d.idb.dump('measurements', 'fitplan').get(BASELINE.date) as { weight: number }).weight).toBe(82)
    const saved = await d.syncDb.getPreBootstrapBackup()
    expect(saved?.savedAt).toBeGreaterThanOrEqual(before)
    expect(saved?.backup).toMatchObject({ app: 'fitplan', version: 3, config: { heightCm: 170 } })
    expect(saved?.backup.measurements.find(m => m.date === BASELINE.date)?.weight).toBe(80)
    expect(saved?.backup.sessions.map(s => s.id)).toEqual(['mine'])
    expect(d.engine.getSyncStatus().backupAt).toBe(saved?.savedAt)
    // Sesiones: unión.
    expect(liveServerSessions()).toEqual(['mine'])
  })
})

describe('convergencia (B2, B3, A1)', () => {
  it('C3: con un reloj adelantado, el stale vuelve a bajar todo y ambos teléfonos convergen', async () => {
    const { DEFAULT_CONFIG } = await import('../../../lib/plan')
    const a = await device()
    const b = await device()
    a.engine.setSyncUser('u1')
    b.engine.setSyncUser('u1')
    await a.engine.syncNow()
    await b.engine.syncNow()
    const t = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(t + 3 * 60_000)
    await a.local.saveConfig({ ...DEFAULT_CONFIG, heightCm: 170 })
    await a.engine.syncNow()
    clock.mockReturnValue(t)
    await b.engine.syncNow()
    clock.mockReturnValue(t + 60_000)
    await b.local.saveConfig({ ...DEFAULT_CONFIG, heightCm: 185 })
    await b.engine.syncNow()
    clock.mockRestore()

    expect((server.rows.get('documents:config')?.body as { heightCm: number }).heightCm).toBe(170)
    expect((fitplanState(b).config as { heightCm: number }).heightCm).toBe(170)
    await a.engine.syncNow()
    expect(fitplanState(b)).toEqual(fitplanState(a))
    expect(b.engine.getSyncStatus()).toMatchObject({ state: 'idle', lastError: null, pending: 0, rejected: 0 })
  })

  it('C7: restaurar un respaldo combina con la cuenta y vuelve a bajar lo que falta', async () => {
    const d = await device()
    d.engine.setSyncUser('u1')
    await d.local.saveSession(session('old') as never)
    await d.engine.syncNow()
    const backup = await d.db.exportBackup()
    await d.local.saveSession(session('newer') as never)
    await d.engine.syncNow()

    await d.db.importBackup(backup, 'replace')
    await d.engine.enqueueAllLocalChanges()
    await d.engine.syncNow()

    expect([...d.idb.dump('sessions', 'fitplan').keys()].sort()).toEqual(['newer', 'old'])
    expect(liveServerSessions()).toEqual(['newer', 'old'])
    expect((await d.syncDb.getMeta()).fullPullAt).toBeNull()
  })

  it('C6: un registro rechazado no bloquea el resto ni la bajada', async () => {
    const a = await device()
    const b = await device()
    a.engine.setSyncUser('u1')
    b.engine.setSyncUser('u1')
    await a.engine.syncNow()
    await b.engine.syncNow()
    await b.local.saveSession(session('fromB') as never)
    await b.engine.syncNow()

    await a.local.saveSession(session('bad', 'x\u0000y') as never)
    await a.local.saveSession(session('good') as never)
    await a.engine.syncNow()

    expect(liveServerSessions()).toEqual(['fromB', 'good'])
    expect(a.idb.dump('sessions', 'fitplan').has('fromB')).toBe(true)
    expect(a.idb.dump('outbox', 'magnifit-sync').size).toBe(0)
    const rejected = a.idb.dump('rejected', 'magnifit-sync')
    expect([...rejected.keys()]).toEqual(['session:bad'])
    expect((rejected.get('session:bad') as { error: string }).error).toBe('body contains NUL')
    expect(a.engine.getSyncStatus()).toMatchObject({ state: 'idle', lastError: null, rejected: 1, rejectedError: 'body contains NUL' })

    // Corregido el registro, se sube y deja de figurar como rechazado.
    await a.local.saveSession(session('bad', 'ok') as never)
    await a.engine.syncNow()
    expect(liveServerSessions()).toEqual(['bad', 'fromB', 'good'])
    expect(a.engine.getSyncStatus().rejected).toBe(0)
  })
})

/** Intercepta los temporizadores largos del motor (reintento 5 s+, debounce
 *  3 s, arranque en frío 4 s) para verlos y dispararlos a mano; los cortos
 *  (IndexedDB y servidor falsos) siguen siendo reales. */
function captureEngineTimers() {
  const real = globalThis.setTimeout
  const scheduled: { fn: () => void; ms: number; cleared: boolean }[] = []
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
    if ((ms ?? 0) < 1000) return real(fn, ms)
    const entry = { fn, ms: ms as number, cleared: false }
    scheduled.push(entry)
    return entry as never
  }) as never)
  vi.spyOn(globalThis, 'clearTimeout').mockImplementation(((t: unknown) => {
    const e = scheduled.find(x => x === t)
    if (e) e.cleared = true
  }) as never)
  return {
    /** Temporizadores largos vivos (programados y no cancelados). */
    live: () => scheduled.filter(e => !e.cleared),
    fire: (ms: number) => {
      const e = scheduled.find(x => x.ms === ms && !x.cleared)
      if (!e) throw new Error(`no hay temporizador de ${ms} ms`)
      e.cleared = true
      e.fn()
    },
  }
}

describe('reintentos y estados de error (F23)', () => {
  it('sin conexión: programa un reintento y se recupera al volver la red', async () => {
    const timers = captureEngineTimers()
    await asKnownUser()
    await mods.local.saveSession(session('s1') as never)
    server.setOffline(true)
    await mods.engine.syncNow()
    expect(mods.engine.getSyncStatus().state).toBe('offline')
    expect(timers.live().map(t => t.ms)).toContain(5_000)
    server.setOffline(false)
    timers.fire(5_000)
    await vi.waitFor(() => expect(mods.engine.getSyncStatus().state).toBe('idle'))
    expect(outbox().size).toBe(0)
  })

  it('error genérico (500): queda en error con el mensaje, conserva el outbox y se reintenta', async () => {
    const timers = captureEngineTimers()
    await asKnownUser()
    await mods.local.saveSession(session('s1') as never)
    server.setFailWith(500)
    await mods.engine.syncNow()
    expect(mods.engine.getSyncStatus()).toMatchObject({ state: 'error', lastError: 'No se pudo sincronizar: fake 500', pending: 1 })
    expect(timers.live().map(t => t.ms)).toContain(5_000)
    server.setFailWith(null)
    timers.fire(5_000)
    await vi.waitFor(() => expect(mods.engine.getSyncStatus().state).toBe('idle'))
    expect(outbox().size).toBe(0)
  })

  it('un 401 pasa a auth_expired: no programa reintentos y conserva el outbox', async () => {
    const timers = captureEngineTimers()
    await asKnownUser()
    await mods.local.saveSession(session('s1') as never)
    // Quita el debounce de la escritura: solo importa lo que programa el 401.
    for (const t of timers.live()) t.cleared = true
    server.setFailWith(401)
    await mods.engine.syncNow()
    expect(mods.engine.getSyncStatus()).toMatchObject({ state: 'auth_expired', pending: 1, lastError: mods.engine.AUTH_EXPIRED_ERROR })
    expect(mods.engine.AUTH_EXPIRED_ERROR).toBe('Tu sesión expiró, vuelve a iniciar sesión')
    expect((await mods.syncDb.getMeta()).lastError).toBe(mods.engine.AUTH_EXPIRED_ERROR)
    expect(timers.live()).toEqual([])
    expect(outbox().has('session:s1')).toBe(true)
  })

  it('en auth_expired una escritura local no programa la sincronización automática', async () => {
    const timers = captureEngineTimers()
    await asKnownUser()
    server.setFailWith(401)
    await mods.engine.syncNow()
    await mods.local.saveSession(session('s2') as never)
    expect(timers.live()).toEqual([])
    expect(outbox().has('session:s2')).toBe(true)
    await vi.waitFor(() => expect(mods.engine.getSyncStatus().pending).toBe(1))
  })

  it('al llegar un token nuevo reanuda con la cola intacta', async () => {
    await asKnownUser()
    await mods.local.saveSession(session('s1') as never)
    server.setFailWith(401)
    await mods.engine.syncNow()
    expect(mods.engine.getSyncStatus().state).toBe('auth_expired')

    server.setFailWith(null)
    mods.engine.resumeAfterAuth()
    await vi.waitFor(() => expect(mods.engine.getSyncStatus()).toMatchObject({ state: 'idle', lastError: null, pending: 0 }))
    expect(liveServerSessions()).toEqual(['s1'])
    expect(outbox().size).toBe(0)
  })

  it('resumeAfterAuth no hace nada si la sesión no estaba expirada', async () => {
    await asKnownUser()
    mods.engine.resumeAfterAuth()
    await new Promise(r => setTimeout(r, 20))
    expect(server.fetch).not.toHaveBeenCalled()
  })

  it('Clerk sin conexión sigue contando como sin conexión, no como sesión expirada', async () => {
    await asKnownUser()
    const auth = await import('../../account/lib/auth')
    auth.setTokenGetter(async () => {
      throw Object.assign(new Error('offline'), { code: 'clerk_offline' })
    })
    await mods.engine.syncNow()
    expect(mods.engine.getSyncStatus().state).toBe('offline')
  })
})

describe('cambios rechazados: Reintentar y Descartar (F28)', () => {
  /** Un teléfono con la sesión 'bad' rechazada por el servidor (400). */
  async function withRejected() {
    await asKnownUser()
    await mods.local.saveSession(session('bad', 'x') as never)
    server.setFailWith(400)
    await mods.engine.syncNow()
    expect(mods.engine.getSyncStatus().rejected).toBe(1)
    expect(outbox().size).toBe(0)
  }
  const rejected = () => idb.dump('rejected', 'magnifit-sync')

  it('Reintentar vuelve a subir el registro y lo quita de los rechazados', async () => {
    await withRejected()
    server.setFailWith(null)
    await mods.engine.retryRejected('session', 'bad')
    expect(liveServerSessions()).toEqual(['bad'])
    expect(rejected().size).toBe(0)
    expect(outbox().size).toBe(0)
    expect(mods.engine.getSyncStatus()).toMatchObject({ rejected: 0, rejectedError: null, state: 'idle' })
  })

  it('Reintentar con el servidor aún rechazando lo deja en rechazados, sin perderlo', async () => {
    await withRejected()
    await mods.engine.retryRejected('session', 'bad')
    expect([...rejected().keys()]).toEqual(['session:bad'])
    expect(outbox().size).toBe(0)
    expect(mods.engine.getSyncStatus().rejected).toBe(1)
    expect(sessionsOnDisk().has('bad')).toBe(true)
  })

  it('Reintentar no pisa una versión más nueva del registro que ya espera en el outbox', async () => {
    await withRejected()
    server.setFailWith(null)
    await mods.syncDb.enqueueUpsert('session', 'bad', session('bad', 'corregida'), Date.now() + 10)
    await mods.engine.retryRejected('session', 'bad')
    const row = server.rows.get('sessions:bad')
    expect((row?.body as { notes: string }).notes).toBe('corregida')
    expect(rejected().size).toBe(0)
  })

  it('Descartar quita el registro de los rechazados sin tocar el outbox ni los datos locales', async () => {
    await withRejected()
    await mods.engine.discardRejected('session', 'bad')
    expect(rejected().size).toBe(0)
    expect(outbox().size).toBe(0)
    expect(sessionsOnDisk().has('bad')).toBe(true)
    expect(mods.engine.getSyncStatus()).toMatchObject({ rejected: 0, rejectedError: null })
  })

  it('getRejected devuelve los registros con su mensaje para mostrarlos', async () => {
    await withRejected()
    const list = await mods.syncDb.getRejected()
    expect(list.map(r => [r.entity, r.key, r.error])).toEqual([['session', 'bad', 'fake 400']])
  })
})

describe('arranque en frío del servidor (F34)', () => {
  it('si el servidor tarda en responder pasa a connecting y vuelve a idle al terminar', async () => {
    const timers = captureEngineTimers()
    await asKnownUser()
    server.setDelay(120)
    const done = mods.engine.syncNow()
    await vi.waitFor(() => expect(mods.engine.getSyncStatus().state).toBe('syncing'))
    expect(timers.live().map(t => t.ms)).toContain(4_000)
    timers.fire(4_000)
    expect(mods.engine.getSyncStatus().state).toBe('connecting')
    await done
    expect(mods.engine.getSyncStatus()).toMatchObject({ state: 'idle', lastError: null })
  })

  it('si responde a tiempo no queda ningún aviso de arranque en frío pendiente', async () => {
    const timers = captureEngineTimers()
    await asKnownUser()
    await mods.engine.syncNow()
    expect(mods.engine.getSyncStatus().state).toBe('idle')
    expect(timers.live().filter(t => t.ms === 4_000)).toEqual([])
  })

  it('un 401 durante el arranque en frío termina en auth_expired, no en connecting', async () => {
    const timers = captureEngineTimers()
    await asKnownUser()
    server.setDelay(120)
    server.setFailWith(401)
    const done = mods.engine.syncNow()
    await vi.waitFor(() => expect(mods.engine.getSyncStatus().state).toBe('syncing'))
    timers.fire(4_000)
    await done
    expect(mods.engine.getSyncStatus().state).toBe('auth_expired')
  })
})
