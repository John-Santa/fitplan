// Editor del calentamiento: el mismo editor de ejercicios que una rutina, sobre
// el bloque plan.warmup. Trabaja en una "vista" del plan (ver lib/warmupEdits)
// y devuelve el plan ya con el calentamiento actualizado.
import { useMemo } from 'react'
import type { TrainingPlan } from '../../../lib/types'
import BlockEditor, { type Commit } from './BlockEditor'
import { Icon } from './icons'
import { WARMUP_ROUTINE_ID, applyWarmupView, warmupView } from '../lib/warmupEdits'

export default function WarmupEditor({ plan, onBack, onCommit }: {
  plan: TrainingPlan
  onBack: () => void
  onCommit: Commit
}) {
  const view = useMemo(() => warmupView(plan), [plan])
  const routine = view.routines.find(r => r.id === WARMUP_ROUTINE_ID)!
  const count = plan.warmup.slots.length

  return (
    <>
      <button type="button" className="ghost pe-back" onClick={onBack}>
        <Icon name="back" /> Plan
      </button>
      <div className="eyebrow">Calentamiento · {count === 1 ? '1 ejercicio' : `${count} ejercicios`}</div>
      <h1>Calentamiento</h1>
      <p className="hint">Se hace antes de cada rutina que lo incluye. Los cambios se ven en tu próxima sesión.</p>

      <BlockEditor
        plan={view}
        routine={routine}
        onCommit={(next, message) => onCommit(applyWarmupView(plan, next), message)}
      />
    </>
  )
}
