import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import PlanDamagedNotice, { PLAN_DAMAGED_TEXT } from './PlanDamagedNotice'

describe('PlanDamagedNotice', () => {
  it('says the stored plan is damaged and that the default plan is in use', () => {
    const html = renderToString(<PlanDamagedNotice />)
    expect(html).toContain('está dañado')
    expect(html).toContain('plan por defecto')
    expect(PLAN_DAMAGED_TEXT).toContain('Restaura un respaldo')
  })
})
