// Fake /v1/sync server for engine tests: monotonic rev, last write wins by
// updatedAt, strict contract fields. Same behavior as the one inside
// engine.test.ts, shared here so the multi-device config tests can use it.
import { vi } from 'vitest'

export type Coll = 'documents' | 'sessions' | 'measurements' | 'exerciseMeta'
const KEY_FIELD: Record<Coll, string> = { documents: 'kind', sessions: 'id', measurements: 'date', exerciseMeta: 'exerciseId' }
const COLLS = Object.keys(KEY_FIELD) as Coll[]

export type Row = { coll: Coll; key: string; body: unknown; updatedAt: number; deletedAt: number | null; rev: number }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export function fakeSyncServer() {
  let rev = 0
  const rows = new Map<string, Row>()
  const pushes: Record<Coll, Record<string, unknown>[]>[] = []
  let offline = false
  /** Runs before a push is applied (simulates another device writing in between). */
  let beforePush: (() => void) | null = null

  function seed(coll: Coll, key: string, body: unknown, updatedAt = 1000, deletedAt: number | null = null) {
    rows.set(`${coll}:${key}`, { coll, key, body, updatedAt, deletedAt, rev: ++rev })
  }

  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (offline) throw new TypeError('Failed to fetch')
    await new Promise(r => setTimeout(r, 1))
    if (init?.method === 'POST') {
      const hook = beforePush
      beforePush = null
      hook?.()
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
    const limit = Number(u.searchParams.get('limit'))
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
  })

  return {
    fetch,
    rows,
    pushes,
    seed,
    setOffline(v: boolean) { offline = v },
    onceBeforePush(fn: () => void) { beforePush = fn },
    body: (coll: Coll, key: string) => rows.get(`${coll}:${key}`)?.body,
  }
}
