import type { Routine, Config } from '../types'

export const MW = 'https://musclewiki.com/es-es/exercise/'

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
    weekday: 'Lunes',
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
    weekday: 'Miércoles',
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
    weekday: 'Viernes',
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

/** Rutina sugerida segun el dia de la semana. */
export function routineForWeekday(dow: number) {
  if (dow === 1) return ROUTINES[0]
  if (dow === 3) return ROUTINES[1]
  if (dow === 5) return ROUTINES[2]
  return null
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
