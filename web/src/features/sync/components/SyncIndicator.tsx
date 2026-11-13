// Indicador pequeño de sincronización en la estructura de la app: sincronizando,
// sin conexión, conectando con el servidor (arranque en frío), sesión expirada.
// Solo existe con una cuenta iniciada: sin cuenta no hay nada que sincronizar.
import { authEnabled, useAuthState } from '../../account/lib/auth'
import type { SyncStatus } from '../lib/engine'
import { shellIndicator } from '../lib/statusText'
import { useSyncStatus } from '../lib/useSync'

/** Presentacional. Con `onOpen` el chip es un botón (lleva a Perfil). */
export function SyncChip({ status, onOpen }: { status: SyncStatus; onOpen?: () => void }) {
  const { tone, label } = shellIndicator(status)
  const body = (
    <>
      <i className={`sync-dot ${tone}`} aria-hidden="true" />
      <span>{label}</span>
    </>
  )
  return (
    <div className="sync-chip-row" role="status" aria-live="polite">
      {onOpen && tone === 'alert' ? (
        <button className={`sync-chip ${tone}`} onClick={onOpen}>{body}</button>
      ) : (
        <span className={`sync-chip ${tone}`}>{body}</span>
      )}
    </div>
  )
}

export function SyncIndicator({ onOpenAccount }: { onOpenAccount?: () => void }) {
  const auth = useAuthState()
  const status = useSyncStatus()
  if (!authEnabled || !auth.enabled || !auth.isSignedIn) return null
  return <SyncChip status={status} onOpen={onOpenAccount} />
}
