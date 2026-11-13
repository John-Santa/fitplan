import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Session, StrengthSession } from '../../../lib/types'

const state = vi.hoisted(() => ({
  draft: null as unknown,
  saved: [] as unknown[],
  finish: null as null | (() => Promise<void>),
}))

vi.mock('../../../lib/store', async () => {
  const { DEFAULT_PLAN } = await import('../../../lib/defaultPlan')
  const { DEFAULT_CONFIG } = await import('../../../lib/plan')
  return {
    useStore: () => ({
      sessions: [],
      plan: DEFAULT_PLAN,
      config: DEFAULT_CONFIG,
      saveSession: async (s: unknown) => { state.saved.push(s) },
      deleteSession: async () => {},
    }),
  }
})

vi.mock('../lib/activeSession', () => ({
  loadActiveDraft: () => state.draft,
  saveActiveDraft: () => {},
}))

vi.mock('./ActiveSession', () => ({
  default: (props: { onFinish: () => Promise<void> }) => {
    state.finish = props.onFinish
    return null
  },
}))

const { default: Train } = await import('./Train')

afterEach(() => vi.restoreAllMocks())

describe('Train finish flow', () => {
  // Pinned before the closing summary: finishing stores exactly this session.
  it('saves the strength session with finishedAt and only the done sets', async () => {
    const active: StrengthSession = {
      id: 'live',
      kind: 'strength',
      routineId: 'espalda-d1',
      date: '2026-11-12',
      startedAt: 1_000,
      finishedAt: null,
      notes: 'ok',
      sets: [
        { exerciseId: 'leg-press', setIndex: 0, weight: 60, reps: 10, done: true },
        { exerciseId: 'leg-press', setIndex: 1, weight: 60, reps: null, done: false },
      ],
      pain: { 'leg-press': 2 },
    }
    state.draft = active
    state.saved = []
    renderToString(<Train />)
    vi.spyOn(Date, 'now').mockReturnValue(5_000)
    await state.finish?.()
    const expected: Session = { ...active, finishedAt: 5_000, sets: [active.sets[0]] }
    expect(JSON.stringify(state.saved)).toBe(JSON.stringify([expected]))
  })
})
