import { PAIN_MAX, isPainValue, painVerdict } from '../../lib/pain'
import { PainIcon } from './PlanIcons'

/** Dolor 0 a 10 de un ejercicio, con el semaforo del plan. El veredicto lleva
 *  icono Y texto: el color solo no alcanza. */
export default function PainControl({ id, value, onChange }: { id: string; value: number | undefined; onChange: (v: number | null) => void }) {
  const verdict = value !== undefined && isPainValue(value) ? painVerdict(value) : null
  return (
    <div className="sp-pain">
      <label htmlFor={id}>Dolor de este ejercicio (0–10)</label>
      <select
        id={id}
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        <option value="">Sin registro</option>
        {Array.from({ length: PAIN_MAX + 1 }, (_, n) => (
          <option key={n} value={n}>{n} / {PAIN_MAX}</option>
        ))}
      </select>
      {verdict && (
        <p className={`sp-verdict ${verdict.level}`} role="status">
          <PainIcon level={verdict.level} />
          <span>
            <strong>{verdict.label}</strong>
            <span className="sp-verdict-detail">{verdict.detail}</span>
          </span>
        </p>
      )}
    </div>
  )
}
