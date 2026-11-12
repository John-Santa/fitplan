// Confirmacion dentro de la app (sin window.confirm) para acciones destructivas.
import type { ReactNode } from 'react'
import Sheet from '../../../components/BottomSheet'

export default function ConfirmSheet({ title, children, confirmLabel, onConfirm, onCancel }: {
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet className="pe-scope" title={title} onClose={onCancel}>
      <div className="pe-confirm-body">{children}</div>
      <div className="pe-stack">
        <button type="button" onClick={onCancel}>Cancelar</button>
        <button type="button" className="danger pe-gap-lg" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Sheet>
  )
}
