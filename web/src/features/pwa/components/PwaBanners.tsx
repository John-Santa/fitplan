// Avisos de instalación y de versión nueva (presentacionales).
import type { InstallMode } from '../lib/install'

export const INSTALL_TEXT = 'Instala MagniFit para abrirla como una app y usarla sin conexión.'
export const IOS_INSTALL_TEXT = 'Para instalar MagniFit: toca Compartir y elige “Añadir a pantalla de inicio”.'
export const UPDATE_TEXT = 'Hay una versión nueva de MagniFit.'

export function InstallBanner({ mode, onInstall, onDismiss }: { mode: Exclude<InstallMode, 'none'>; onInstall: () => void; onDismiss: () => void }) {
  return (
    <div className="pwa-banner" role="region" aria-label="Instalar la app">
      <p>{mode === 'ios' ? IOS_INSTALL_TEXT : INSTALL_TEXT}</p>
      <div className="btnrow">
        {mode === 'prompt' && <button className="primary" onClick={onInstall}>Instalar</button>}
        <button className={mode === 'ios' ? 'primary' : 'ghost'} onClick={onDismiss}>{mode === 'ios' ? 'Entendido' : 'Ahora no'}</button>
      </div>
    </div>
  )
}

export function UpdateBanner({ onUpdate, onLater }: { onUpdate: () => void; onLater: () => void }) {
  return (
    <div className="pwa-banner" role="region" aria-label="Versión nueva">
      <p>{UPDATE_TEXT}</p>
      <div className="btnrow">
        <button className="primary" onClick={onUpdate}>Actualizar</button>
        <button className="ghost" onClick={onLater}>Más tarde</button>
      </div>
    </div>
  )
}
