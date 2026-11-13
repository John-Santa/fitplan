import { afterEach, describe, expect, it, vi } from 'vitest'
import { installMemoryIdb } from '../../../lib/testing/memoryIdb'

function stubLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  })
  return store
}

afterEach(() => vi.unstubAllGlobals())

describe('eraseLocalCopy', () => {
  it('also removes the in-progress workout draft, so it does not reopen after a reload', async () => {
    vi.resetModules()
    installMemoryIdb()
    const ls = stubLocalStorage()
    const { saveActiveDraft, loadActiveDraft } = await import('../../session/lib/activeSession')
    const { eraseLocalCopy } = await import('./erase')
    saveActiveDraft({ id: 'draft', startedAt: Date.now(), finishedAt: null } as never)
    expect(ls.size).toBe(1)

    await eraseLocalCopy()

    expect(loadActiveDraft()).toBeNull()
    expect(ls.size).toBe(0)
  })
})
