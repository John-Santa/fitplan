// Contenedor de los avisos de la PWA para la estructura de la app. Ningún aviso
// aparece con un entrenamiento en curso.
import { loadActiveDraft } from '../../session/lib/activeSession'
import { useInstallPrompt } from '../lib/useInstallPrompt'
import { useUpdatePrompt } from '../lib/useUpdatePrompt'
import { useWorkoutActive } from '../lib/useWorkoutActive'
import { showUpdatePrompt } from '../lib/updatePolicy'
import { InstallBanner, UpdateBanner } from './PwaBanners'

export function PwaPrompts() {
  const install = useInstallPrompt()
  const update = useUpdatePrompt()
  const workoutActive = useWorkoutActive(update.needRefresh || install.mode !== 'none')

  if (showUpdatePrompt(update.needRefresh, workoutActive)) {
    // Se vuelve a mirar al tocar: el entrenamiento pudo empezar después del último sondeo.
    return <UpdateBanner onUpdate={() => { if (!loadActiveDraft()) update.apply() }} onLater={update.later} />
  }
  if (!workoutActive && !update.needRefresh && install.mode !== 'none') {
    return <InstallBanner mode={install.mode} onInstall={install.install} onDismiss={install.dismiss} />
  }
  return null
}
