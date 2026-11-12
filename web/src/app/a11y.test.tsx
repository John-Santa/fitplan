// The vitest environment is 'node': views are rendered to a string, so the
// accessibility contract is checked on the markup (no DOM, no Testing Library).
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { ReactElement } from 'react'
import { StoreProvider } from '../lib/store'
import Habit from '../features/habit/routes/Habit'
import Settings from '../features/account/routes/Settings'
import PlanEditor from '../features/plan/routes/PlanEditor'
import Guide from '../features/guide/routes/Guide'
import Home from '../features/today/routes/Home'
import Train from '../features/session/routes/Train'

const render = (el: ReactElement) => renderToString(<StoreProvider>{el}</StoreProvider>)

const views: [string, () => ReactElement][] = [
  ['Hoy', () => <Home go={() => {}} startRoutine={() => {}} />],
  ['Plan', () => <PlanEditor onOpenGuide={() => {}} />],
  ['Guía', () => <Guide onBack={() => {}} />],
  ['Hábito', () => <Habit />],
  ['Entrenar', () => <Train onAutoStarted={() => {}} />],
  ['Perfil', () => <Settings />],
]

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]

/** Form fields (not hidden inputs) whose markup gives no accessible name. */
function unnamedFields(html: string): string[] {
  const labelRanges = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)].map(m => [m.index!, m.index! + m[0].length])
  const forIds = new Set([...html.matchAll(/<label\b[^>]*\sfor="([^"]*)"/g)].map(m => m[1]))
  const bad: string[] = []
  for (const m of html.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
    const tag = m[0]
    if (/\stype="(submit|button)"/.test(tag)) continue
    const id = attr(tag, 'id')
    const named =
      (attr(tag, 'aria-label') ?? '').trim() !== '' ||
      attr(tag, 'aria-labelledby') !== undefined ||
      (id !== undefined && forIds.has(id)) ||
      labelRanges.some(([a, b]) => m.index! >= a && m.index! < b)
    if (!named) bad.push(tag)
  }
  return bad
}

describe('cada vista tiene exactamente un h1', () => {
  it.each(views)('%s', (_name, make) => {
    const html = render(make())
    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1)
  })
})

describe('todo campo tiene nombre accesible', () => {
  it.each(views)('%s', (_name, make) => {
    expect(unnamedFields(render(make()))).toEqual([])
  })
})
