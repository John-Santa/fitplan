import { useState } from 'react'
import { downloadBackupFile, exportBackup } from '../lib/db'

/** Destination of the move away from GitHub Pages. */
export const NEW_APP_URL = 'https://app.magnifit.co'

export const MOVED_NOTICE_TEXT =
  'MagniFit se mudó: exporta tu respaldo y ábrelo en app.magnifit.co'

/** Retirement date (ISO yyyy-mm-dd) of the Pages deployment, 30 days after
 *  the notice ships. Turning off deploy.yml still needs the owner's go-ahead. */
export const PAGES_RETIREMENT_DATE = '2026-12-12'

/** Fixed copy instead of Intl formatting, whose Spanish month abbreviation
 *  varies by runtime ("dic" vs "dic."). Keep it in sync with the date above. */
export const PAGES_RETIREMENT_TEXT = 'Esta versión deja de funcionar el 12 dic 2026.'

/** The Pages build is served under a sub-path (e.g. /fitapp/); the Render
 *  build is served at the root. Takes the base URL so it is testable. */
export function isPagesBuild(baseUrl: string): boolean {
  return baseUrl !== '/'
}


/** Shown only on the GitHub Pages build. Dismissal lasts for the current
 *  visit (component state), so the notice reappears on the next open. */
export default function MovedNotice({ baseUrl = import.meta.env.BASE_URL }: { baseUrl?: string }) {
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isPagesBuild(baseUrl) || dismissed) return null

  const exportAndGo = async () => {
    setError(null)
    try {
      downloadBackupFile(await exportBackup())
      window.open(NEW_APP_URL, '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar el respaldo.')
    }
  }

  return (
    <div className="moved-notice" role="status">
      <p>{MOVED_NOTICE_TEXT}</p>
      <p>{PAGES_RETIREMENT_TEXT}</p>
      {error && <p className="moved-notice-error">{error}</p>}
      <div className="moved-notice-actions">
        <button type="button" onClick={exportAndGo}>Exportar y abrir app.magnifit.co</button>
        <button type="button" className="ghost" onClick={() => setDismissed(true)}>Ahora no</button>
      </div>
    </div>
  )
}
