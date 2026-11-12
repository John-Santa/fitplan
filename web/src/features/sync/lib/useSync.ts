// Enganche de React con el motor: disparadores y estado para la pantalla.
import { useEffect, useSyncExternalStore } from 'react'
import { getSyncStatus, refreshStatus, setRemoteChangeHandler, setSyncUser, subscribeSyncStatus, syncNow, type SyncStatus } from './engine'

export const PERIODIC_SYNC_MS = 5 * 60_000

/** Disparadores (solo con login habilitado y sesión iniciada): al arrancar o
 *  entrar, al volver la red, al volver a primer plano y cada 5 min mientras la
 *  app está visible. El de "3 s después de una escritura" vive en
 *  localWrites.ts → noteLocalWrite. `onRemoteChange` recarga la tienda tras
 *  una bajada que cambió datos. */
export function useSyncTriggers(userId: string | null, ready: boolean, onRemoteChange: () => Promise<void>) {
  useEffect(() => {
    setRemoteChangeHandler(onRemoteChange)
    return () => setRemoteChangeHandler(null)
  }, [onRemoteChange])

  useEffect(() => {
    if (!userId || !ready) {
      setSyncUser(null)
      return
    }
    setSyncUser(userId)
    void syncNow()
    const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible'
    const onOnline = () => void syncNow()
    const onVisibility = () => { if (visible()) void syncNow() }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)
    const timer = setInterval(() => { if (visible()) void syncNow() }, PERIODIC_SYNC_MS)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(timer)
      setSyncUser(null)
    }
  }, [userId, ready])
}

/** Estado de sincronización para Ajustes. */
export function useSyncStatus(): SyncStatus {
  useEffect(() => {
    void refreshStatus().catch(() => {})
  }, [])
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus)
}
