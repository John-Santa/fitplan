// Motor de sincronización sobre IndexedDB en memoria y un servidor falso que
// imita /v1/sync (rev monotónico, última escritura gana, campos estrictos).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installMemoryIdb, type MemoryIdb } from '../testing/memoryIdb'

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

  function seed(coll: Coll, key: string, body: unknown, updatedAt = 1000, deletedAt: number | null = null) {
    rows.set(`${coll}:${key}`, { coll, key, body, updatedAt, deletedAt, rev: ++rev })
  }

  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (offline) throw new TypeError('Failed to fetch')
    active++
    maxActive = Math.max(maxActive, active)
    try {
      await new Promise(r => setTimeout(r, 2))
      if (init?.method === 'POST') {
        const cs = JSON.parse(String(init.body)) as Record<Coll, Record<string, unknown>[]>
        pushes.push(cs)
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
  const auth = await import('../auth')
  auth.setTokenGetter(async () => 'tok')
  const engine = await import('./engine')
  const syncDb = await import('./syncDb')
  const local = await import('./localWrites')
  const db = await import('../db')
  local.setTrackingForTests(true)
  return { engine, syncDb, local, db }
}

let mods: Awaited<ReturnType<typeof fresh>>
const outbox = () => idb.dump('outbox', 'magnifit-sync')
const sessionsOnDisk = () => idb.dump('sessions', 'fitplan')

beforeEach(async () => {
  mods = await fresh()
})
afterEach(() => {
  mods.engine.resetSyncEngineForTests()
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

  it('ClerkOfflineError cuenta como sin conexión', async () => {
    await asKnownUser()
    const auth = await import('../auth')
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

describe('primer ingreso (S7)', () => {
  it('sube lo solo-local, gana el servidor en llaves compartidas y no borra nada local', async () => {
    // Local: s-local (solo aquí), s-both (en ambos), medida, plan y config.
    await mods.db.saveSession(session('s-local', 'local') as never)
    await mods.db.saveSession(session('s-both', 'local') as never)
    await mods.db.saveSession(session('s-dead', 'local') as never)
    await mods.db.saveMeasurement(measurement('2026-11-05', 81) as never)
    const { DEFAULT_CONFIG } = await import('../plan')
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
    const { DEFAULT_CONFIG } = await import('../plan')
    const { defaultPlanWithLegacy } = await import('../defaultPlan')
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
