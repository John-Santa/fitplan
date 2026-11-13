// Sign-out dialog. No confirm(): it syncs what is pending, warns how many
// changes would be lost (offline), and offers "Mantener datos" or "Borrar
// dispositivo". The body is presentational; the container does the work.
import { useEffect, useState } from 'react'
import BottomSheet from '../../../components/BottomSheet'
import { prepareSignOut, signOutErasingDevice, signOutKeepingData, signOutWarning } from '../lib/signOut'

export type SignOutPhase = 'checking' | 'ready' | 'working'

export function SignOutDialogBody({ phase, pending, checkFailed = false, error, onKeep, onErase, onCancel }: {
  phase: SignOutPhase
  /** Changes still waiting to upload after trying to sync. */
  pending: number
  /** The pending changes could not even be counted. */
  checkFailed?: boolean
  error?: string | null
  onKeep: () => void
  onErase: () => void
  onCancel: () => void
}) {
  const warning = checkFailed ? 'No se pudo comprobar si hay cambios sin sincronizar.' : signOutWarning(pending)
  const busy = phase !== 'ready'
  return (
    <div className="signout">
      {phase === 'checking' ? (
        <p role="status">Sincronizando los cambios pendientes…</p>
      ) : (
        <>
          <p>¿Qué hacemos con los datos de este dispositivo?</p>
          {warning && <p className="signout-warning" role="alert">{warning}</p>}
          <p className="hint">
            <strong>Mantener datos</strong>: cierras la sesión y tus sesiones y mediciones siguen aquí. Si luego entras con
            otra cuenta, la sincronización se detiene hasta que borres este dispositivo.
          </p>
          <p className="hint">
            <strong>Borrar dispositivo</strong>: cierras la sesión y se borra todo lo de este dispositivo. Tu cuenta
            conserva lo que ya se sincronizó.
          </p>
        </>
      )}
      {error && <p className="signout-warning" role="alert">{error}</p>}
      <div className="btnrow signout-actions">
        <button className="primary" onClick={onKeep} disabled={busy}>Mantener datos</button>
        <button className="danger" onClick={onErase} disabled={busy}>Borrar dispositivo</button>
        <button onClick={onCancel} disabled={phase === 'working'}>Cancelar</button>
      </div>
    </div>
  )
}

export default function SignOutDialog({ signOut, onClose }: {
  /** Clerk's signOut, injected so this file never imports the SDK. */
  signOut: () => Promise<unknown>
  onClose: () => void
}) {
  const [phase, setPhase] = useState<SignOutPhase>('checking')
  const [pending, setPending] = useState(0)
  const [checkFailed, setCheckFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    prepareSignOut()
      .then(r => { if (live) setPending(r.pending) })
      .catch(() => { if (live) setCheckFailed(true) })
      .finally(() => { if (live) setPhase('ready') })
    return () => { live = false }
  }, [])

  const run = async (action: () => Promise<void>, reload: boolean) => {
    setPhase('working')
    setError(null)
    try {
      await action()
      // After erasing, start from a clean app: nothing of the old account stays in memory.
      if (reload) location.reload()
      else onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar la sesión.')
      setPhase('ready')
    }
  }

  return (
    <BottomSheet title="Cerrar sesión" onClose={() => { if (phase !== 'working') onClose() }} className="signout-sheet">
      <SignOutDialogBody
        phase={phase}
        pending={pending}
        checkFailed={checkFailed}
        error={error}
        onKeep={() => void run(() => signOutKeepingData(signOut), false)}
        onErase={() => void run(() => signOutErasingDevice(signOut), true)}
        onCancel={onClose}
      />
    </BottomSheet>
  )
}
