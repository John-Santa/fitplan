// Zona de peligro de la cuenta (F30/F31): "Eliminar cuenta" y "Borrar mis
// datos en la nube". Doble confirmación dentro de la página (sin confirm()),
// con oferta de exportar antes, y bloqueada sin conexión.
import { useEffect, useState } from 'react'
import { deleteAccount, deleteCloudData } from '../../sync/api'
import { setSyncUser, syncNow } from '../../sync/lib/engine'
import { eraseLocalCopy } from '../../sync/lib/erase'
import { signOutOfAuth, useAuthState } from '../lib/auth'
import {
  CLOUD_DELETION_OFFLINE, dangerZoneStep, runCloudDeletion,
  type CloudDeletionDeps, type CloudDeletionKind, type DangerZoneStep,
} from '../lib/cloudDeletion'

const TEXT: Record<CloudDeletionKind, { action: string; explain: string; final: string; yes: string; busy: string }> = {
  account: {
    action: 'Eliminar cuenta',
    explain:
      'Se eliminan tu cuenta y todos tus datos de salud guardados en el servidor: sesiones, mediciones, plan y ' +
      'ajustes. También se borran de este dispositivo y se cierra la sesión. No se puede deshacer.',
    final: 'Última confirmación: tu cuenta y tus datos se eliminan para siempre.',
    yes: 'Sí, eliminar mi cuenta',
    busy: 'Eliminando…',
  },
  data: {
    action: 'Borrar mis datos en la nube',
    explain:
      'Se borran todos tus datos guardados en el servidor: sesiones, mediciones, plan y ajustes. Tu cuenta sigue ' +
      'existiendo. También se borran de este dispositivo y se cierra la sesión. No se puede deshacer. Si otro ' +
      'dispositivo conserva una copia, la vuelve a subir al sincronizar.',
    final: 'Última confirmación: tus datos en la nube se borran para siempre.',
    yes: 'Sí, borrar mis datos en la nube',
    busy: 'Borrando…',
  },
}

export const EXPORT_OFFER = 'Antes de seguir, puedes exportar un respaldo para conservar una copia en un archivo.'

/** Presentacional: lo que se ve en cada paso. */
export function CloudDangerZoneView({ step, online, busy, error, onStart, onExport, onContinue, onConfirm, onCancel }: {
  step: DangerZoneStep
  online: boolean
  busy: boolean
  error: string | null
  onStart: (kind: CloudDeletionKind) => void
  onExport: () => void
  onContinue: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const offlineHint = !online && <p className="hint" style={{ color: 'var(--alert)' }}>{CLOUD_DELETION_OFFLINE}</p>
  if (step.stage === 'idle') {
    return (
      <div style={{ marginBottom: 12 }}>
        {offlineHint}
        <div className="btnrow">
          <button className="danger" disabled={!online} onClick={() => onStart('account')}>{TEXT.account.action}</button>
          <button className="danger" disabled={!online} onClick={() => onStart('data')}>{TEXT.data.action}</button>
        </div>
      </div>
    )
  }
  const t = TEXT[step.kind]
  return (
    <div role="alertdialog" aria-labelledby="danger-title" style={{ marginBottom: 12 }}>
      <strong id="danger-title" style={{ display: 'block' }}>{t.action}</strong>
      {step.stage === 'confirm' ? (
        <>
          <p>{t.explain}</p>
          <p className="hint">{EXPORT_OFFER}</p>
          <div className="btnrow">
            <button onClick={onExport}>Exportar respaldo</button>
            <button className="danger" onClick={onContinue}>Continuar</button>
            <button onClick={onCancel}>Cancelar</button>
          </div>
        </>
      ) : (
        <>
          <p>{t.final}</p>
          {offlineHint}
          {error && (
            <p className="hint" style={{ color: 'var(--alert)' }}>
              {`No se pudo completar: ${error}. No se borró nada de este dispositivo; puedes reintentar.`}
            </p>
          )}
          <div className="btnrow">
            <button className="danger" disabled={!online || busy} onClick={onConfirm}>{busy ? t.busy : t.yes}</button>
            <button disabled={busy} onClick={onCancel}>Cancelar</button>
          </div>
        </>
      )}
    </div>
  )
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

/** Contenedor: arma las dependencias reales. Tras el borrado recarga la app,
 *  que arranca vacía y sin sesión. `onExport` es el mismo export de Ajustes. */
export function CloudDangerZone({ onExport }: { onExport: () => void | Promise<void> }) {
  const auth = useAuthState()
  const online = useOnline()
  const [step, setStep] = useState<DangerZoneStep>({ stage: 'idle' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deps: CloudDeletionDeps = {
    isOnline: () => navigator.onLine !== false,
    pauseSync: async () => {
      setSyncUser(null)
      // Con el usuario en null, syncNow solo espera la vuelta en curso.
      await syncNow()
    },
    resumeSync: () => {
      setSyncUser(auth.userId)
      void syncNow()
    },
    remoteDelete: kind => (kind === 'account' ? deleteAccount() : deleteCloudData()),
    eraseLocal: eraseLocalCopy,
    signOut: signOutOfAuth,
  }

  const dispatch = (event: Parameters<typeof dangerZoneStep>[1]) => {
    setError(null)
    setStep(s => dangerZoneStep(s, event))
  }

  const confirm = async () => {
    if (step.stage !== 'final') return
    setBusy(true)
    setError(null)
    try {
      await runCloudDeletion(step.kind, deps)
      location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <CloudDangerZoneView
      step={step} online={online} busy={busy} error={error}
      onStart={kind => dispatch({ type: 'start', kind })}
      onExport={() => void onExport()}
      onContinue={() => dispatch({ type: 'continue' })}
      onConfirm={() => void confirm()}
      onCancel={() => dispatch({ type: 'cancel' })}
    />
  )
}
