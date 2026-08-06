import type { Config, DayKind, DayPlan, Routine, RoutineId, WeeklyRoutine } from '../types'

export const MW = 'https://musclewiki.com/es-es/exercise/'

/* ---------- semana configurable ---------- */

/** Etiqueta de cada tipo de dia. Al ser Record<DayKind, string>, agregar un
 *  DayKind rompe la compilacion aca hasta que se le de nombre, y de esta misma
 *  tabla salen las opciones del selector, el validador y el titulo por defecto
 *  de los dias que no son de entreno. */
export const KIND_LABELS: Record<DayKind, string> = {
  training: 'Entreno',
  swim: 'Natación',
  walk: 'Caminata larga',
  rest: 'Descanso activo',
  custom: 'Personalizado',
}

/** Opciones del selector, en el orden de KIND_LABELS. Deriva de la tabla, asi
 *  que no puede quedar desincronizada. */
export const DAY_KINDS: DayKind[] = Object.keys(KIND_LABELS).filter(isDayKind)

/** Nombre del dia en minuscula. Unica fuente: de aca salen el encabezado de
 *  Inicio, el titulo de cada fila de Ajustes y la abreviatura de la insignia. */
export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** "Lunes": el mismo nombre con mayuscula inicial. */
export const weekdayLabel = (dow: number): string =>
  WEEKDAYS[dow].charAt(0).toUpperCase() + WEEKDAYS[dow].slice(1)

/** "Lun": abreviatura para la insignia de Inicio. */
export const weekdayAbbr = (dow: number): string => weekdayLabel(dow).slice(0, 3)

/** El bloque "ya entrenaste" de Inicio. No es un dia de la semana: es un estado
 *  que gana sobre cualquier kind. */
export const DONE_TODAY = {
  title: 'Sesión hecha',
  note: 'Ya entrenaste hoy. Lo que queda es dormir 7 horas y media.',
}

const GYM_NOTE = '20:30 en el gimnasio'
const SWIM_NOTE = '20:00 a 21:00. Cierra el segundo trabajo a las 19:30 y come la fruta o el batido antes de salir. En casa a las 22:30, cena lista para calentar y a dormir a las 23:30.'

/** La semana que trae la app instalada: exactamente el calendario que estaba
 *  escrito a mano en Home.tsx:56-88. title vacio = se deriva al renderizar. */
export const DEFAULT_WEEKLY_ROUTINE: WeeklyRoutine = [
  { kind: 'rest', title: '', note: 'Estiramiento y caminata liviana. Dedica dos horas a cocinar las cinco cenas de la semana: con cena a las 22:15, esta es la tarea más importante del domingo.' },
  { kind: 'training', routineId: 'dia1', title: '', note: GYM_NOTE },
  { kind: 'swim', title: '', note: SWIM_NOTE },
  { kind: 'training', routineId: 'dia2', title: '', note: GYM_NOTE },
  { kind: 'swim', title: '', note: SWIM_NOTE },
  { kind: 'training', routineId: 'dia3', title: '', note: GYM_NOTE },
  { kind: 'walk', title: '', note: '60 a 75 minutos a la hora que quieras. Dormir 8 h 45.' },
]

export const DEFAULT_CONFIG: Config = {
  heightCm: 173,
  blockStart: '2026-08-04',
  blockEnd: '2026-09-28',
  goal: {
    weight: 76.5,
    fatPct: 22.2,
    fatMass: 17.0,
    muscle: 32.2,
    water: 43.6,
    waist: 96.5,
    hip: 97.5,
    chest: 102.5,
    neck: 40.5,
  },
  weeklyRoutine: DEFAULT_WEEKLY_ROUTINE,
}

export const BASELINE = {
  date: '2026-08-03',
  weight: 83.0,
  fatPct: 28.5,
  fatMass: 23.7,
  muscle: 31.8,
  water: 43.4,
  waist: 105,
  hip: 101,
  chest: 108,
  neck: 42,
}

export const ROUTINES: Routine[] = [
  {
    id: 'dia1',
    name: 'Día 1 — Pierna',
    zone: 'Cuádriceps, isquiotibiales, glúteo y gemelo',
    warmup: '8 min de bicicleta estática o caminadora a ritmo suave.',
    exercises: [
      {
        id: 'leg-press',
        name: 'Prensa de piernas 45°',
        sets: 4, repsLow: 10, repsHigh: 12, restSec: 120, main: true,
        mwSlug: 'machine-leg-press',
        cue: 'Pies a la anchura de los hombros, en el centro de la plataforma. Baja hasta que la rodilla llegue a 90°, sin despegar la cadera del asiento. No bloquees la rodilla al subir.',
      },
      {
        id: 'leg-extension',
        name: 'Extensión de cuádriceps',
        sets: 3, repsLow: 12, repsHigh: 15, restSec: 90,
        mwSlug: 'machine-leg-extension',
        cue: 'El eje de la rodilla alineado con el eje de giro de la máquina. Sube en 1 segundo, baja en 3.',
      },
      {
        id: 'leg-curl',
        name: 'Curl femoral sentado o acostado',
        sets: 3, repsLow: 10, repsHigh: 12, restSec: 90,
        mwSlug: 'machine-seated-leg-curl',
        cue: 'El rodillo justo encima del tendón de Aquiles, no sobre la pantorrilla. La cadera no se levanta al contraer.',
      },
      {
        id: 'glute-machine',
        name: 'Máquina de glúteo',
        sets: 2, repsLow: 10, repsHigh: 12, restSec: 90,
        mwSlug: 'machine-glute-kickback',
        cue: 'Aprieta el glúteo arriba durante 1 segundo. El movimiento sale de la cadera, no de la espalda baja. Son 12 por pierna.',
      },
      {
        id: 'hip-abduction',
        name: 'Máquina de abductores',
        sets: 2, repsLow: 12, repsHigh: 15, restSec: 90,
        mwSlug: 'machine-hip-abduction',
        cue: 'Abre despacio, cierra más despacio todavía. Fortalece el glúteo medio.',
      },
      {
        id: 'calf-raise',
        name: 'Elevación de talones',
        sets: 3, repsLow: 12, repsHigh: 15, restSec: 60,
        mwSlug: 'machine-standing-calf-raises',
        cue: 'Rango completo: estira abajo, pausa de 1 segundo arriba.',
      },
    ],
  },
  {
    id: 'dia2',
    name: 'Día 2 — Empuje',
    zone: 'Pecho, hombro y tríceps',
    warmup: '8 min suaves más una serie muy ligera de press de pecho.',
    exercises: [
      {
        id: 'chest-press',
        name: 'Press de pecho sentado en máquina',
        sets: 4, repsLow: 10, repsHigh: 12, restSec: 90, main: true,
        mwSlug: 'machine-chest-press',
        cue: 'Asiento a la altura que deje las manijas en la mitad del pecho, no en los hombros. Empuja sin bloquear los codos.',
      },
      {
        id: 'incline-chest-press',
        name: 'Press de pecho inclinado en máquina',
        sets: 3, repsLow: 10, repsHigh: 12, restSec: 90,
        mwSlug: 'machine-plate-loaded-incline-chest-press',
        cue: 'Trabaja la porción alta del pecho, que es la que más cambia el aspecto del torso.',
      },
      {
        id: 'pec-deck',
        name: 'Contractora de pecho (pec deck)',
        sets: 2, repsLow: 12, repsHigh: 15, restSec: 90,
        mwSlug: 'machine-pec-fly',
        cue: 'Codos en la línea del pecho. Junta sin chocar las manijas, aguanta medio segundo, abre despacio.',
      },
      {
        id: 'shoulder-press',
        name: 'Press de hombro en máquina',
        sets: 3, repsLow: 10, repsHigh: 12, restSec: 90,
        mwSlug: 'machine-overhand-overhead-press',
        cue: 'Asiento alto para que las manijas queden a la altura de las orejas. Peso conservador: el hombro es lo que más se resiente al volver.',
      },
      {
        id: 'lateral-raise',
        name: 'Elevaciones laterales',
        sets: 3, repsLow: 12, repsHigh: 15, restSec: 60,
        mwSlug: 'cable-low-bilateral-lateral-raise',
        cue: 'Peso liviano de verdad. Sube hasta la altura del hombro y no más. Es lo que más ensancha la silueta.',
      },
      {
        id: 'triceps-pushdown',
        name: 'Extensión de tríceps en polea alta',
        sets: 3, repsLow: 10, repsHigh: 12, restSec: 60,
        mwSlug: 'cable-rope-pushdown',
        cue: 'Codos pegados al costado; solo se mueve el antebrazo. Si los codos se separan, el peso está muy alto.',
      },
      {
        id: 'crunch-machine',
        name: 'Máquina de abdominales',
        sets: 2, repsLow: 12, repsHigh: 15, restSec: 60,
        mwSlug: 'machine-crunch',
        cue: 'Redondea la columna hacia adelante; no es un movimiento de cadera. Baja controlado.',
      },
    ],
  },
  {
    id: 'dia3',
    name: 'Día 3 — Tracción',
    zone: 'Espalda, bíceps y zona lumbar',
    warmup: '8 min suaves. Cierra con 5 min de estiramiento, sin cardio.',
    exercises: [
      {
        id: 'lat-pulldown',
        name: 'Jalón al pecho, agarre ancho',
        sets: 4, repsLow: 10, repsHigh: 12, restSec: 90, main: true,
        mwSlug: 'machine-pulldown',
        cue: 'Rodillo bien ajustado sobre los muslos. Pecho arriba, lleva la barra al esternón tirando con los codos. Nunca detrás de la nuca.',
      },
      {
        id: 'seated-row',
        name: 'Remo sentado en máquina o polea baja',
        sets: 3, repsLow: 10, repsHigh: 12, restSec: 90,
        mwSlug: 'machine-seated-cable-row',
        cue: 'Lleva los codos hacia atrás y junta las escápulas al final. El torso no se mece.',
      },
      {
        id: 'neutral-pulldown',
        name: 'Jalón al pecho, agarre neutro',
        sets: 3, repsLow: 10, repsHigh: 12, restSec: 90,
        mwSlug: 'neutral-pulldown',
        cue: 'El agarre neutro cambia el ángulo de trabajo y es más amable con el hombro y el codo.',
      },
      {
        id: 'pullover',
        name: 'Pullover en polea alta',
        sets: 2, repsLow: 12, repsHigh: 15, restSec: 60,
        mwSlug: 'machine-pullover',
        cue: 'Brazos casi rectos, empuja la barra hacia los muslos en arco. Trabaja el dorsal sin involucrar el bíceps.',
      },
      {
        id: 'biceps-curl',
        name: 'Curl de bíceps en máquina o polea',
        sets: 3, repsLow: 10, repsHigh: 12, restSec: 60,
        mwSlug: 'machine-bicep-curl',
        cue: 'Codos apoyados y quietos. Nada de balancear el cuerpo para subir el peso.',
      },
      {
        id: 'hammer-curl',
        name: 'Curl martillo en polea con cuerda',
        sets: 2, repsLow: 10, repsHigh: 12, restSec: 60,
        mwSlug: 'cable-rope-hammer-curl',
        cue: 'Palmas enfrentadas. Trabaja el braquial y el antebrazo, que es lo que da grosor al brazo.',
      },
      {
        id: 'back-extension',
        name: 'Máquina de espalda baja',
        sets: 2, repsLow: 10, repsHigh: 12, restSec: 60,
        mwSlug: 'machine-45-degree-back-extension',
        cue: 'Recorrido corto y controlado, sin hiperextender al final. Peso liviano siempre.',
      },
    ],
  },
]

export const ALL_EXERCISES = ROUTINES.flatMap(r => r.exercises)
export const exerciseById = (id: string) => ALL_EXERCISES.find(e => e.id === id)
export const routineById = (id: string) => ROUTINES.find(r => r.id === id)

/* ---------- validacion y merge de la configuracion guardada ---------- */

function isDayKind(v: unknown): v is DayKind {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(KIND_LABELS, v)
}

export { isDayKind }

export function isRoutineId(v: unknown): v is RoutineId {
  return ROUTINES.some(r => r.id === v)
}

function isDayPlan(v: unknown): v is DayPlan {
  if (typeof v !== 'object' || v === null) return false
  const d = v as { kind?: unknown; title?: unknown; note?: unknown; routineId?: unknown }
  if (typeof d.title !== 'string' || typeof d.note !== 'string') return false
  if (!isDayKind(d.kind)) return false
  return d.kind !== 'training' || isRoutineId(d.routineId)
}

/** Repara la semana guardada: toda entrada invalida o faltante se reemplaza
 *  entera por la de por defecto de ese mismo dia. Una sola regla, sin estados
 *  a medio arreglar. La anotacion readonly unknown[] evita que Array.isArray
 *  filtre un any[] al resto de la funcion. */
function mergeWeeklyRoutine(stored: unknown): WeeklyRoutine {
  const arr: readonly unknown[] = Array.isArray(stored) ? stored : []
  const at = (i: number): DayPlan => {
    const v = arr[i]
    return isDayPlan(v) ? v : DEFAULT_WEEKLY_ROUTINE[i]
  }
  return [at(0), at(1), at(2), at(3), at(4), at(5), at(6)]
}

/** Config guardada sobre DEFAULT_CONFIG. Lo guardado gana campo por campo;
 *  goal se mezcla un nivel adentro y weeklyRoutine se valida dia por dia.
 *  Recibe unknown a proposito: es el unico punto por donde entra al programa
 *  una Config que no escribio esta version del codigo. */
export function mergeConfig(stored: unknown): Config {
  const c = (stored ?? {}) as Partial<Config>
  return {
    ...DEFAULT_CONFIG,
    ...c,
    goal: { ...DEFAULT_CONFIG.goal, ...(c.goal ?? {}) },
    weeklyRoutine: mergeWeeklyRoutine(c.weeklyRoutine),
  }
}

/** Titulo visible del dia. title vacio = derivado: el nombre de la rutina si es
 *  entreno, la etiqueta del kind si no. Nunca devuelve cadena vacia. */
export function dayTitle(day: DayPlan): string {
  if (day.title.trim() !== '') return day.title
  if (day.kind === 'training') return routineById(day.routineId)?.name ?? KIND_LABELS.training
  return KIND_LABELS[day.kind]
}

/** Rutina de hoy segun la semana configurada. null si el dia no es de entreno. */
export function routineForWeekday(week: WeeklyRoutine, dow: number): Routine | null {
  const day = week[dow]
  return day.kind === 'training' ? (routineById(day.routineId) ?? null) : null
}

/** Dias (0..6) que tienen asignada esa rutina. Vacio si no tiene ninguno. */
export function weekdaysForRoutine(week: WeeklyRoutine, routineId: RoutineId): number[] {
  const out: number[] = []
  for (let dow = 0; dow < 7; dow++) {
    const day = week[dow]
    if (day.kind === 'training' && day.routineId === routineId) out.push(dow)
  }
  return out
}

/** Un solo dia para la insignia de Inicio: la proxima aparicion contando desde
 *  hoy, y si ya paso, la primera de la semana. null si no tiene dia asignado.
 *  La caja de .day-badge mide 44px (styles.css:575-587) y no aguanta dos
 *  abreviaturas sin desbordar a 320px. */
export function nextWeekdayFor(week: WeeklyRoutine, routineId: RoutineId, fromDow: number): number | null {
  const days = weekdaysForRoutine(week, routineId)
  if (days.length === 0) return null
  return days.find(d => d >= fromDow) ?? days[0]
}

/** Todos los dias de la rutina, para la linea descriptiva de Entrenar, que
 *  envuelve sin limite de ancho. */
export function routineDaysLabel(week: WeeklyRoutine, routineId: RoutineId): string {
  const days = weekdaysForRoutine(week, routineId)
  if (days.length === 0) return 'Sin día asignado'
  return days.map(weekdayLabel).join(' · ')
}

/** Meta semanal de sesiones de fuerza: sale de contar los dias de entreno. */
export function trainingDayCount(week: WeeklyRoutine): number {
  return week.reduce((n, d) => (d.kind === 'training' ? n + 1 : n), 0)
}

/** Semana nueva con un dia cambiado. Escribe la tupla entera a mano porque
 *  .map() sobre una tupla devuelve DayPlan[] y obligaria a un cast. */
export function withDay(week: WeeklyRoutine, index: number, day: DayPlan): WeeklyRoutine {
  const at = (i: number): DayPlan => (i === index ? day : week[i])
  return [at(0), at(1), at(2), at(3), at(4), at(5), at(6)]
}

/** Cambia solo texto y conserva la variante del dia sin castear. */
export function withText(day: DayPlan, patch: { title?: string; note?: string }): DayPlan {
  const title = patch.title ?? day.title
  const note = patch.note ?? day.note
  return day.kind === 'training'
    ? { kind: 'training', routineId: day.routineId, title, note }
    : { kind: day.kind, title, note }
}

/** Rutina propuesta al marcar un dia como entreno: la primera del catalogo sin
 *  dia asignado; si todas tienen, la primera. Deterministico. */
export function suggestRoutineId(week: WeeklyRoutine): RoutineId {
  return (ROUTINES.find(r => weekdaysForRoutine(week, r.id).length === 0) ?? ROUTINES[0]).id
}

export interface BlockPhase {
  week: number
  label: string
  setsDelta: number
  rir: string
  intent: string
}

/** Semana del bloque de 8 semanas y su prescripcion. */
export function blockPhase(today: Date, blockStart: string): BlockPhase {
  const start = new Date(blockStart + 'T00:00:00')
  const diffDays = Math.floor((today.getTime() - start.getTime()) / 86400000)
  const week = Math.min(Math.max(Math.floor(diffDays / 7) + 1, 1), 8)
  if (week <= 2)
    return { week, label: 'Adaptación', setsDelta: -1, rir: '5 reps en reserva',
      intent: 'Debe sentirse fácil. Aprende cada máquina y anota el número de asiento.' }
  if (week <= 4)
    return { week, label: 'Carga', setsDelta: 0, rir: '3 reps en reserva',
      intent: 'Empieza a sumar peso. Aquí ya cuesta y es normal.' }
  if (week <= 6)
    return { week, label: 'Construcción', setsDelta: 0, rir: '2 reps en reserva',
      intent: 'El bloque donde se construye el músculo. Si te estancas dos semanas, revisa el sueño.' }
  if (week === 7)
    return { week, label: 'Pico', setsDelta: 0, rir: '1 rep en reserva',
      intent: 'Última serie de cada ejercicio cerca del límite. En máquina puedes hacerlo con seguridad.' }
  return { week, label: 'Descarga y remedición', setsDelta: -1, rir: 'peso −20%',
    intent: 'Baja el peso un 20% y mantén las repeticiones. Vuelve a tomar las medidas.' }
}

export type WeekState = 'done' | 'current' | 'upcoming'

/** Estado de cada semana del bloque de 8, para la barra de la pantalla de inicio. */
export function blockWeeks(currentWeek: number): { week: number; state: WeekState }[] {
  return Array.from({ length: 8 }, (_, i) => {
    const week = i + 1
    return { week, state: week < currentWeek ? 'done' : week === currentWeek ? 'current' : 'upcoming' }
  })
}

/** Series totales de una rutina con el ajuste de la fase. */
export function routineSetCount(routine: Routine, setsDelta: number): number {
  return routine.exercises.reduce((a, e) => a + Math.max(1, e.sets + setsDelta), 0)
}

/** Nombre corto de la rutina ("Empuje"), para el titular de inicio. */
export function routineShortName(routine: Routine): string {
  const i = routine.name.indexOf('—')
  return i === -1 ? routine.name : routine.name.slice(i + 1).trim()
}
