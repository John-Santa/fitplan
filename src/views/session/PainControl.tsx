import { PAIN_MAX, isPainValue, painVerdict } from '../../lib/pain'
import { PainIcon } from './PlanIcons'

/** Dolor 0 a 10 de un ejercicio: fila compacta de fichas con el semaforo del
 *  plan. El veredicto lleva icono Y texto: el color solo no alcanza. Tocar la
 *  ficha elegida otra vez borra el registro. */
export default function PainControl({ id, value, onChange }: { id: string; value: number | undefined; onChange: (v: number | null) => void }) {
  const verdict = value !== undefined && isPainValue(value) ? painVerdict(value) : null
  return (
    <div className="ses-pain">
      <div className="ses-pain-label" id={id}>Dolor de este ejercicio (0–10)</div>
      <div className="ses-pain-chips" role="group" aria-labelledby={id}>
        {Array.from({ length: PAIN_MAX + 1 }, (_, n) => (
          <button
            key={n}
            type="button"
            className={value === n ? 'ses-chipbtn on' : 'ses-chipbtn'}
            aria-pressed={value === n}
            aria-label={`Dolor ${n} de ${PAIN_MAX}`}
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
      {verdict && (
        <p className={`ses-verdict ${verdict.level}`} role="status">
          <PainIcon level={verdict.level} />
          <span>
            <strong>{verdict.label}</strong>
            <span className="ses-verdict-detail">{verdict.detail}</span>
          </span>
        </p>
      )}
    </div>
  )
}
