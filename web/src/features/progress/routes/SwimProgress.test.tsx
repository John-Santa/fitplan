import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { SwimSession } from '../../../lib/types'
import type { Series } from '../components/Chart'

const state = vi.hoisted(() => ({
  sessions: [] as unknown[],
  charts: [] as { series: Series[] }[],
}))

vi.mock('../../../lib/store', () => ({ useStore: () => ({ sessions: state.sessions }) }))

vi.mock('../components/Chart', () => ({
  default: (props: { series: Series[] }) => {
    state.charts.push(props)
    return null
  },
}))

const { default: SwimProgress } = await import('./SwimProgress')

const swim = (id: string, date: string, distanceM: number, startedAt = Date.parse(date + 'T08:00:00')): SwimSession => ({
  id, kind: 'swim', date, startedAt, finishedAt: startedAt + 1_800_000, notes: '', poolLengthM: 25, rpe: null,
  blocks: [{ index: 0, distanceM, timeSec: distanceM, stroke: 'freestyle', done: true }],
} as SwimSession)

describe('SwimProgress', () => {
  it('orders a swim logged late for an earlier date by its own date', () => {
    state.charts = []
    state.sessions = [
      swim('nov-9', '2026-11-09', 1000),
      swim('nov-2-late', '2026-11-02', 800, Date.parse('2026-11-10T09:00:00')), // typed in on the 10th
    ]
    renderToString(<SwimProgress onBack={() => {}} />)
    expect(state.charts[0].series[0].points).toEqual([{ x: '2026-11-02', y: 800 }, { x: '2026-11-09', y: 1000 }])
  })
})
