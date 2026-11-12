import BottomSheet from '../../../components/BottomSheet'
import { useStore } from '../../../lib/store'
import { RED_FLAGS_TITLE, guideContentFor, type RedFlag } from '../lib/guideContent'
import { blockWeekNumber, phaseForWeek } from '../../../lib/phases'
import type { Config, Phase, TrainingPlan } from '../../../lib/types'
import './guide.css'

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="guide-icon">
      <path d="M12 4 2.5 20h19L12 4z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="guide-icon">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.01" />
    </svg>
  )
}

/** Lista de señales de alarma. La urgente lleva icono, negrita y borde critico,
 *  no solo color. */
function RedFlagList({ flags }: { flags: readonly RedFlag[] }) {
  return (
    <ul className="guide-red-flags">
      {flags.map(flag => (
        <li key={flag.text} className={flag.urgent ? 'is-urgent' : undefined}>
          {flag.urgent ? (
            <>
              <AlertIcon />
              <strong>
                <span className="guide-sr">Urgente: </span>
                {flag.text}
              </strong>
            </>
          ) : (
            <>
              <span className="guide-bullet" aria-hidden="true" />
              <span>{flag.text}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

function weekRange(phase: Phase): string {
  return phase.fromWeek === phase.toWeek ? `${phase.fromWeek}` : `${phase.fromWeek}–${phase.toWeek}`
}

/** Pantalla "Guía": texto de L1 en secciones, con la tabla de progresion del plan. */
export default function Guide({ onBack }: { onBack: () => void }) {
  const { plan, config } = useStore()
  return <GuideView plan={plan} config={config} onBack={onBack} />
}

/** The guide for one plan (presentational). The disc-protrusion sections only
 *  exist for the "espalda protegida" template (see guideContentFor). */
export function GuideView({ plan, config, onBack }: { plan: TrainingPlan; config: Config; onBack: () => void }) {
  const c = guideContentFor(plan)
  const currentWeek = blockWeekNumber(new Date(), config.blockStart)
  const currentPhase = phaseForWeek(plan, currentWeek)

  return (
    <div className="guide">
      <header className="guide-head">
        <button type="button" className="ghost guide-back" onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          Volver
        </button>
        <h1 className="guide-title">Guía</h1>
      </header>

      <main className="guide-body">
        <section className="guide-section" aria-labelledby="guide-before">
          <h2 id="guide-before" className="section-title">Antes de empezar</h2>
          <p className="guide-lead">{c.intro}</p>
          <aside className="guide-callout">
            <InfoIcon />
            <p>{c.disclaimer}</p>
          </aside>
        </section>

        <section className="guide-section" aria-labelledby="guide-flags">
          <h2 id="guide-flags" className="section-title">{RED_FLAGS_TITLE}</h2>
          <RedFlagList flags={c.redFlags} />
        </section>

        {c.goldenRules && (
          <section className="guide-section" aria-labelledby="guide-rules">
            <h2 id="guide-rules" className="section-title">Reglas de oro para tu espalda</h2>
            <ol className="guide-rules">
              {c.goldenRules.map(rule => (
                <li key={rule}>{rule}</li>
              ))}
            </ol>
          </section>
        )}

        <section className="guide-section" aria-labelledby="guide-plan">
          <h2 id="guide-plan" className="section-title">Cómo funciona el plan</h2>
          {c.planParagraphs.map(p => (
            <p key={p}>{p}</p>
          ))}
          <ol className="guide-steps">
            {c.progressionSteps.map(step => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {c.afterProgression.map(p => (
            <p key={p}>{p}</p>
          ))}
          {c.fourDayTip && (
            <aside className="guide-callout">
              <InfoIcon />
              <p>{c.fourDayTip}</p>
            </aside>
          )}
        </section>

        {c.avoid && (
          <section className="guide-section" aria-labelledby="guide-avoid">
            <h2 id="guide-avoid" className="section-title">Ejercicios a evitar por ahora</h2>
            <p>{c.avoid.intro}</p>
            <table className="guide-table">
              <caption className="guide-sr">Ejercicios a evitar, por qué y su reemplazo</caption>
              <thead>
                <tr>
                  <th scope="col">Evitar</th>
                  <th scope="col">Por qué</th>
                  <th scope="col">Reemplazo</th>
                </tr>
              </thead>
              <tbody>
                {c.avoid.rows.map(row => (
                  <tr key={row.avoid}>
                    <th scope="row">{row.avoid}</th>
                    <td data-label="Por qué">{row.why}</td>
                    <td data-label="Reemplazo">{row.replacement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="guide-section" aria-labelledby="guide-progression">
          <h2 id="guide-progression" className="section-title">Progresión en 12 semanas</h2>
          <p>{c.progressionIntro}</p>
          <table className="guide-table guide-progression">
            <caption className="guide-sr">Progresión por semanas del bloque</caption>
            <thead>
              <tr>
                <th scope="col">Semanas</th>
                <th scope="col">Series</th>
                <th scope="col">Intensidad</th>
                <th scope="col">Objetivo</th>
              </tr>
            </thead>
            <tbody>
              {plan.phases.map(phase => {
                const isCurrent = phase === currentPhase
                return (
                  <tr key={phase.fromWeek} className={isCurrent ? 'is-current' : undefined} aria-current={isCurrent ? 'true' : undefined}>
                    <th scope="row">
                      {weekRange(phase)}
                      {isCurrent && <span className="pill good guide-now">Semana actual</span>}
                    </th>
                    <td data-label="Series">{phase.sets}</td>
                    <td data-label="Intensidad">{phase.intensity}</td>
                    <td data-label="Objetivo">{phase.goal}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p>{c.progressionOutro}</p>
        </section>

        {c.habits && (
          <section className="guide-section" aria-labelledby="guide-habits">
            <h2 id="guide-habits" className="section-title">{c.habits.title}</h2>
            <ul className="guide-list">
              {c.habits.items.map(habit => (
                <li key={habit}>{habit}</li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}

/** Hoja con solo las señales de alarma y el aviso, abrible desde la sesion. */
export function RedFlagsSheet({ onClose }: { onClose: () => void }) {
  const c = guideContentFor(useStore().plan)
  return (
    <BottomSheet title={RED_FLAGS_TITLE} onClose={onClose}>
      <RedFlagList flags={c.redFlags} />
      <aside className="guide-callout">
        <InfoIcon />
        <p>{c.disclaimer}</p>
      </aside>
    </BottomSheet>
  )
}
