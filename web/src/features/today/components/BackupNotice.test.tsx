// The vitest environment is 'node': rendered to a string, no DOM.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { BackupNotice } from './BackupNotice'
import type { SyncStatus } from '../../sync/lib/engine'

const idle: SyncStatus = { state: 'idle', pending: 0, lastSyncAt: null, lastError: null, rejected: 0, rejectedError: null, backupAt: null }

describe('"Respalda tus datos" notice in Hoy', () => {
  it('shows when login is enabled and there is no session', () => {
    const html = renderToString(<BackupNotice authEnabled signedIn={false} status={null} />)
    expect(html).toContain('Respalda tus datos')
  })

  it('hides with a session', () => {
    const html = renderToString(<BackupNotice authEnabled signedIn status={{ ...idle, lastSyncAt: 1 }} />)
    expect(html).not.toContain('Respalda tus datos')
    expect(html).toBe('')
  })

  it('never shows without login configured', () => {
    expect(renderToString(<BackupNotice authEnabled={false} signedIn={false} status={null} />)).toBe('')
  })

  it('says it is connecting while the first sync waits for the server', () => {
    const html = renderToString(<BackupNotice authEnabled signedIn status={{ ...idle, state: 'syncing' }} />)
    expect(html).toContain('Conectando con el servidor')
    expect(html).not.toContain('Respalda tus datos')
  })
})
