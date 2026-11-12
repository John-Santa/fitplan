// Texto estatico de la guia "Guía", tomado verbatim del plan de L1.
// Datos tipados (no JSX) para poder probarlo.
import type { TrainingPlan } from '../../../lib/types'
import { isBackCarePlan } from '../../../lib/defaultPlan'

export const GUIDE_INTRO =
  'Con una protrusión discal, el progreso rápido viene de entrenar constante y sin lesionarte, no de cargar pesado desde la semana 1. Este plan prioriza máquinas y ejercicios que no comprimen ni flexionan la columna bajo carga.'

export const GUIDE_DISCLAIMER =
  'Aviso: no soy médico ni fisioterapeuta. Muéstrale este plan a tu ortopedista o fisio antes de empezar, sobre todo si la protrusión te da síntomas hoy.'

export const RED_FLAGS_TITLE = 'Detente y consulta si aparece:'

export const URGENT_RED_FLAG =
  'Pérdida de control de orina o esfínteres, o adormecimiento en la zona genital: esto es urgencia, ve a la clínica ese mismo día.'

export interface RedFlag {
  text: string
  /** Señal que pide ir a la clínica el mismo día. Se muestra con icono y negrita. */
  urgent?: boolean
}

export const RED_FLAGS: readonly RedFlag[] = [
  { text: 'Dolor, hormigueo o adormecimiento que baja por la pierna (y peor si pasa de la rodilla).' },
  { text: 'Debilidad en una pierna o pie.' },
  { text: 'Dolor que empeora durante la sesión y sigue peor al día siguiente.' },
  { text: URGENT_RED_FLAG, urgent: true },
]

/** Reglas de oro, sin el numero: la vista los numera. */
export const GOLDEN_RULES: readonly string[] = [
  'Columna neutra siempre: mantén la curva natural, sin redondear ni arquear de más. Con rectificación lumbar tu tendencia es aplanar la zona baja; piensa en "sacar un poco la cola" sin exagerar.',
  'Bisagra de cadera: para bajar o agacharte, dobla las caderas, no la espalda.',
  'Respira y aprieta el abdomen (como si te fueran a dar un golpe suave) antes de cada repetición.',
  'Nada de flexión de columna con carga (abdominales tipo crunch, tocarse los pies con peso).',
  'Regla del semáforo para el dolor: 0–2/10 que se va al terminar está bien; 3–5/10 baja peso o rango; más de 5/10 o que se queda al día siguiente, cambia el ejercicio.',
  'Evita entrenar la espalda en la primera hora después de despertarte: los discos están más hidratados y sensibles. Si vas temprano, alarga el calentamiento.',
]

/** Parrafos de "Cómo funciona el plan", en el orden de L1. */
export const PLAN_PARAGRAPHS: readonly string[] = [
  'Son 5 sesiones de 50–70 minutos: dos de pierna, dos de tren superior y una de core, movilidad y cardio. Cada músculo grande se entrena 2 veces por semana, que es lo que mejor funciona para principiantes.',
  'Intensidad (RIR = repeticiones en reserva): termina cada serie sintiendo que podrías hacer 2–3 repeticiones más con buena técnica. Al principio nada de ir al fallo.',
  'Progresión doble: cada ejercicio tiene un rango, por ejemplo 3 × 10–12.',
]

/** Pasos de la progresion doble, numerados en la vista. */
export const DOUBLE_PROGRESSION_STEPS: readonly string[] = [
  'Empieza con un peso con el que hagas 10 reps limpias.',
  'Cada sesión intenta sumar 1 repetición.',
  'Cuando completes todas las series en 12, sube el peso lo mínimo posible (1 placa en máquina, 1–2 kg en mancuernas) y vuelve a 10.',
]

export const PLAN_PARAGRAPHS_AFTER_PROGRESSION: readonly string[] = [
  'Descansos: 90–120 s en ejercicios grandes, 60 s en accesorios y core.',
  'Anota todo (peso, series, reps, dolor 0–10) en el celular. Sin registro no hay progresión.',
  'Equipo: el plan usa máquinas guiadas, poleas, mancuernas y el multipower (Smith), que son estándar en las sedes Smart Fit. Si una máquina no está o está ocupada, usa la alternativa indicada. Pide al instructor de turno que te enseñe a ajustar asiento y respaldo las primeras veces; está incluido en tu plan.',
]

export const FOUR_DAY_TIP =
  'Si una semana solo puedes ir 4 días, quita el Día 3 y haz sus 3 ejercicios de core al final de las otras sesiones.'

export const AVOID_INTRO =
  'No están prohibidos para siempre: algunos se pueden introducir después de 3–6 meses sin síntomas y con el visto bueno de tu fisio.'

export interface AvoidRow {
  avoid: string
  why: string
  replacement: string
}

export const AVOID_ROWS: readonly AvoidRow[] = [
  {
    avoid: 'Abdominales crunch, sit-ups, máquina de abdomen, giros rusos',
    why: 'Flexión y rotación repetida de la columna: el patrón que más estresa el disco',
    replacement: 'Dead bug, curl-up modificado, Pallof press, planchas',
  },
  {
    avoid: 'Sentadilla con barra en la espalda',
    why: 'Carga directa y alta sobre la columna',
    replacement: 'Prensa, goblet squat, split squat en multipower',
  },
  {
    avoid: 'Peso muerto convencional desde el piso',
    why: 'Exige mucha técnica; error común = redondear la espalda con carga',
    replacement: 'Hip thrust, pull-through, rumano liviano desde semana 5',
  },
  {
    avoid: 'Buenos días (good mornings)',
    why: 'Gran palanca sobre la zona lumbar',
    replacement: 'Pull-through en polea',
  },
  {
    avoid: 'Máquina de hiperextensiones con mucho rango o peso',
    why: 'Flexión-extensión lumbar repetida',
    replacement: 'Bird dog, hip thrust',
  },
  {
    avoid: 'Remo con barra inclinado (sin apoyo)',
    why: 'La espalda baja sostiene todo el torso',
    replacement: 'Remo con apoyo de pecho o a una mano en banco',
  },
  {
    avoid: 'Press militar de pie con barra',
    why: 'Tendencia a arquear la zona lumbar',
    replacement: 'Press de hombro sentado en máquina',
  },
  {
    avoid: 'Elevaciones de piernas colgado',
    why: 'Tiran de la pelvis y arquean la zona lumbar',
    replacement: 'Dead bug',
  },
]

export const PROGRESSION_INTRO =
  'Las primeras 2 semanas parecen fáciles a propósito: tus músculos se adaptan rápido, pero discos y tendones necesitan más tiempo.'

export const PROGRESSION_OUTRO =
  'En la semana 12 revisa el plan con tu fisio y decide qué cambiar o introducir.'

export const HABITS_TITLE = 'Hábitos para 8 horas de escritorio'

export const HABITS: readonly string[] = [
  'Levántate cada 45–60 min aunque sea 2 min: camina, haz 5 extensiones de pie con las manos en la cintura, o 10 sentadillas al aire.',
  'Pantalla a la altura de los ojos, pies apoyados, cadera un poco más alta que las rodillas, cojín o toalla enrollada en la zona lumbar.',
  'Mantén tus 10.000 pasos: caminar es de lo mejor que existe para la espalda. Cuenta como cardio de base.',
  'Proteína: apunta a 1,6–2 g por kg de peso al día (pollo, huevos, carne, lácteos, legumbres, whey si te queda práctico).',
  'Duerme 7–9 horas: ahí es donde realmente progresas.',
  'Si un día la espalda está irritada, no faltes: haz solo el Día 3 suave y camina.',
]

/* ---------- general template ---------- */

// The text above is specific to a disc protrusion and belongs to the
// "espalda protegida" template. The general template gets its own, shorter
// guide with no back-specific advice.

export const GENERIC_GUIDE_INTRO =
  'Este plan reparte el trabajo en tres sesiones de cuerpo completo por semana. El progreso viene de entrenar constante, con buena técnica, y de sumar repeticiones y peso poco a poco.'

export const GENERIC_GUIDE_DISCLAIMER =
  'Aviso: MagniFit no sustituye la valoración de un médico o fisioterapeuta. Si tienes una lesión, dolor o una condición de salud, consulta antes de empezar.'

export const GENERIC_RED_FLAGS: readonly RedFlag[] = [
  { text: 'Dolor agudo o punzante en una articulación durante un ejercicio.' },
  { text: 'Dolor que empeora durante la sesión y sigue peor al día siguiente.' },
  { text: 'Dolor en el pecho, mareo o falta de aire fuera de lo normal: detente y busca atención médica ese mismo día.', urgent: true },
]

export const GENERIC_PLAN_PARAGRAPHS: readonly string[] = [
  'Son 3 sesiones de 50–60 minutos con un día de descanso entre cada una. Cada músculo grande se entrena 3 veces por semana con pocas series por sesión, lo que funciona bien para empezar.',
  PLAN_PARAGRAPHS[1],
  PLAN_PARAGRAPHS[2],
]

export const GENERIC_PLAN_PARAGRAPHS_AFTER_PROGRESSION: readonly string[] = [
  PLAN_PARAGRAPHS_AFTER_PROGRESSION[0],
  'Anota todo (peso, series y reps) en la app. Sin registro no hay progresión.',
]

export const GENERIC_PROGRESSION_INTRO =
  'Las primeras 2 semanas parecen fáciles a propósito: sirven para aprender la técnica y el ajuste de cada máquina.'

export const GENERIC_PROGRESSION_OUTRO =
  'En la semana 12 compara tu registro con la semana 1 y decide qué cambiar en el siguiente bloque.'

/** Everything the guide shows, for one plan. null = the section does not
 *  apply to that template. */
export interface GuideContent {
  intro: string
  disclaimer: string
  redFlags: readonly RedFlag[]
  goldenRules: readonly string[] | null
  planParagraphs: readonly string[]
  progressionSteps: readonly string[]
  afterProgression: readonly string[]
  fourDayTip: string | null
  avoid: { intro: string; rows: readonly AvoidRow[] } | null
  progressionIntro: string
  progressionOutro: string
  habits: { title: string; items: readonly string[] } | null
}

/** The disc-protrusion guide stays tied to the "espalda protegida" plan
 *  (edited or not); any other plan gets the general guide. */
export function guideContentFor(plan: Pick<TrainingPlan, 'id'>): GuideContent {
  if (isBackCarePlan(plan)) {
    return {
      intro: GUIDE_INTRO,
      disclaimer: GUIDE_DISCLAIMER,
      redFlags: RED_FLAGS,
      goldenRules: GOLDEN_RULES,
      planParagraphs: PLAN_PARAGRAPHS,
      progressionSteps: DOUBLE_PROGRESSION_STEPS,
      afterProgression: PLAN_PARAGRAPHS_AFTER_PROGRESSION,
      fourDayTip: FOUR_DAY_TIP,
      avoid: { intro: AVOID_INTRO, rows: AVOID_ROWS },
      progressionIntro: PROGRESSION_INTRO,
      progressionOutro: PROGRESSION_OUTRO,
      habits: { title: HABITS_TITLE, items: HABITS },
    }
  }
  return {
    intro: GENERIC_GUIDE_INTRO,
    disclaimer: GENERIC_GUIDE_DISCLAIMER,
    redFlags: GENERIC_RED_FLAGS,
    goldenRules: null,
    planParagraphs: GENERIC_PLAN_PARAGRAPHS,
    progressionSteps: DOUBLE_PROGRESSION_STEPS,
    afterProgression: GENERIC_PLAN_PARAGRAPHS_AFTER_PROGRESSION,
    fourDayTip: null,
    avoid: null,
    progressionIntro: GENERIC_PROGRESSION_INTRO,
    progressionOutro: GENERIC_PROGRESSION_OUTRO,
    habits: null,
  }
}
