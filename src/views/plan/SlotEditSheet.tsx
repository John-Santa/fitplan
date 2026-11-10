// Edicion de la prescripcion de un slot: series, objetivo segun su tipo,
// descanso, nota y marca de principal. La validacion es la de updateSlot; se
// consulta por grupo de campos para mostrar cada error bajo su campo.
import { useState } from 'react'
import type { PlanSlot, Target, TrainingPlan } from '../../types'
import { resolveExercise } from '../../lib/library'
import { updateSlot, type SlotPatch } from '../../lib/planEdits'
import { Icon } from './icons'
import Sheet from '../../components/BottomSheet'

/** Texto de un campo numerico a numero; vacio = NaN (updateSlot lo rechaza). */
const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s.trim().replace(',', '.')))

type Errors = { sets?: string; target?: string; rest?: string }

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="pe-toggle" onClick={() => onChange(!on)}>
      <span className="pe-toggle-box" aria-hidden="true">{on && <Icon name="check" />}</span>
      {label}
    </button>
  )
}

export default function SlotEditSheet({ plan, routineId, blockId, slot, onSave, onSwap, onClose }: {
  plan: TrainingPlan
  routineId: string
  blockId: string
  slot: PlanSlot
  onSave: (next: TrainingPlan) => void
  onSwap: () => void
  onClose: () => void
}) {
  const t = slot.target
  const exercise = resolveExercise(plan, slot.exerciseId)

  const [sets, setSets] = useState(String(slot.sets))
  const [rest, setRest] = useState(String(slot.restSec))
  const [note, setNote] = useState(slot.note)
  const [primary, setPrimary] = useState(slot.primary === true)
  const [perSide, setPerSide] = useState('perSide' in t && t.perSide === true)
  const [a, setA] = useState(t.kind === 'reps' ? String(t.low) : t.kind === 'time' ? String(t.lowSec) : t.kind === 'distance' ? String(t.meters) : '')
  const [b, setB] = useState(t.kind === 'reps' ? String(t.high) : t.kind === 'time' ? String(t.highSec) : '')
  const [hold, setHold] = useState(t.kind === 'reps' && t.holdSec !== undefined ? String(t.holdSec) : '')
  const [errors, setErrors] = useState<Errors>({})

  const buildTarget = (): Target => {
    const side = perSide ? { perSide: true } : {}
    switch (t.kind) {
      case 'reps': return { kind: 'reps', low: num(a), high: num(b), ...side, ...(hold.trim() !== '' ? { holdSec: num(hold) } : {}) }
      case 'time': return { kind: 'time', lowSec: num(a), highSec: num(b), ...side }
      case 'distance': return { kind: 'distance', meters: num(a), ...side }
      case 'note': return { kind: 'note' }
    }
  }

  const check = (patch: SlotPatch) => updateSlot(plan, routineId, blockId, slot.id, patch).error ?? undefined

  const stepSets = (delta: number) => {
    const n = num(sets)
    setSets(String(Math.max(1, Math.min(10, (Number.isFinite(n) ? Math.round(n) : slot.sets) + delta))))
    setErrors(e => ({ ...e, sets: undefined }))
  }

  const save = () => {
    const target = buildTarget()
    const next: Errors = {
      sets: check({ sets: num(sets) }),
      target: t.kind === 'note' ? undefined : check({ target }),
      rest: check({ restSec: num(rest) }),
    }
    if (next.sets || next.target || next.rest) {
      setErrors(next)
      return
    }
    const patch: SlotPatch = { sets: num(sets), restSec: num(rest), note: note.trim(), target }
    if (primary !== (slot.primary === true)) patch.primary = primary
    const result = updateSlot(plan, routineId, blockId, slot.id, patch)
    if (result.error) {
      setErrors({ target: result.error })
      return
    }
    onSave(result.plan)
  }

  const clear = (k: keyof Errors) => setErrors(e => ({ ...e, [k]: undefined }))
  const unit = t.kind === 'time' ? 'Segundos' : t.kind === 'distance' ? 'Metros' : 'Repeticiones'

  return (
    <Sheet className="pe-scope" title="Editar ejercicio" onClose={onClose}>
      <p className="pe-edit-name">{exercise?.name ?? slot.exerciseId}</p>
      <button type="button" className="pe-gap-md" onClick={onSwap}>
        <Icon name="swap" /> Cambiar ejercicio
      </button>

      <form onSubmit={e => { e.preventDefault(); save() }} noValidate>
        {t.kind !== 'note' && (
          <div className="pe-field">
            <label htmlFor="pe-sets">Series</label>
            <div className="pe-stepper">
              <button type="button" className="pe-icon" onClick={() => stepSets(-1)} aria-label="Menos series"><Icon name="minus" /></button>
              <input
                id="pe-sets" value={sets} inputMode="numeric" autoComplete="off"
                onChange={e => { setSets(e.target.value); clear('sets') }}
                aria-invalid={errors.sets ? true : undefined} aria-describedby={errors.sets ? 'pe-sets-err' : undefined}
              />
              <button type="button" className="pe-icon" onClick={() => stepSets(1)} aria-label="Más series"><Icon name="plus" /></button>
            </div>
            {errors.sets && <p id="pe-sets-err" className="pe-error" role="alert">{errors.sets}</p>}
          </div>
        )}

        {t.kind === 'note' ? (
          <p className="hint">Este ítem es solo una indicación: no tiene series que registrar.</p>
        ) : (
          <div className="pe-field">
            <fieldset className="pe-fieldset" aria-describedby={errors.target ? 'pe-target-err' : undefined}>
              <legend>{unit}</legend>
              {t.kind === 'distance' ? (
                <div className="pe-field">
                  <label htmlFor="pe-a">Metros</label>
                  <input id="pe-a" value={a} inputMode="decimal" autoComplete="off" onChange={e => { setA(e.target.value); clear('target') }} aria-invalid={errors.target ? true : undefined} />
                </div>
              ) : (
                <div className="pe-pair">
                  <div>
                    <label htmlFor="pe-a">Mínimo</label>
                    <input id="pe-a" value={a} inputMode="numeric" autoComplete="off" onChange={e => { setA(e.target.value); clear('target') }} aria-invalid={errors.target ? true : undefined} />
                  </div>
                  <div>
                    <label htmlFor="pe-b">Máximo</label>
                    <input id="pe-b" value={b} inputMode="numeric" autoComplete="off" onChange={e => { setB(e.target.value); clear('target') }} aria-invalid={errors.target ? true : undefined} />
                  </div>
                </div>
              )}
              {t.kind === 'reps' && (
                <div className="pe-field">
                  <label htmlFor="pe-hold">Segundos por repetición (opcional)</label>
                  <input id="pe-hold" value={hold} inputMode="numeric" autoComplete="off" onChange={e => { setHold(e.target.value); clear('target') }} aria-invalid={errors.target ? true : undefined} />
                </div>
              )}
              <Toggle label="Por lado" on={perSide} onChange={setPerSide} />
            </fieldset>
            {errors.target && <p id="pe-target-err" className="pe-error" role="alert">{errors.target}</p>}
          </div>
        )}

        {t.kind !== 'note' && (
          <div className="pe-field">
            <label htmlFor="pe-rest">Descanso (segundos)</label>
            <input
              id="pe-rest" value={rest} inputMode="numeric" autoComplete="off"
              onChange={e => { setRest(e.target.value); clear('rest') }}
              aria-invalid={errors.rest ? true : undefined} aria-describedby={errors.rest ? 'pe-rest-err' : undefined}
            />
            {errors.rest && <p id="pe-rest-err" className="pe-error" role="alert">{errors.rest}</p>}
          </div>
        )}

        <div className="pe-field">
          <label htmlFor="pe-note">Nota técnica</label>
          <textarea id="pe-note" value={note} onChange={e => setNote(e.target.value)} />
        </div>

        {t.kind !== 'note' && (
          <div className="pe-field">
            <Toggle label="Ejercicio principal" on={primary} onChange={setPrimary} />
            <p className="hint">Los principales suben a 4 series en las semanas 8 a 11.</p>
          </div>
        )}

        <button type="submit" className="primary block pe-gap-lg">Guardar cambios</button>
      </form>
    </Sheet>
  )
}
