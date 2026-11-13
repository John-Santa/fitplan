import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { formForDate } from '../lib/measureForm'
import MeasurementForm from './MeasurementForm'

const render = (form: Record<string, string>) =>
  renderToString(<MeasurementForm form={form} onChange={() => {}} onSubmit={() => {}} onCancel={() => {}} />)

describe('MeasurementForm', () => {
  it('opened on a date with a stored measurement shows its values', () => {
    const html = render(formForDate('2026-11-12', [{ date: '2026-11-12', weight: 80, fatPct: 20, waist: 90 }]))
    expect(html).toMatch(/id="f-date"[^>]*value="2026-11-12"/)
    expect(html).toMatch(/id="f-weight"[^>]*value="80"/)
    expect(html).toMatch(/id="f-fatPct"[^>]*value="20"/)
    expect(html).toMatch(/id="f-waist"[^>]*value="90"/)
    expect(html).toMatch(/id="f-hip"[^>]*value=""/)
  })

  it('tells that an emptied field is removed', () => {
    expect(render({ date: '2026-11-12' })).toContain('Lo que ves es lo que se guarda: si vacías un campo, se borra.')
  })
})
