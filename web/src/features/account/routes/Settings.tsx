import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { downloadBackupFile, exportBackup, getLastBackupAt, importBackup, saveLastBackupAt, wipeAll } from '../../../lib/db'
import { useStore } from '../../../lib/store'
import { Tile, useToast } from '../../../components/ui'
import { daysSince, fmt, fmtDate } from '../../../lib/calc'
import { authEnabled, useAuthState } from '../lib/auth'
import { MEASUREMENT_KEYS, MEASUREMENT_LABELS, MEASUREMENT_UNITS } from '../../../lib/plan'
import { enqueueAllLocalChanges, syncNow, type SyncStatus } from '../../sync/lib/engine'
import { getPreBootstrapBackup, resetSyncState } from '../../sync/lib/syncDb'
import { exportAndEraseDevice } from '../lib/eraseDevice'
import { BACKUP_NOTICE, restoreHint, syncStatusLines, wipeConfirmTexts } from '../../sync/lib/statusText'
import { useSyncStatus } from '../../sync/lib/useSync'

// Clerk solo se carga si hay clave; sin ella este módulo nunca se importa.
const AccountControls = lazy(() => import('../components/clerkAuth.tsx').then(m => ({ default: m.AccountControls })))
const SignOutControl = lazy(() => import('../components/clerkAuth.tsx').then(m => ({ default: m.SignOutControl })))

export function AccountCard() {
  const auth = useAuthState()
  if (!authEnabled || !auth.enabled) {
    return (
      <div className="card">
        <p style={{ margin: 0 }}>Tus datos viven solo en este teléfono.</p>
      </div>
    )
  }
  const who = auth.user?.name ?? auth.user?.email
  return (
    <div className="card">
      {auth.isSignedIn ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Suspense fallback={null}>
            <AccountControls isSignedIn />
          </Suspense>
          <div style={{ minWidth: 0 }}>
            {who && <strong style={{ display: 'block' }}>{who}</strong>}
            {auth.user?.name && auth.user.email && (
              <span className="hint" style={{ display: 'block', margin: 0 }}>{auth.user.email}</span>
            )}
          </div>
        </div>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>Inicia sesión para respaldar tus datos y usarlos en otros dispositivos.</p>
          <Suspense fallback={null}>
            <AccountControls isSignedIn={false} />
          </Suspense>
        </>
      )}
      {auth.isSignedIn && <SyncStatusView />}
      {auth.isSignedIn && (
        <div className="btnrow" style={{ marginTop: 12 }}>
          <Suspense fallback={null}>
            <SignOutControl />
          </Suspense>
        </div>
      )}
    </div>
  )
}

function SyncStatusView() {
  const downloadBackup = async () => {
    const saved = await getPreBootstrapBackup()
    if (saved) downloadBackupFile(saved.backup)
  }
  // Blocked by another account's data: export a backup, erase the device and
  // carry on with the account that is signed in now (its data comes down on
  // the next sync because the device no longer has an owner).
  const exportAndSwitch = async () => {
    await exportAndEraseDevice()
    location.reload()
  }
  return (
    <SyncStatusLines
      status={useSyncStatus()}
      onSync={() => void syncNow()}
      onDownloadBackup={() => void downloadBackup()}
      onExportAndSwitch={exportAndSwitch}
    />
  )
}

/** Estado de sincronización, botón "Sincronizar ahora" y, si el primer
 *  ingreso guardó una copia de los datos anteriores, el botón para bajarla
 *  (presentacional). */
export function SyncStatusLines({ status, onSync, onDownloadBackup, onExportAndSwitch, now }: {
  status: SyncStatus
  onSync: () => void
  onDownloadBackup?: () => void
  /** Only offered in the `blocked` state (data of another account). */
  onExportAndSwitch?: () => void | Promise<void>
  now?: number
}) {
  const alert = status.state === 'error' || status.state === 'blocked'
  const [switching, setSwitching] = useState<'idle' | 'confirm' | 'working'>('idle')
  const [switchError, setSwitchError] = useState<string | null>(null)
  const switchAccount = async () => {
    setSwitching('working')
    setSwitchError(null)
    try {
      await onExportAndSwitch?.()
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : 'No se pudo cambiar de cuenta.')
      setSwitching('idle')
    }
  }
  return (
    <>
      {syncStatusLines(status, now).map(line => (
        <p key={line} className="hint" style={{ marginBottom: 0, ...(alert ? { color: 'var(--alert)' } : {}) }}>{line}</p>
      ))}
      {status.backupAt != null && <p className="hint" style={{ marginBottom: 0 }}>{BACKUP_NOTICE}</p>}
      <div className="btnrow" style={{ marginTop: 12 }}>
        <button onClick={onSync} disabled={status.state === 'syncing'}>Sincronizar ahora</button>
        {status.backupAt != null && <button onClick={onDownloadBackup}>Descargar copia</button>}
        {status.state === 'blocked' && onExportAndSwitch && switching === 'idle' && (
          <button onClick={() => setSwitching('confirm')}>Exportar y cambiar</button>
        )}
      </div>
      {status.state === 'blocked' && onExportAndSwitch && switching !== 'idle' && (
        <div role="alertdialog" aria-label="Exportar y cambiar de cuenta">
          <p className="hint">
            Se descargará un respaldo de los datos de este dispositivo y luego se borrarán, para seguir con la cuenta
            que tienes abierta. Los datos de la otra cuenta quedan en su respaldo.
          </p>
          <div className="btnrow">
            <button className="danger" onClick={() => void switchAccount()} disabled={switching === 'working'}>
              {switching === 'working' ? 'Exportando…' : 'Exportar y cambiar'}
            </button>
            <button onClick={() => setSwitching('idle')} disabled={switching === 'working'}>Cancelar</button>
          </div>
        </div>
      )}
      {switchError && <p className="hint" style={{ color: 'var(--alert)' }}>{switchError}</p>}
    </>
  )
}

export default function Settings() {
  const { config, saveConfig, reload, sessions, droppedSessionCount, measurements } = useStore()
  const auth = useAuthState()
  const signedIn = authEnabled && auth.enabled && auth.isSignedIn
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [height, setHeight] = useState(String(config.heightCm))
  const [lastBackup, setLastBackup] = useState<number | null>(null)

  useEffect(() => {
    getLastBackupAt().then(v => setLastBackup(v ?? null))
  }, [])

  const doExport = async () => {
    const data = await exportBackup()
    downloadBackupFile(data)
    const now = Date.now()
    await saveLastBackupAt(now)
    setLastBackup(now)
    toast.show('Respaldo descargado')
  }

  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      await importBackup(data, 'replace')
      // Se combina con la cuenta: lo restaurado pasa a ser lo más nuevo y se
      // sube, y la próxima vuelta baja de nuevo lo que el respaldo no traía.
      if (authEnabled) await enqueueAllLocalChanges()
      await reload()
      toast.show('Datos restaurados')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo leer el archivo')
    }
  }

  return (
    <>
      <div className="eyebrow">
        Bloque {fmtDate(config.blockStart)} – {fmtDate(config.blockEnd, true)}
      </div>
      <h1>Ajustes</h1>

      <div className="col-a">
        <div className="section-title">Cuenta</div>
        <AccountCard />

        <div className="section-title">Tus datos</div>
        <div className="card">
          {signedIn ? (
            <p>
              Tus datos viven en <strong>este dispositivo</strong> y se respaldan en <strong>tu cuenta</strong>: si cambias
              de teléfono, vuelven al iniciar sesión. Funciona sin señal y se sincroniza al volver la conexión.
            </p>
          ) : (
            <p>
              Todo vive en <strong>este dispositivo</strong>, en la base de datos del navegador. No hay servidor, no hay
              cuenta y nadie más los ve. La contracara es que si borras los datos del navegador o cambias de teléfono, se
              van contigo solo si exportas.
            </p>
          )}
          <div className="tiles" style={{ marginTop: 12, marginBottom: 12 }}>
            <Tile label="Sesiones" value={sessions.length} dec={0} />
            <Tile label="Mediciones" value={measurements.length} dec={0} />
          </div>
          {/* Nunca se borra nada del disco: normalizeSession solo descarta
             de memoria lo que no puede leer, y esto avisa en vez de hacer
             desaparecer historial en silencio. Oculto cuando no hay nada
             que reportar. */}
          {droppedSessionCount > 0 && (
            <p className="hint" style={{ color: 'var(--alert)' }}>
              {droppedSessionCount === 1
                ? '1 sesión no se pudo leer.'
                : `${droppedSessionCount} sesiones no se pudieron leer.`}
            </p>
          )}
          <div className="btnrow">
            <button className="primary" onClick={doExport}>Exportar respaldo</button>
            <button onClick={() => fileRef.current?.click()}>Restaurar</button>
            <input
              ref={fileRef} type="file" accept="application/json" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }}
            />
          </div>
          <p className="hint">
            {lastBackup != null && `La última fue hace ${daysSince(lastBackup)} días. `}
            {restoreHint(signedIn)}
          </p>
        </div>

        <div className="section-title">Configuración</div>
        <div className="card">
          <label htmlFor="h">Estatura (cm)</label>
          <input
            id="h" type="number" inputMode="decimal" step="0.5" value={height}
            onChange={e => setHeight(e.target.value)}
            onBlur={() => {
              const v = Number(height)
              if (!Number.isNaN(v) && v > 100) saveConfig({ ...config, heightCm: v })
            }}
          />
          <p className="hint">Se usa para el IMC, el FFMI y el índice cintura/estatura.</p>
          <div className="formgrid" style={{ marginTop: 12 }}>
            <div>
              <label>Inicio del bloque</label>
              <input type="date" value={config.blockStart} onChange={e => saveConfig({ ...config, blockStart: e.target.value })} />
            </div>
            <div>
              <label>Fin del bloque</label>
              <input type="date" value={config.blockEnd} onChange={e => saveConfig({ ...config, blockEnd: e.target.value })} />
            </div>
          </div>
          <label htmlFor="pool" style={{ marginTop: 12 }}>Largo de la piscina (m)</label>
          <input
            id="pool" type="number" inputMode="decimal" step="0.5" defaultValue={config.poolLengthM}
            onBlur={e => {
              const v = Number(e.target.value)
              if (!Number.isNaN(v) && v > 0) saveConfig({ ...config, poolLengthM: v })
            }}
          />
          <p className="hint">
            Convierte los largos que cargas en la pantalla de natación a metros. Cambiarlo no reescribe el
            historial ya guardado.
          </p>
        </div>
      </div>

      <div className="col-a">
        <div className="section-title">Metas del bloque</div>
        <div className="card">
          <div className="formgrid">
            {MEASUREMENT_KEYS.map(k => (
              <div key={k}>
                <label htmlFor={`g-${k}`}>{MEASUREMENT_LABELS[k]} ({MEASUREMENT_UNITS[k]})</label>
                <input
                  id={`g-${k}`} type="number" inputMode="decimal" step="0.1" defaultValue={fmt(config.goal[k]).replace(',', '.')}
                  onBlur={e => {
                    const v = Number(e.target.value)
                    if (!Number.isNaN(v)) saveConfig({ ...config, goal: { ...config.goal, [k]: v } })
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="col-b">
        <div className="section-title alert">Zona de peligro</div>
        <div className="card">
          <button
            className="danger block"
            onClick={async () => {
              const [first, last] = wipeConfirmTexts(signedIn)
              if (!confirm(first)) return
              if (!confirm(last)) return
              await wipeAll()
              // Sin datos locales tampoco hay dueño: la próxima cuenta empieza de cero.
              if (authEnabled) await resetSyncState()
              location.reload()
            }}
          >
            Borrar todos los datos
          </button>
        </div>
      </div>

      <p className="hint" style={{ textAlign: 'center', marginTop: 22 }}>
        MagniFit · bloque {fmtDate(config.blockStart)} – {fmtDate(config.blockEnd, true)}<br />
        Herramienta personal de seguimiento. No sustituye valoración médica ni nutricional.
      </p>
      {toast.node}
    </>
  )
}
