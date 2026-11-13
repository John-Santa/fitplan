import { useCallback, useEffect, useMemo, useState } from 'react'
import { INSTALL_DISMISS_KEY, installMode, isIos, isSnoozed, type InstallMode } from './install'

/** Evento no estándar que Chrome y Edge lanzan cuando la app se puede instalar. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function readSnoozed(): boolean {
  try {
    return isSnoozed(localStorage.getItem(INSTALL_DISMISS_KEY))
  } catch {
    return false
  }
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
}

/** Estado del aviso de instalación: evento `beforeinstallprompt` en Android y
 *  escritorio, instrucciones en iOS. */
export function useInstallPrompt(): { mode: InstallMode; install: () => void; dismiss: () => void } {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [snoozed, setSnoozed] = useState(readSnoozed)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()))
    } catch {
      // Sin almacenamiento: solo se oculta hasta recargar.
    }
    setSnoozed(true)
  }, [])

  const install = useCallback(() => {
    if (!promptEvent) return
    void promptEvent.prompt()
    void promptEvent.userChoice.finally(() => setPromptEvent(null))
  }, [promptEvent])

  const mode = useMemo(
    () =>
      installMode({
        hasPromptEvent: promptEvent != null,
        ios: isIos(navigator.userAgent, navigator.maxTouchPoints),
        standalone: installed || isStandalone(),
        snoozed,
      }),
    [promptEvent, installed, snoozed],
  )
  return { mode, install, dismiss }
}
