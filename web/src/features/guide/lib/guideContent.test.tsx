import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import {
  AVOID_ROWS,
  GOLDEN_RULES,
  HABITS,
  RED_FLAGS,
  URGENT_RED_FLAG,
  guideContentFor,
} from './guideContent'
import { GuideView } from '../routes/Guide'
import { BACK_CARE_PLAN_ID, DEFAULT_PLAN, GENERIC_PLAN } from '../../../lib/defaultPlan'
import { DEFAULT_CONFIG } from '../../../lib/plan'

describe('guideContent: texto verbatim de la guia', () => {
  it('la señal urgente es la linea de urgencia de L1', () => {
    expect(URGENT_RED_FLAG).toBe(
      'Pérdida de control de orina o esfínteres, o adormecimiento en la zona genital: esto es urgencia, ve a la clínica ese mismo día.',
    )
    expect(RED_FLAGS.filter(f => f.urgent).map(f => f.text)).toEqual([URGENT_RED_FLAG])
  })

  it('la regla 5 es el semaforo del dolor', () => {
    expect(GOLDEN_RULES[4]).toBe(
      'Regla del semáforo para el dolor: 0–2/10 que se va al terminar está bien; 3–5/10 baja peso o rango; más de 5/10 o que se queda al día siguiente, cambia el ejercicio.',
    )
  })

  it('una fila de la tabla de evitar es verbatim', () => {
    expect(AVOID_ROWS[1]).toEqual({
      avoid: 'Sentadilla con barra en la espalda',
      why: 'Carga directa y alta sobre la columna',
      replacement: 'Prensa, goblet squat, split squat en multipower',
    })
  })

  it('un habito es verbatim', () => {
    expect(HABITS[3]).toBe(
      'Proteína: apunta a 1,6–2 g por kg de peso al día (pollo, huevos, carne, lácteos, legumbres, whey si te queda práctico).',
    )
  })
})

describe('guide content follows the plan template', () => {
  it('"espalda protegida" keeps the disc-protrusion guide as before', () => {
    const c = guideContentFor({ id: BACK_CARE_PLAN_ID })
    expect(c.intro).toContain('protrusión discal')
    expect(c.redFlags).toBe(RED_FLAGS)
    expect(c.goldenRules).toBe(GOLDEN_RULES)
    expect(c.avoid?.rows).toBe(AVOID_ROWS)
    expect(c.habits?.items).toBe(HABITS)
  })

  it('the general template gets no disc-specific content', () => {
    const c = guideContentFor({ id: 'general' })
    expect(JSON.stringify(c)).not.toMatch(/protrusi|disco|lumbar|columna|esfínteres/i)
    expect(c.goldenRules).toBeNull()
    expect(c.avoid).toBeNull()
    expect(c.habits).toBeNull()
    expect(c.redFlags.some(f => f.urgent)).toBe(true)
  })

  it('the guide view renders the general content for the general plan', () => {
    const html = renderToString(<GuideView plan={GENERIC_PLAN} config={DEFAULT_CONFIG} onBack={() => {}} />)
    expect(html).not.toContain('protrusión')
    expect(html).not.toContain('Reglas de oro para tu espalda')
    expect(html).toContain('Progresión en 12 semanas')
    const back = renderToString(<GuideView plan={DEFAULT_PLAN} config={DEFAULT_CONFIG} onBack={() => {}} />)
    expect(back).toContain('protrusión discal')
    expect(back).toContain('Reglas de oro para tu espalda')
  })
})

describe('guideContent: conteos', () => {
  it('4 señales de alarma, 6 reglas de oro, 8 filas a evitar, 6 habitos', () => {
    expect(RED_FLAGS).toHaveLength(4)
    expect(GOLDEN_RULES).toHaveLength(6)
    expect(AVOID_ROWS).toHaveLength(8)
    expect(HABITS).toHaveLength(6)
  })
})
