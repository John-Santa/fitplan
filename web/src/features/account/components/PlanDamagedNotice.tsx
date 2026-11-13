// Shown when the plan stored on the device cannot be read and the app is
// running on the default plan. Without it the switch would be silent.
export const PLAN_DAMAGED_TEXT =
  'El plan guardado en este dispositivo está dañado y no se pudo leer: por ahora se usa el plan por defecto. ' +
  'Restaura un respaldo que incluya el plan, o edítalo para guardar uno nuevo.'

export default function PlanDamagedNotice() {
  return <p className="hint" role="alert" style={{ color: 'var(--alert)' }}>{PLAN_DAMAGED_TEXT}</p>
}
