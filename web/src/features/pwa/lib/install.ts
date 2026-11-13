// Decisión pura del aviso de instalación: sin DOM, para poder probarla.

export type InstallMode = 'none' | 'prompt' | 'ios'

export const INSTALL_DISMISS_KEY = 'magnifit:install-dismissed'
export const INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

/** iPhone, iPad e iPod. Los iPad recientes se anuncian como Mac con pantalla
 *  táctil, de ahí `maxTouchPoints`. */
export function isIos(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

/** Si la persona dijo "Ahora no" hace menos de INSTALL_SNOOZE_MS, no se insiste. */
export function isSnoozed(stored: string | null, now = Date.now()): boolean {
  const at = Number(stored)
  return Number.isFinite(at) && at > 0 && now - at < INSTALL_SNOOZE_MS
}

/** 'prompt': el navegador ofreció `beforeinstallprompt` (Android y escritorio).
 *  'ios': Safari no lo tiene, se muestran instrucciones. 'none': ya instalada,
 *  descartada hace poco o sin forma de instalar. */
export function installMode(o: { hasPromptEvent: boolean; ios: boolean; standalone: boolean; snoozed: boolean }): InstallMode {
  if (o.standalone || o.snoozed) return 'none'
  if (o.hasPromptEvent) return 'prompt'
  return o.ios ? 'ios' : 'none'
}
