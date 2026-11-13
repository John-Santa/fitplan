// Quick weight log (S5). Data-safety tests go through the real write path
// (localWrites -> db + outbox) on the in-memory IndexedDB.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installMemoryIdb, type MemoryIdb } from '../../../lib/testing/memoryIdb'
import type { Measurement } from '../../../lib/types'

vi.setConfig({ testTimeout: 30_000 })

type Env = {
  local: typeof import('../../sync/lib/localWrites')
  db: typeof import('../../../lib/db')
  idb: MemoryIdb
}

async function env(): Promise<Env> {
  vi.resetModules()
  const idb = installMemoryIdb()
  const local = await import('../../sync/lib/localWrites')
  const db = await import('../../../lib/db')
  local.setTrackingForTests(true)
  await db.getConfig()
  return { local, db, idb }
}

const stored = (e: Env, date: string) => e.idb.dump('measurements', 'fitplan').get(date)
const outbox = (e: Env, date: string) =>
  e.idb.dump('outbox', 'magnifit-sync').get(`measurement:${date}`) as
    | { entity: string; key: string; body: unknown; deletedAt: number | null }
    | undefined

const FULL: Measurement = { date: '2026-11-12', weight: 80, fatPct: 20, fatMass: 16, muscle: 36, waist: 90, hip: 98 }

let e: Env
beforeEach(async () => {
  e = await env()
})

describe('full-form save (current behavior, pinned)', () => {
  it('stores the whole record by date and queues one upsert with the same body', async () => {
    await e.local.saveMeasurement(FULL)
    expect(stored(e, '2026-11-12')).toEqual(FULL)
    const entry = outbox(e, '2026-11-12')
    expect(entry).toMatchObject({ entity: 'measurement', key: '2026-11-12', deletedAt: null })
    expect(entry?.body).toEqual(FULL)
  })

  it('a plain save still replaces the record (the sync-down and import paths rely on it)', async () => {
    await e.local.saveMeasurement(FULL)
    await e.local.saveMeasurement({ date: '2026-11-12', weight: 79 })
    expect(stored(e, '2026-11-12')).toEqual({ date: '2026-11-12', weight: 79 })
  })
})

describe('merging a measurement over the stored one of the same date', () => {
  it('a weight-only save keeps every other field of that date (the data-loss defect)', async () => {
    await e.local.saveMeasurement(FULL)
    await e.local.mergeMeasurement({ date: '2026-11-12', weight: 79 })
    expect(stored(e, '2026-11-12')).toEqual({ ...FULL, weight: 79 })
  })

  it('queues the merged record, not the partial one, so the sync does not drop the fields either', async () => {
    await e.local.saveMeasurement(FULL)
    await e.local.mergeMeasurement({ date: '2026-11-12', weight: 79 })
    const entry = outbox(e, '2026-11-12')
    expect(entry).toMatchObject({ entity: 'measurement', key: '2026-11-12', deletedAt: null })
    expect(entry?.body).toEqual({ ...FULL, weight: 79 })
  })

  it('a full form that leaves fields empty keeps the stored values of those fields', async () => {
    await e.local.saveMeasurement(FULL)
    await e.local.mergeMeasurement({ date: '2026-11-12', weight: 79.5, waist: 89 })
    expect(stored(e, '2026-11-12')).toEqual({ ...FULL, weight: 79.5, waist: 89 })
  })

  it('with no stored measurement for that date it stores exactly what a plain save stores', async () => {
    const plain = await env()
    await plain.local.saveMeasurement(FULL)
    e = await env()
    await e.local.mergeMeasurement(FULL)
    expect(stored(e, '2026-11-12')).toEqual(stored(plain, '2026-11-12'))
    expect(outbox(e, '2026-11-12')?.body).toEqual(outbox(plain, '2026-11-12')?.body)
  })

  it('a weight-only save on a fresh date becomes a row with just date and weight', async () => {
    await e.local.mergeMeasurement({ date: '2026-11-13', weight: 79 })
    expect(stored(e, '2026-11-13')).toEqual({ date: '2026-11-13', weight: 79 })
  })

  it('leaves other dates untouched', async () => {
    await e.local.saveMeasurement(FULL)
    await e.local.mergeMeasurement({ date: '2026-11-13', weight: 79 })
    expect(stored(e, '2026-11-12')).toEqual(FULL)
  })
})
