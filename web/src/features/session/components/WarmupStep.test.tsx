// The active session renders plan.warmup, so an edited warm-up shows up there.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { TrainingPlan } from '../../../lib/types'
import { DEFAULT_PLAN } from '../../../lib/defaultPlan'
import { addSlot, removeSlot } from '../../../lib/planEdits'
import { WARMUP_ROUTINE_ID, applyWarmupView, warmupView } from '../../plan/lib/warmupEdits'
import WarmupStep from './WarmupStep'

const render = (plan: TrainingPlan) =>
  renderToString(<WarmupStep plan={plan} block={plan.warmup} ticked={{}} onToggle={() => {}} onInfo={() => {}} />).replace(/<!-- -->/g, '')

function edited(fn: (view: TrainingPlan, blockId: string) => TrainingPlan): TrainingPlan {
  const view = warmupView(DEFAULT_PLAN)
  return applyWarmupView(DEFAULT_PLAN, fn(view, view.routines.at(-1)!.blocks[0].id))
}

describe('WarmupStep', () => {
  it('renders the template warm-up unchanged by default', () => {
    const html = render(DEFAULT_PLAN)
    expect(html).toContain('0 de 7')
    expect(html).toContain('Gato-camello suave: 8 reps')
  })

  it('shows an exercise added to the warm-up, named from the library when it has no note', () => {
    const plan = edited((v, b) => addSlot(v, WARMUP_ROUTINE_ID, b, 'child-pose'))
    const html = render(plan)
    expect(html).toContain('0 de 8')
    expect(html).toContain('Postura del niño suave')
  })

  it('no longer shows an exercise removed from the warm-up', () => {
    const plan = edited((v, b) => removeSlot(v, WARMUP_ROUTINE_ID, b, 'warmup-2'))
    const html = render(plan)
    expect(html).toContain('0 de 6')
    expect(html).not.toContain('Gato-camello suave')
  })

  it('does not claim a fixed warm-up or a fixed duration, since both can be edited', () => {
    const html = render(DEFAULT_PLAN)
    expect(html).not.toContain('Calentamiento fijo')
    expect(html).not.toContain('10 min')
  })
})
