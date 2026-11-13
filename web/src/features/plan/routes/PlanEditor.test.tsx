import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { SessionKind } from '../../../lib/types'

vi.mock('../../../lib/store', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/store')>('../../../lib/store')
  const { DEFAULT_PLAN } = await import('../../../lib/defaultPlan')
  const { DEFAULT_CONFIG } = await import('../../../lib/plan')
  return {
    ...actual,
    useStore: () => ({ plan: DEFAULT_PLAN, config: DEFAULT_CONFIG, savePlan: async () => {}, saveConfig: async () => {} }),
  }
})

const { default: PlanEditor } = await import('./PlanEditor')
const { DisciplineCtx } = await import('../../../lib/store')
const { disciplineActions } = await import('../../../lib/disciplineSelection')
const { DEFAULT_CONFIG } = await import('../../../lib/plan')

function render(active: SessionKind) {
  const api = disciplineActions({
    config: { ...DEFAULT_CONFIG, disciplines: ['strength', 'swim'] },
    stored: active,
    setStored: () => {},
    saveConfig: async () => {},
  })
  const el = createElement(DisciplineCtx.Provider, { value: api }, createElement(PlanEditor, { onOpenGuide: () => {} }))
  return renderToString(el).replace(/<!-- -->/g, '')
}

describe('PlanEditor by discipline (S6)', () => {
  it('under Natación renders the swim plan and no gym week card', () => {
    const html = render('swim')
    expect(html).toContain('Tu plan de natación')
    expect(html).toContain('Sesiones por semana')
    expect(html).not.toContain('Tu semana')
  })

  it('under Gimnasio keeps the gym week card and no swim plan', () => {
    const html = render('strength')
    expect(html).toContain('Tu semana')
    expect(html).not.toContain('Tu plan de natación')
  })
})
