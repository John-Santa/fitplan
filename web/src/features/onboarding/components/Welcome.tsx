import { lazy, Suspense, useRef, useState, type ReactNode } from 'react'
import { importBackup } from '../../../lib/db'
import { useStore } from '../../../lib/store'
import { useToast } from '../../../components/ui'
import { fmtDate } from '../../../lib/calc'
import { MEASUREMENT_KEYS, MEASUREMENT_LABELS, MEASUREMENT_STEPS, MEASUREMENT_UNITS } from '../../../lib/plan'
import { PLAN_TEMPLATES } from '../../../lib/defaultPlan'
import { authEnabled, useAuthState } from '../../account/lib/auth'
import { enqueueAllLocalChanges } from '../../sync/lib/engine'
import { useSyncStatus } from '../../sync/lib/useSync'
import { BACKUP_INVITE_TEXT, SIGN_IN_OFFLINE_TEXT, connectingText } from '../lib/accountEntry'
import {
  BLOCK_WEEKS,
  blockEndFor,
  buildOnboarding,
  initialAnswers,
  stepError,
  welcomeSteps,
  type GoalKey,
  type OnboardingAnswers,
  type WelcomeStep,
} from '../lib/onboarding'
import './onboarding.css'

// Clerk only loads with a key configured; without it this is never imported.
const AccountEntryButtons = lazy(() =>
  import('../../account/components/clerkAuth.tsx').then(m => ({ default: m.AccountEntryButtons })),
)

export const MEDICAL_NOTICE =
  'MagniFit es una herramienta personal de seguimiento y no sustituye la valoración de un médico, fisioterapeuta o nutricionista. Consulta con un profesional antes de empezar un plan de ejercicio, sobre todo si tienes una lesión, dolor o una condición de salud.'

const STEP_TITLES: Record<WelcomeStep, string> = {
  welcome: 'Te damos la bienvenida a MagniFit',
  profile: 'Tu estatura y tus metas',
  measures: 'Tus medidas de hoy',
  block: 'Tu bloque de 12 semanas',
  template: 'Tu plan de entrenamiento',
  account: 'Respalda tus datos',
}

/** One number field per measure, with the same labels and units as Medidas. */
function MeasureFields({ prefix, values, onChange }: {
  prefix: string
  values: Partial<Record<GoalKey, string>>
  onChange: (k: GoalKey, v: string) => void
}) {
  return (
    <div className="formgrid">
      {MEASUREMENT_KEYS.map(k => (
        <div key={k}>
          <label htmlFor={`${prefix}-${k}`}>{MEASUREMENT_LABELS[k]} ({MEASUREMENT_UNITS[k]})</label>
          <input
            id={`${prefix}-${k}`} type="number" inputMode="decimal" step={MEASUREMENT_STEPS[k]}
            value={values[k] ?? ''} onChange={e => onChange(k, e.target.value)}
          />
        </div>
      ))}
    </div>
  )
}

/** Account invitation inside the welcome (only with login configured). */
function AccountStep() {
  const auth = useAuthState()
  const connecting = connectingText(useSyncStatus())
  if (auth.isSignedIn) {
    return (
      <div className="card">
        <p style={{ margin: 0 }}>
          Sesión iniciada{auth.user?.email ? ` como ${auth.user.email}` : ''}. Si tu cuenta ya tenía datos, aparecen
          aquí en cuanto se sincronicen.
        </p>
        {connecting && <p className="hint" role="status">{connecting}</p>}
      </div>
    )
  }
  return (
    <div className="card">
      <p style={{ marginTop: 0 }}>{BACKUP_INVITE_TEXT} Es opcional: también puedes hacerlo después desde Perfil.</p>
      {!auth.enabled ? (
        <p className="hint">{SIGN_IN_OFFLINE_TEXT}</p>
      ) : auth.isLoaded ? (
        <Suspense fallback={null}><AccountEntryButtons /></Suspense>
      ) : null}
    </div>
  )
}

/** Welcome for a new install (F1). Nothing is saved until the last step:
 *  then the plan, the measurement (only if entered) and, last, the config,
 *  whose presence is what ends the welcome. */
/** `notice` renders above the steps, like the app shell's notices (the
 *  moved notice of the Pages build, S1). */
export default function Welcome({ notice }: { notice?: ReactNode } = {}) {
  const { savePlan, saveMeasurement, saveConfig, restart } = useStore()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const steps = welcomeSteps(authEnabled)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => initialAnswers(new Date()))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const step = steps[index]
  const isLast = index === steps.length - 1

  const set = (patch: Partial<OnboardingAnswers>) => {
    setAnswers(a => ({ ...a, ...patch }))
    setError(null)
  }

  const finish = async () => {
    // Every step again: going back can leave an earlier one invalid.
    const invalid = steps.map(s => stepError(s, answers)).find(e => e != null)
    if (invalid) {
      setError(invalid)
      return
    }
    setBusy(true)
    try {
      const out = buildOnboarding(answers, new Date())
      await savePlan(out.plan)
      if (out.measurement) await saveMeasurement(out.measurement)
      await saveConfig(out.config)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Inténtalo de nuevo.')
      setBusy(false)
    }
  }

  const next = () => {
    const e = stepError(step, answers)
    if (e) {
      setError(e)
      return
    }
    if (isLast) void finish()
    else setIndex(index + 1)
  }

  const back = () => {
    setError(null)
    setIndex(Math.max(0, index - 1))
  }

  const skipMeasures = () => {
    setAnswers(a => ({ ...a, measures: {} }))
    setError(null)
    setIndex(index + 1)
  }

  const restore = async (file: File) => {
    setBusy(true)
    try {
      const data: unknown = JSON.parse(await file.text())
      await importBackup(data, 'replace')
      if (authEnabled) await enqueueAllLocalChanges()
      // With a config in the backup the welcome ends here; without one the
      // restored history stays and the welcome continues.
      await restart()
      const hasConfig = typeof data === 'object' && data !== null && (data as { config?: unknown }).config != null
      toast.show(hasConfig ? 'Datos restaurados' : 'Restauramos tu historial. Completa la bienvenida para seguir.')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo leer el archivo')
    } finally {
      setBusy(false)
    }
  }

  const blockEnd = stepError('block', answers) == null ? blockEndFor(answers.blockStart, BLOCK_WEEKS) : null

  return (
    <div className="app">
      {notice}
      <main className="main onboarding">
        <div className="eyebrow">{`Paso ${index + 1} de ${steps.length}`}</div>
        <h1>{STEP_TITLES[step]}</h1>

        {step === 'welcome' && (
          <>
            <p>Vamos a armar tu perfil y tu plan en un par de minutos. Todo se guarda en este dispositivo.</p>
            <div className="card warn">
              <strong>Aviso médico</strong>
              <p style={{ margin: '4px 0 0' }}>{MEDICAL_NOTICE}</p>
            </div>
          </>
        )}

        {step === 'profile' && (
          <>
            <div className="card">
              <label htmlFor="ob-height">Estatura (cm)</label>
              <input
                id="ob-height" type="number" inputMode="decimal" step="0.5" value={answers.height}
                onChange={e => set({ height: e.target.value })}
              />
              <p className="hint">Se usa para el IMC, el FFMI y el índice cintura/estatura.</p>
            </div>
            <div className="section-title">Metas del bloque (opcionales)</div>
            <div className="card">
              <MeasureFields prefix="ob-goal" values={answers.goals} onChange={(k, v) => set({ goals: { ...answers.goals, [k]: v } })} />
              <p className="hint">Las metas que dejes vacías quedan sin definir. Puedes cambiarlas cuando quieras en Perfil.</p>
            </div>
          </>
        )}

        {step === 'measures' && (
          <div className="card">
            <p style={{ marginTop: 0 }}>
              Opcional. Si las dejas vacías no se guarda ninguna medición; puedes registrar la primera después en Progreso.
            </p>
            <MeasureFields prefix="ob-now" values={answers.measures} onChange={(k, v) => set({ measures: { ...answers.measures, [k]: v } })} />
            <p className="hint">Si guardas medidas, el peso es obligatorio.</p>
          </div>
        )}

        {step === 'block' && (
          <div className="card">
            <label htmlFor="ob-start">Inicio del bloque</label>
            <input id="ob-start" type="date" value={answers.blockStart} onChange={e => set({ blockStart: e.target.value })} />
            <p className="hint">
              Dura {BLOCK_WEEKS} semanas{blockEnd ? ` y termina el ${fmtDate(blockEnd, true)}` : ''}. Por defecto empieza el
              lunes siguiente.
            </p>
          </div>
        )}

        {step === 'template' && (
          <fieldset className="ob-templates">
            <legend className="ob-sr">Plantilla de plan</legend>
            {PLAN_TEMPLATES.map(t => (
              <label key={t.id} className={`card ob-option${answers.template === t.id ? ' on' : ''}`}>
                <input
                  type="radio" name="ob-template" value={t.id}
                  checked={answers.template === t.id} onChange={() => set({ template: t.id })}
                />
                <span>
                  <strong>{t.name}</strong>
                  <span className="ob-option-text">{t.description}</span>
                </span>
              </label>
            ))}
            <p className="hint">Después puedes editar rutinas y ejercicios desde Plan.</p>
          </fieldset>
        )}

        {step === 'account' && <AccountStep />}

        {error && <p className="hint ob-error" role="alert">{error}</p>}

        <div className="btnrow ob-nav">
          {index > 0 && <button className="ghost" onClick={back} disabled={busy}>Atrás</button>}
          {step === 'measures' && <button onClick={skipMeasures} disabled={busy}>Omitir</button>}
          <button className="primary grow" onClick={next} disabled={busy}>
            {isLast ? 'Empezar a entrenar' : step === 'welcome' ? 'Empezar' : 'Siguiente'}
          </button>
        </div>

        {step === 'welcome' && (
          <div className="ob-restore">
            <p className="hint">¿Ya usabas MagniFit en otro dispositivo?</p>
            <button onClick={() => fileRef.current?.click()} disabled={busy}>Restaurar un respaldo</button>
            <input
              ref={fileRef} type="file" accept="application/json" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = '' }}
            />
          </div>
        )}
      </main>
      {toast.node}
    </div>
  )
}
