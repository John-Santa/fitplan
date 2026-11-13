// S2/S3: the discipline chip and its "Tus disciplinas" sheet. Vitest runs in
// node (no DOM, no click), so the sheet body and the handlers are tested
// through their props. The BottomSheet portal cannot be server-rendered.
import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { SessionKind } from '../lib/types'
import {
  DisciplineChip,
  DisciplineSheetBody,
  addFromSheet,
  hideFromSheet,
  selectFromSheet,
} from './DisciplineSwitcher'

// renderToString separates adjacent text nodes with <!-- -->.
const html = (el: Parameters<typeof renderToString>[0]) => renderToString(el).replace(/<!-- -->/g, '')

const noop = () => {}
const both: SessionKind[] = ['strength', 'swim']
const streaks = { strength: 12, swim: 1 }

function body(over: Partial<Parameters<typeof DisciplineSheetBody>[0]> = {}) {
  return html(
    <DisciplineSheetBody
      list={both}
      active="strength"
      streaks={streaks}
      onSelect={noop}
      onAdd={noop}
      onHide={noop}
      {...over}
    />,
  )
}

const makeApi = () => ({ select: vi.fn(), add: vi.fn(async () => {}), hide: vi.fn(async () => {}) })

describe('DisciplineChip', () => {
  it('shows the active discipline with the accessible name "Disciplina: Gimnasio. Cambiar"', () => {
    const out = html(<DisciplineChip active="strength" onOpen={noop} />)
    expect(out).toContain('aria-label="Disciplina: Gimnasio. Cambiar"')
    expect(out).toContain('Gimnasio')
  })

  it('names Natación when swim is active', () => {
    expect(html(<DisciplineChip active="swim" onOpen={noop} />)).toContain('aria-label="Disciplina: Natación. Cambiar"')
  })
})

describe('DisciplineSheetBody list', () => {
  it('lists each discipline with its name and streak, and hides "Agregar disciplina" when none are left', () => {
    const out = body()
    expect(out).toContain('Gimnasio')
    expect(out).toContain('Natación')
    expect(out).toContain('Racha: 12 días')
    expect(out).toContain('Racha: 1 día')
    expect(out).not.toContain('Agregar disciplina')
  })

  it('marks and announces only the selected discipline', () => {
    const out = body()
    expect(out.match(/aria-current="true"/g)).toHaveLength(1)
    expect(out.match(/seleccionada/g)).toHaveLength(1)
    expect(out.indexOf('seleccionada')).toBeLessThan(out.indexOf('Natación'))
  })

  it('offers "Agregar disciplina" with a single discipline, even so', () => {
    expect(body({ list: ['strength'] })).toContain('Agregar disciplina')
  })

  it('offers "Quitar de mi lista" only while there is more than one discipline', () => {
    expect(body()).toContain('Quitar de mi lista')
    expect(body({ list: ['strength'] })).not.toContain('Quitar de mi lista')
  })
})

describe('DisciplineSheetBody views', () => {
  it('adding lists only the catalog entries not in the list', () => {
    const out = body({ list: ['strength'], initialView: { kind: 'adding' } })
    expect(out).toContain('Natación')
    expect(out).not.toContain('Gimnasio')
  })

  it('confirms before hiding, with the sessions-are-kept text', () => {
    const swim = body({ initialView: { kind: 'confirmHide', target: 'swim' } })
    expect(swim).toContain('Tus sesiones de natación se conservan. Puedes volver a agregarla.')
    const gym = body({ initialView: { kind: 'confirmHide', target: 'strength' } })
    expect(gym).toContain('Tus sesiones de gimnasio se conservan. Puedes volver a agregarla.')
  })
})

describe('handlers', () => {
  it('selecting calls select once and closes the sheet; it never saves Config', () => {
    const api = makeApi()
    const close = vi.fn()
    selectFromSheet(api, 'swim', close)
    expect(api.select).toHaveBeenCalledOnce()
    expect(api.select).toHaveBeenCalledWith('swim')
    expect(close).toHaveBeenCalledOnce()
    expect(api.add).not.toHaveBeenCalled()
    expect(api.hide).not.toHaveBeenCalled()
  })

  it('adding appends through add, toasts "Natación agregada" and closes', async () => {
    const api = makeApi()
    const close = vi.fn()
    const show = vi.fn()
    await addFromSheet(api, 'swim', show, close)
    expect(api.add).toHaveBeenCalledWith('swim')
    expect(show).toHaveBeenCalledWith('Natación agregada')
    expect(close).toHaveBeenCalledOnce()
  })

  it('a failed add shows no "agregada" toast', async () => {
    const api = { ...makeApi(), add: vi.fn(async () => { throw new Error('x') }) }
    const show = vi.fn()
    await addFromSheet(api, 'swim', show, vi.fn())
    expect(show).not.toHaveBeenCalledWith('Natación agregada')
  })

  it('hiding goes through hide and returns to the list', async () => {
    const api = makeApi()
    const back = vi.fn()
    await hideFromSheet(api, 'swim', back)
    expect(api.hide).toHaveBeenCalledWith('swim')
    expect(back).toHaveBeenCalledOnce()
  })
})
