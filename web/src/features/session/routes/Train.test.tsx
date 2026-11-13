import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import type { Session, SessionKind, StrengthSession } from '../../../lib/types'

const state = vi.hoisted(() => ({
  draft: null as unknown,
  saved: [] as unknown[],
  finish: null as null | (() => Promise<void>),
  sessions: [] as unknown[],
}))

vi.mock('../../../lib/store', async () => {
  const { DEFAULT_PLAN } = await import('../../../lib/defaultPlan')
  const { DEFAULT_CONFIG } = await import('../../../lib/plan')
  const actual = await vi.importActual<typeof import('../../../lib/store')>('../../../lib/store')
  return {
    ...actual,
    useStore: () => ({
      sessions: state.sessions,
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
const { DisciplineCtx } = await import('../../../lib/store')
const { disciplineActions } = await import('../../../lib/disciplineSelection')
const { DEFAULT_CONFIG } = await import('../../../lib/plan')

const gymSession = { id: 'g1', kind: 'strength', routineId: 'espalda-d1', date: '2026-11-10', startedAt: 1, finishedAt: 2, notes: '', sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 60, reps: 10, done: true }] } as unknown as Session
const swimSession = { id: 's1', kind: 'swim', date: '2026-11-12', startedAt: 1, finishedAt: 2, notes: '', poolLengthM: 25, blocks: [{ index: 0, stroke: 'free', distanceM: 1500, timeSec: 600, done: true }] } as unknown as Session

/** Renders Train with the given selected discipline and sessions. */
function renderTrain(active: SessionKind, sessions: Session[] = [], draft: Session | null = null) {
  state.draft = draft
  state.sessions = sessions
  const api = disciplineActions({
    config: { ...DEFAULT_CONFIG, disciplines: ['strength', 'swim'] },
    sessions,
    stored: active,
    setStored: () => {},
    saveConfig: async () => {},
  })
  return renderToString(createElement(DisciplineCtx.Provider, { value: api }, createElement(Train))).replace(/<!-- -->/g, '')
}

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
    renderTrain('strength', [], active)
    vi.spyOn(Date, 'now').mockReturnValue(5_000)
    await state.finish?.()
    const expected: Session = { ...active, finishedAt: 5_000, sets: [active.sets[0]] }
    expect(JSON.stringify(state.saved)).toBe(JSON.stringify([expected]))
  })
})

describe('Train by discipline (S6)', () => {
  it('under Natación shows no pain log, no phase card and no gym routines', () => {
    const html = renderTrain('swim')
    expect(html).not.toContain('Ver registro de dolor')
    expect(html).not.toContain('data-testid="start-espalda-d1"')
    expect(html).not.toContain('class="card accent tight"')
    expect(html).toContain('Nadar')
    expect(html).toContain('Ver progresión')
  })

  it('under Gimnasio still renders the phase card, routines, pain log and no swim card', () => {
    const html = renderTrain('strength')
    expect(html).toContain('class="card accent tight"')
    expect(html).toContain('Ver registro de dolor')
    expect(html).toContain('data-testid="start-espalda-d1"')
    expect(html).toContain('Entrenar')
    expect(html).not.toContain('data-testid="start-swim"')
  })

  it('shows only gym history under Gimnasio and only swim history under Natación', () => {
    const both = [gymSession, swimSession]
    const gym = renderTrain('strength', both)
    expect(gym).toContain('1 series')
    expect(gym).not.toContain('1.500 m')
    const swim = renderTrain('swim', both)
    expect(swim).toContain('1.500 m')
    expect(swim).not.toContain(' series ·')
    expect(swim).not.toContain('data-testid="start-espalda-d1"')
  })

  it('uses the empty-history copy of each discipline', () => {
    expect(renderTrain('strength', [swimSession])).toContain('aquí vas a ver series y peso de cada sesión.')
    expect(renderTrain('swim', [gymSession])).toContain('aquí vas a ver largos y tiempo de cada sesión.')
  })
})
