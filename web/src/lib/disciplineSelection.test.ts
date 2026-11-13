// S1/S3/S10: the user's discipline list and the selected discipline, resolved
// from one place. Pure rules plus the per-device storage, over a stubbed
// localStorage (the vitest environment is node, no DOM).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { DisciplineCtx, StoreProvider } from './store'
import { useDiscipline } from './useDiscipline'
import { DEFAULT_CONFIG, mergeConfig } from './plan'
import { DISCIPLINES } from './disciplines'
import type { Config, Session, SessionKind } from './types'
import {
  DISCIPLINE_CATALOG,
  DISCIPLINE_STORAGE_KEY,
  addDiscipline,
  defaultDisciplines,
  disciplineActions,
  disciplineList,
  hideDiscipline,
  readStoredDiscipline,
  removeStoredDiscipline,
  resolveActive,
  writeStoredDiscipline,
} from './disciplineSelection'

function stubLocalStorage() {
  const rows = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => rows.get(k) ?? null,
    setItem: (k: string, v: string) => void rows.set(k, v),
    removeItem: (k: string) => void rows.delete(k),
  })
  return rows
}

function throwingLocalStorage() {
  const fail = () => { throw new Error('SecurityError') }
  vi.stubGlobal('localStorage', { getItem: fail, setItem: fail, removeItem: fail })
}

afterEach(() => vi.unstubAllGlobals())

const strength = { id: 'g1', kind: 'strength', routineId: 'dia1', date: '2026-11-10', startedAt: 1, finishedAt: 2, notes: '', sets: [] } as unknown as Session
const swim = { id: 's1', kind: 'swim', date: '2026-11-11', startedAt: 1, finishedAt: 2, notes: '', poolLengthM: 25, blocks: [] } as unknown as Session
const withList = (disciplines: SessionKind[]): Config => ({ ...DEFAULT_CONFIG, disciplines })

describe('catalog', () => {
  it('is the DISCIPLINES keys, and mergeConfig accepts exactly those ids', () => {
    expect(DISCIPLINE_CATALOG).toEqual(Object.keys(DISCIPLINES))
    expect(mergeConfig({ disciplines: [...DISCIPLINE_CATALOG] }).disciplines).toEqual([...DISCIPLINE_CATALOG])
  })
})

describe('defaultDisciplines (D2-A)', () => {
  it('is Gimnasio only for a new install or a gym-only user', () => {
    expect(defaultDisciplines([])).toEqual(['strength'])
    expect(defaultDisciplines([strength])).toEqual(['strength'])
  })

  it('adds Natación when the user has at least one swim session', () => {
    expect(defaultDisciplines([strength, swim])).toEqual(['strength', 'swim'])
    expect(defaultDisciplines([swim])).toEqual(['strength', 'swim'])
  })
})

describe('disciplineList', () => {
  it('applies D2-A to a config that holds the default list', () => {
    expect(disciplineList(mergeConfig({}), [swim])).toEqual(['strength', 'swim'])
    expect(disciplineList(mergeConfig({}), [strength])).toEqual(['strength'])
  })

  it('keeps a list the user chose', () => {
    expect(disciplineList(withList(['swim']), [strength])).toEqual(['swim'])
    expect(disciplineList(withList(['swim', 'strength']), [])).toEqual(['swim', 'strength'])
  })

  it('never stores anything (pure)', () => {
    const config = mergeConfig({})
    disciplineList(config, [swim])
    expect(config.disciplines).toEqual(['strength'])
  })
})

describe('resolveActive', () => {
  it('a stored discipline no longer in the list (hidden on another device) resolves to the first', () => {
    expect(resolveActive('swim', ['strength'])).toBe('strength')
  })

  it('nothing stored resolves to the first of the list', () => {
    expect(resolveActive(null, ['swim', 'strength'])).toBe('swim')
  })

  it('keeps a stored discipline that is in the list', () => {
    expect(resolveActive('swim', ['strength', 'swim'])).toBe('swim')
  })

  it('an invalid stored value resolves to the first of the list', () => {
    for (const bad of ['running', '', 42, undefined, {}]) expect(resolveActive(bad, ['strength', 'swim'])).toBe('strength')
  })

  it('a localStorage that throws resolves to the first of the list', () => {
    throwingLocalStorage()
    expect(readStoredDiscipline()).toBeNull()
    expect(resolveActive(readStoredDiscipline(), ['swim', 'strength'])).toBe('swim')
  })

  it('without localStorage at all, resolves to the first of the list', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(resolveActive(readStoredDiscipline(), ['strength', 'swim'])).toBe('strength')
  })
})

describe('per-device storage', () => {
  it('writes, reads and removes the selected discipline under its own key', () => {
    const rows = stubLocalStorage()
    writeStoredDiscipline('swim')
    expect(rows.get(DISCIPLINE_STORAGE_KEY)).toBe('swim')
    expect(readStoredDiscipline()).toBe('swim')
    removeStoredDiscipline()
    expect(rows.has(DISCIPLINE_STORAGE_KEY)).toBe(false)
    expect(readStoredDiscipline()).toBeNull()
  })

  it('never throws when localStorage does', () => {
    throwingLocalStorage()
    expect(() => writeStoredDiscipline('swim')).not.toThrow()
    expect(() => removeStoredDiscipline()).not.toThrow()
  })
})

describe('addDiscipline / hideDiscipline (S3)', () => {
  it('appends a discipline not in the list', () => {
    expect(addDiscipline(['strength'], 'swim')).toEqual(['strength', 'swim'])
  })

  it('adding one already in the list returns the list unchanged', () => {
    const list: SessionKind[] = ['strength', 'swim']
    expect(addDiscipline(list, 'swim')).toBe(list)
  })

  it('hides a discipline from the list', () => {
    expect(hideDiscipline(['strength', 'swim'], 'strength')).toEqual(['swim'])
  })

  it('the last discipline cannot be hidden', () => {
    expect(hideDiscipline(['strength'], 'strength')).toEqual(['strength'])
  })

  it('hiding one not in the list returns the list unchanged', () => {
    const list: SessionKind[] = ['strength']
    expect(hideDiscipline(list, 'swim')).toBe(list)
  })
})

describe('disciplineActions (the core of useDiscipline)', () => {
  function setup(config: Config, sessions: Session[] = [], stored: unknown = null) {
    const rows = stubLocalStorage()
    if (typeof stored === 'string') rows.set(DISCIPLINE_STORAGE_KEY, stored)
    const saved: Config[] = []
    const chosen: SessionKind[] = []
    const api = disciplineActions({
      config,
      sessions,
      stored,
      setStored: k => void chosen.push(k),
      saveConfig: async c => void saved.push(c),
    })
    return { api, rows, saved, chosen }
  }

  it('exposes the resolved list and the active discipline', () => {
    const { api } = setup(mergeConfig({}), [swim], 'swim')
    expect(api.list).toEqual(['strength', 'swim'])
    expect(api.active).toBe('swim')
  })

  it('select stores the choice per device only: Config is never saved (D3-A)', () => {
    const { api, rows, saved, chosen } = setup(withList(['strength', 'swim']))
    api.select('swim')
    expect(rows.get(DISCIPLINE_STORAGE_KEY)).toBe('swim')
    expect(chosen).toEqual(['swim'])
    expect(saved).toEqual([])
  })

  it('select ignores a discipline that is not in the list', () => {
    const { api, rows, saved, chosen } = setup(withList(['strength']))
    api.select('swim')
    expect(rows.has(DISCIPLINE_STORAGE_KEY)).toBe(false)
    expect(chosen).toEqual([])
    expect(saved).toEqual([])
  })

  it('add saves the new list through saveConfig and selects the added one', async () => {
    const config = withList(['strength'])
    const { api, rows, saved, chosen } = setup(config)
    await api.add('swim')
    expect(saved).toEqual([{ ...config, disciplines: ['strength', 'swim'] }])
    expect(rows.get(DISCIPLINE_STORAGE_KEY)).toBe('swim')
    expect(chosen).toEqual(['swim'])
  })

  it('adding one already listed saves nothing but selects it', async () => {
    const { api, saved, chosen } = setup(withList(['strength', 'swim']))
    await api.add('swim')
    expect(saved).toEqual([])
    expect(chosen).toEqual(['swim'])
  })

  it('hide saves the shorter list; hiding the active one selects the first remaining', async () => {
    const config = withList(['strength', 'swim'])
    const { api, rows, saved, chosen } = setup(config, [], 'strength')
    await api.hide('strength')
    expect(saved).toEqual([{ ...config, disciplines: ['swim'] }])
    expect(rows.get(DISCIPLINE_STORAGE_KEY)).toBe('swim')
    expect(chosen).toEqual(['swim'])
  })

  it('hiding another discipline keeps the active one', async () => {
    const { api, saved, chosen } = setup(withList(['strength', 'swim']), [], 'strength')
    await api.hide('swim')
    expect(saved.map(c => c.disciplines)).toEqual([['strength']])
    expect(chosen).toEqual([])
  })

  it('the last discipline cannot be hidden: nothing is saved', async () => {
    const { api, saved } = setup(withList(['strength']))
    await api.hide('strength')
    expect(saved).toEqual([])
  })

  it('hiding deletes no session: the sessions handed in are untouched', async () => {
    const sessions = [strength, swim]
    const before = JSON.stringify(sessions)
    const { api } = setup(withList(['strength', 'swim']), sessions)
    await api.hide('swim')
    expect(JSON.stringify(sessions)).toBe(before)
  })
})

describe('useDiscipline', () => {
  function Probe({ name }: { name: string }) {
    const { active, list } = useDiscipline()
    return createElement('p', null, `${name}:${active}:${list.join(',')}`)
  }
  const text = (html: string) => html.replace(/<!-- -->/g, '')

  it('is shared by StoreProvider: every consumer reads the same state', () => {
    stubLocalStorage().set(DISCIPLINE_STORAGE_KEY, 'swim')
    const html = renderToString(createElement(StoreProvider, null, createElement(Probe, { name: 'a' }), createElement(Probe, { name: 'b' })))
    // Before the first load the config is DEFAULT_CONFIG and there are no
    // sessions: the list is Gimnasio only, so the stored 'swim' resolves to it.
    expect(text(html)).toBe('<p>a:strength:strength</p><p>b:strength:strength</p>')
  })

  it('renders with a localStorage that throws', () => {
    throwingLocalStorage()
    const html = renderToString(createElement(StoreProvider, null, createElement(Probe, { name: 'a' })))
    expect(text(html)).toBe('<p>a:strength:strength</p>')
  })

  it('reads the DisciplineCtx value and throws outside StoreProvider', () => {
    const api = disciplineActions({ config: withList(['swim', 'strength']), sessions: [], stored: null, setStored: () => {}, saveConfig: async () => {} })
    const html = renderToString(createElement(DisciplineCtx.Provider, { value: api }, createElement(Probe, { name: 'x' })))
    expect(text(html)).toBe('<p>x:swim:swim,strength</p>')
    expect(() => renderToString(createElement(Probe, { name: 'y' }))).toThrow('useDiscipline fuera de StoreProvider')
  })
})
