// Borrado de la cuenta o de los datos en la nube (F30/F31, S4). La lógica no
// depende de React ni de Clerk: el componente arma las dependencias reales y
// las pruebas usan falsas.

/** 'account' = DELETE /v1/me (datos y cuenta); 'data' = DELETE /v1/data
 *  (datos, la cuenta sigue). */
export type CloudDeletionKind = 'account' | 'data'

export type CloudDeletionDeps = {
  isOnline: () => boolean
  /** Detiene la sincronización y espera la que esté en curso, para que nada
   *  vuelva a subir datos mientras se borran. */
  pauseSync: () => Promise<void>
  /** Vuelve a sincronizar si el borrado en el servidor falló. */
  resumeSync: () => void
  remoteDelete: (kind: CloudDeletionKind) => Promise<void>
  /** Borra los datos de este dispositivo y el estado de sincronización. */
  eraseLocal: () => Promise<void>
  signOut: () => Promise<void>
}

export const CLOUD_DELETION_OFFLINE = 'Sin conexión: para borrar datos del servidor necesitas internet.'

/** Borra primero en el servidor y solo si eso funciona, en el dispositivo; al
 *  final cierra la sesión. Si el servidor falla no se toca nada local y la
 *  sincronización sigue. */
export async function runCloudDeletion(kind: CloudDeletionKind, deps: CloudDeletionDeps): Promise<void> {
  if (!deps.isOnline()) throw new Error(CLOUD_DELETION_OFFLINE)
  await deps.pauseSync()
  try {
    await deps.remoteDelete(kind)
  } catch (e) {
    deps.resumeSync()
    throw e
  }
  await deps.eraseLocal()
  // Tras eliminar la cuenta, Clerk ya cerró sus sesiones: un fallo aquí no
  // cambia nada de lo que ya se borró.
  await deps.signOut().catch(() => {})
}

/* ---------- doble confirmación dentro de la página ---------- */

export type DangerZoneStep =
  | { stage: 'idle' }
  | { stage: 'confirm'; kind: CloudDeletionKind }
  | { stage: 'final'; kind: CloudDeletionKind }

export type DangerZoneEvent =
  | { type: 'start'; kind: CloudDeletionKind }
  | { type: 'continue' }
  | { type: 'cancel' }

/** idle → confirm (explica y ofrece exportar) → final (último sí). Cancelar
 *  vuelve a idle desde cualquier paso. */
export function dangerZoneStep(step: DangerZoneStep, event: DangerZoneEvent): DangerZoneStep {
  switch (event.type) {
    case 'start':
      return { stage: 'confirm', kind: event.kind }
    case 'continue':
      return step.stage === 'confirm' ? { stage: 'final', kind: step.kind } : step
    case 'cancel':
      return { stage: 'idle' }
  }
}
