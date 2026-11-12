// "esto cambió en otro dispositivo" (S15): shown when a config merge kept
// another device's value over a local change. Presentational; Ajustes loads
// the pending notice and clears it on dismiss.
import { configConflictText } from '../lib/configMerge'

export function ConfigConflictNotice({ fields, onDismiss }: { fields: string[]; onDismiss: () => void }) {
  if (fields.length === 0) return null
  return (
    <div role="status">
      <p className="hint" style={{ marginBottom: 0 }}>{configConflictText(fields)}</p>
      <div className="btnrow" style={{ marginTop: 8 }}>
        <button onClick={onDismiss}>Entendido</button>
      </div>
    </div>
  )
}
