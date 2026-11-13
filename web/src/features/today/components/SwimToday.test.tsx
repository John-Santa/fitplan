// The vitest environment is 'node': rendered to a string, no DOM.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Session } from '../../../lib/types'
import { DEFAULT_CONFIG } from '../../../lib/plan'
import { swimToday } from '../lib/swimToday'
import SwimToday from './SwimToday'

const swim = (id: string, date: string, distanceM: number, timeSec: number | null): Session => ({
  id, kind: 'swim', date, startedAt: 1, finishedAt: 2, notes: '', poolLengthM: 25, rpe: null,
  blocks: [{ index: 0, distanceM, timeSec, stroke: 'freestyle', done: true }],
})

// 2026-11-09 is a Monday, 2026-11-11 a Wednesday.
const MON = '2026-11-09'
const WED = '2026-11-11'
const config = { ...DEFAULT_CONFIG, swimWeeklyTarget: 2 }

// renderToString separates adjacent text nodes with <!-- -->.
const render = (sessions: Session[], today = WED) =>
  renderToString(<SwimToday data={swimToday(sessions, config, today)} poolLengthM={25} onStart={() => {}} />).replace(/<!-- -->/g, '')

describe('SwimToday', () => {
  it('renders the hero, the week count and the last session for one swim', () => {
    const html = render([swim('a', MON, 1500, 1875)])
    expect(html).toContain('Natación')
    expect(html).toContain('Nadar')
    expect(html).toContain('Piscina de 25 m')
    expect(html).toContain('Esta semana: 1 de 2')
    expect(html).toContain('Distancia')
    expect(html).toContain('1.500')
    expect(html).toContain('Última sesión: 1.500 m · 2:05 /100 m')
    expect(html).not.toContain('Semana cumplida')
    expect(html).not.toContain('Ya nadaste hoy')
  })

  it('shows no last session before the first swim, and still offers "Nadar"', () => {
    const html = render([])
    expect(html).toContain('Nadar')
    expect(html).toContain('Esta semana: 0 de 2')
    expect(html).not.toContain('Última sesión')
  })

  it('says the week is met and still offers "Nadar"', () => {
    const html = render([swim('a', MON, 1500, null), swim('b', WED, 1000, null)])
    expect(html).toContain('Semana cumplida. Puedes nadar igual.')
    expect(html).toContain('Nadar')
    expect(html).toContain('Última sesión: 1.000 m')
    expect(html).not.toContain('/100 m')
  })

  it('says a swim was already done today, with its distance', () => {
    const html = render([swim('a', WED, 1200, null)])
    expect(html).toContain('Ya nadaste hoy · 1.200 m')
  })
})
