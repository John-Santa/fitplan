// Enganche de React con el motor: disparadores y estado para la pantalla.
import { useEffect, useSyncExternalStore } from 'react'
import { useAuthState } from '../../account/lib/auth'
import { getSyncStatus, refreshStatus, resumeAfterAuth, setRemoteChangeHandler, setSyncUser, subscribeSyncStatus, syncNow, type SyncStatus } from './engine'

export const PERIODIC_SYNC_MS = 5 * 60_000

/** Disparadores (solo con login habilitado y sesión iniciada): al arrancar o
 *  entrar, al volver la red, al volver a primer plano y cada 5 min mientras la
 *  app está visible. El de "3 s después de una escritura" vive en
 *  localWrites.ts → noteLocalWrite. `onRemoteChange` recarga la tienda tras
 *  una bajada que cambió datos. Con la sesión expirada (401) el temporizador
 *  deja de insistir; vuelve a intentar cuando Clerk entrega un token nuevo. */
export function useSyncTriggers(userId: string | null, ready: boolean, onRemoteChange: () => Promise<void>) {
  useEffect(() => {
    setRemoteChangeHandler(onRemoteChange)
    return () => setRemoteChangeHandler(null)
  }, [onRemoteChange])

  // Clerk entrega otro token (o el usuario vuelve a entrar): si el motor
  // estaba detenido por un 401, reanuda con la cola intacta.
  const { getToken } = useAuthState()
  useEffect(() => {
    if (userId && ready) resumeAfterAuth()
  }, [getToken, userId, ready])

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
    const timer = setInterval(() => {
      if (visible() && getSyncStatus().state !== 'auth_expired') void syncNow()
    }, PERIODIC_SYNC_MS)
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
