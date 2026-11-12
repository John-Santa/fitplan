import { lazy, Suspense, type ReactNode } from 'react'
import { authEnabled as loginConfigured, useAuthState } from '../../account/lib/auth'
import { useSyncStatus } from '../../sync/lib/useSync'
import type { SyncStatus } from '../../sync/lib/engine'
import { BACKUP_INVITE_TEXT, BACKUP_INVITE_TITLE, SIGN_IN_OFFLINE_TEXT, connectingText } from '../../onboarding/lib/accountEntry'

// Clerk only loads with a key configured; without it this is never imported.
const AccountEntryButtons = lazy(() =>
  import('../../account/components/clerkAuth.tsx').then(m => ({ default: m.AccountEntryButtons })),
)

/** "Respalda tus datos" in Hoy (presentational): with login enabled and no
 *  session it invites to create an account; with a session it only says
 *  "conectando con el servidor" while the first sync waits for the API. */
export function BackupNotice({ authEnabled, signedIn, status, actions }: {
  authEnabled: boolean
  signedIn: boolean
  status: SyncStatus | null
  /** Account buttons; undefined when Clerk could not load (shows why),
   *  false while it is still loading. */
  actions?: ReactNode
}) {
  if (!authEnabled) return null
  if (signedIn) {
    const connecting = connectingText(status)
    return connecting ? <p className="hoy-connecting" role="status">{connecting}</p> : null
  }
  return (
    <section className="hoy-nudge hoy-backup" aria-label={BACKUP_INVITE_TITLE}>
      <p>
        <strong>{BACKUP_INVITE_TITLE}</strong>
        {BACKUP_INVITE_TEXT}
      </p>
      {actions ?? <p className="hint">{SIGN_IN_OFFLINE_TEXT}</p>}
    </section>
  )
}

/** Container for Hoy. Renders nothing without login configured, so builds
 *  without Clerk never open the sync database from here. */
export default function HoyBackupNotice() {
  return loginConfigured ? <ConnectedBackupNotice /> : null
}

function ConnectedBackupNotice() {
  const auth = useAuthState()
  const status = useSyncStatus()
  // Clerk failed to load (no connection): auth stays disabled and the notice
  // says why there are no buttons. While Clerk is still loading: nothing yet.
  const actions = !auth.enabled
    ? undefined
    : auth.isLoaded ? <Suspense fallback={null}><AccountEntryButtons /></Suspense> : false
  return <BackupNotice authEnabled signedIn={auth.isSignedIn} status={status} actions={actions} />
}
