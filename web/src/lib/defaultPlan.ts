// Plan por defecto "espalda protegida" (5 dias, 12 semanas) y las tres
// rutinas anteriores convertidas a PlanRoutine. Es solo la plantilla que trae
// el codigo: el plan activo vive en IndexedDB y se edita. Los textos de
// "Claves tecnicas" e intros son los del documento del plan, tal cual.
import type { Phase, PlanRoutine, PlanSlot, RoutineBlock, Target, TrainingPlan, WeeklyRoutine } from './types'
import { ROUTINES } from './plan'

const reps = (low: number, high: number, extra: { perSide?: boolean; holdSec?: number; sideUnit?: 'pierna' } = {}): Target => ({ kind: 'reps', low, high, ...extra })
const time = (lowSec: number, highSec: number, perSide?: boolean): Target => (perSide ? { kind: 'time', lowSec, highSec, perSide } : { kind: 'time', lowSec, highSec })

function slot(
  id: string,
  exerciseId: string,
  sets: number,
  target: Target,
  restSec: number,
  note: string,
  extra: Pick<PlanSlot, 'primary' | 'group' | 'weeks'> = {},
): PlanSlot {
  return { id, exerciseId, sets, target, restSec, note, ...extra }
}

/* ---------- calentamiento fijo ---------- */

const WARMUP: RoutineBlock = {
  id: 'warmup',
  title: 'Calentamiento fijo (10 min, antes de cada sesión)',
  note: 'Este calentamiento despierta glúteos y core, que se "apagan" tras 8 horas sentado, y prepara la espalda para cargar.',
  slots: [
    slot('warmup-1', 'cardio-warmup', 1, time(300, 300), 0, 'Caminadora o elíptica: 5 min a ritmo moderado (inclinación 3–5 % en caminadora).'),
    slot('warmup-2', 'cat-camel', 1, reps(8, 8), 0, 'Gato-camello suave: 8 reps, solo movimiento sin forzar extremos.'),
    slot('warmup-3', 'hip-flexor-stretch', 1, time(30, 30, true), 0, 'Estiramiento de flexor de cadera en zancada (rodilla atrás en el piso, glúteo apretado): 30 s por lado.'),
    slot('warmup-4', 'glute-bridge', 1, reps(12, 12, { holdSec: 2 }), 0, 'Puente de glúteo en el piso: 12 reps con 2 s de pausa arriba.'),
    slot('warmup-5', 'bird-dog', 1, reps(6, 6, { perSide: true, holdSec: 5 }), 0, 'Bird dog (cuatro apoyos, brazo y pierna contraria): 6 por lado, 5 s sosteniendo.'),
    slot('warmup-6', 'thoracic-rotation', 1, reps(8, 8, { perSide: true }), 0, 'Rotación torácica en cuatro apoyos (mano en la nuca): 8 por lado.'),
    slot('warmup-7', 'approach-set', 1, { kind: 'note' }, 0, 'Primera serie de cada ejercicio principal con poco peso (aproximación) antes de las series de trabajo.'),
  ],
}

/* ---------- los cinco dias ---------- */

const DAY_1: PlanRoutine = {
  id: 'espalda-d1',
  name: 'Día 1 – Tren inferior A',
  focus: 'cuádriceps',
  intro: 'Enfoque en cuádriceps y glúteo con la espalda apoyada o vertical, sin carga sobre los hombros.',
  duration: '60 min',
  warmup: true,
  blocks: [{
    id: 'espalda-d1-main', title: 'Ejercicios', note: '',
    slots: [
      slot('d1-1', 'leg-press', 3, reps(10, 12), 120, 'Pies a media altura de la plataforma. Baja solo hasta antes de que la cola se despegue del respaldo; ese es tu rango.', { primary: true }),
      slot('d1-2', 'goblet-squat', 3, reps(8, 10), 90, 'Mancuerna pegada al pecho, siéntate al banco y sube. Torso erguido. Alternativa: sentadilla en multipower con pies adelantados.', { primary: true }),
      slot('d1-3', 'smith-split-squat', 3, reps(8, 10, { perSide: true, sideUnit: 'pierna' }), 90, 'Torso vertical, baja recto como ascensor. Empieza solo con la barra.'),
      slot('d1-4', 'leg-extension', 3, reps(12, 15), 60, 'Pausa 1 s arriba. Espalda pegada al respaldo.'),
      slot('d1-5', 'leg-curl', 3, reps(10, 12), 60, 'Mejor sentado que acostado: acostado tiendes a arquear la zona lumbar.'),
      slot('d1-6', 'seated-calf-raise', 3, reps(12, 15), 60, 'Pausa abajo estirando, subida completa. Evita la de pie con hombreras (carga la columna).'),
      slot('d1-7', 'pallof-press', 3, reps(10, 10, { perSide: true }), 45, 'De lado a la polea, empuja el agarre al frente sin dejar que te gire. Core anti-rotación.'),
    ],
  }],
}

const DAY_2: PlanRoutine = {
  id: 'espalda-d2',
  name: 'Día 2 – Tren superior A',
  focus: 'pecho, espalda, hombro',
  intro: 'Todo sentado y con respaldo o apoyo de pecho, para que la espalda baja no trabaje de estabilizador bajo carga.',
  duration: '60 min',
  warmup: true,
  blocks: [{
    id: 'espalda-d2-main', title: 'Ejercicios', note: '',
    slots: [
      slot('d2-1', 'chest-press', 3, reps(8, 10), 120, 'Omóplatos atrás y abajo, cola y espalda alta pegadas al respaldo.', { primary: true }),
      slot('d2-2', 'lat-pulldown', 3, reps(10, 12), 90, 'Muslos trabados bajo el rodillo. Lleva la barra a la clavícula sin echarte atrás más de 10–15°.', { primary: true }),
      slot('d2-3', 'chest-supported-row', 3, reps(10, 12), 90, 'El apoyo de pecho quita carga lumbar. Codos hacia las costillas. Alternativa: remo sentado en polea, torso quieto.'),
      slot('d2-4', 'shoulder-press', 3, reps(10, 12), 90, 'Respaldo vertical, no arquees la zona lumbar para empujar. Si arqueas, baja el peso.'),
      slot('d2-5', 'face-pull', 3, reps(12, 15), 60, 'Cuerda hacia la frente, codos altos. Corrige la postura de escritorio (hombros adelante).'),
      slot('d2-6', 'seated-dumbbell-curl', 2, reps(10, 12), 60, 'Espalda apoyada en banco inclinado.'),
      slot('d2-7', 'triceps-pushdown', 2, reps(12, 15), 60, 'Codos pegados al cuerpo, pie adelantado para estabilidad.'),
      slot('d2-8', 'dead-bug', 3, reps(8, 8, { perSide: true }), 45, 'Boca arriba, zona lumbar suavemente apoyada en el piso, bajas brazo y pierna contraria despacio.'),
    ],
  }],
}

const DAY_3: PlanRoutine = {
  id: 'espalda-d3',
  name: 'Día 3 – Core, movilidad y cardio',
  focus: '',
  intro: 'Este día es tu seguro para la espalda: core que resiste movimiento (en vez de flexionar), glúteos fuertes y cardio suave.',
  duration: '45–50 min',
  warmup: true,
  blocks: [
    {
      id: 'espalda-d3-core', title: 'Bloque 1 – Core ("Big 3" de McGill + cargadas), 20 min', note: '',
      slots: [
        slot('d3-1', 'mcgill-curl-up', 3, reps(6, 6, { holdSec: 10 }), 30, 'Una rodilla doblada, manos bajo la zona lumbar. Despega solo cabeza y hombros unos centímetros, sin doblar el cuello.'),
        slot('d3-2', 'side-plank', 3, time(20, 30, true), 30, 'Empieza apoyando rodillas. Cadera alineada, no se cae.'),
        slot('d3-3', 'bird-dog', 3, reps(6, 6, { perSide: true, holdSec: 8 }), 30, 'Espalda quieta como mesa, no levantes la pierna por encima de la cadera.'),
        slot('d3-4', 'hip-thrust', 3, reps(10, 12), 60, 'En máquina de hip thrust o con mancuerna sobre la cadera. Aprieta glúteo, no arquees la zona lumbar arriba.'),
        slot('d3-5', 'suitcase-carry', 3, { kind: 'distance', meters: 30, perSide: true }, 60, 'Mancuerna en una mano, camina erguido sin inclinarte hacia el peso.'),
      ],
    },
    {
      id: 'espalda-d3-cardio', title: 'Bloque 2 – Cardio zona 2, 20–25 min', note: '',
      slots: [
        slot('d3-6', 'zone2-cardio', 1, time(1200, 1500), 0, 'Elíptica o caminadora inclinada (8–10 %, 5 km/h) a un ritmo en el que puedas hablar en frases completas. Si usas bicicleta, prefiere la reclinada (con respaldo) sobre la vertical.'),
      ],
    },
    {
      id: 'espalda-d3-mobility', title: 'Bloque 3 – Movilidad, 5–8 min', note: '',
      slots: [
        slot('d3-7', 'hip-flexor-stretch', 1, time(45, 45, true), 0, 'Flexor de cadera en zancada: 45 s por lado.'),
        slot('d3-8', 'hamstring-stretch-towel', 1, time(45, 45, true), 0, 'Estiramiento de isquiotibiales acostado con toalla (espalda en el piso): 45 s por lado.'),
        slot('d3-9', 'figure-four-stretch', 1, time(45, 45, true), 0, 'Figura 4 para glúteo, acostado: 45 s por lado.'),
        slot('d3-10', 'child-pose', 1, { kind: 'note' }, 0, 'Postura del niño suave o extensiones en prono ("cobra" a medias) si te alivian; si alguna aumenta el dolor, sáltala.'),
      ],
    },
  ],
}

const DAY_4_NOTE = 'Bisagra de cadera pura: rodillas semiflexionadas, cola atrás, espalda neutra. Baja solo hasta donde la espalda no se redondee (suele ser debajo de la rodilla). Empieza liviano y pide al instructor que revise la técnica.'

const DAY_4: PlanRoutine = {
  id: 'espalda-d4',
  name: 'Día 4 – Tren inferior B',
  focus: 'glúteo e isquiotibiales',
  intro: 'Enfoque en cadera. Un glúteo fuerte es de lo que más protege la zona lumbar de alguien que pasa el día sentado.',
  duration: '60 min',
  warmup: true,
  blocks: [{
    id: 'espalda-d4-main', title: 'Ejercicios', note: '',
    slots: [
      slot('d4-1', 'hip-thrust', 3, reps(8, 10), 120, 'Espalda alta en el banco, mentón al pecho, sube hasta que cadera y torso queden alineados. Sin hiperextender la zona lumbar.', { primary: true }),
      // #2: dos ejercicios, cada uno con su historial, elegidos por semana del bloque.
      slot('d4-2a', 'cable-pull-through', 3, reps(10, 12), 90, DAY_4_NOTE, { primary: true, weeks: { from: 1, to: 4 } }),
      slot('d4-2b', 'romanian-deadlift-db', 3, reps(10, 12), 90, DAY_4_NOTE, { primary: true, weeks: { from: 5 } }),
      slot('d4-3', 'step-up', 3, reps(8, 8, { perSide: true, sideUnit: 'pierna' }), 90, 'Cajón a altura de media tibia o rodilla. Empuja con el talón de la pierna de arriba.'),
      slot('d4-4', 'single-leg-press', 2, reps(10, 12, { perSide: true, sideUnit: 'pierna' }), 60, 'Mismo rango que en el Día 1: la cola nunca se despega.'),
      slot('d4-5', 'hip-abduction', 3, reps(15, 15), 60, 'Torso un poco inclinado al frente para más glúteo medio.'),
      slot('d4-6', 'leg-curl', 2, reps(12, 15), 60, 'Igual que el Día 1.'),
      slot('d4-7', 'forearm-plank', 3, time(20, 40), 45, 'Glúteos y abdomen apretados, cuerpo en línea recta. Calidad sobre tiempo.'),
    ],
  }],
}

const DAY_5_SUPERSET_NOTE = 'Tríceps: de espaldas a la polea, torso estable, sin arquear la zona baja.'
const DAY_5_ROUNDS_NOTE = 'Versión corta del Día 3 para cerrar.'

const DAY_5: PlanRoutine = {
  id: 'espalda-d5',
  name: 'Día 5 – Tren superior B',
  focus: 'espalda y hombros prioridad',
  intro: 'Más volumen de espalda que de pecho para compensar la postura de escritorio (hombros caídos hacia adelante).',
  duration: '60 min',
  warmup: true,
  blocks: [{
    id: 'espalda-d5-main', title: 'Ejercicios', note: '',
    slots: [
      slot('d5-1', 'neutral-pulldown', 3, reps(8, 10), 120, 'Pecho alto, tira con los codos hacia los bolsillos.', { primary: true }),
      slot('d5-2', 'incline-db-press', 3, reps(8, 10), 90, 'Banco a 30°, pies firmes, cola en el banco. Alternativa: press inclinado en máquina.', { primary: true }),
      slot('d5-3', 'single-arm-row', 3, reps(10, 12, { perSide: true }), 90, 'Mano y rodilla en el banco, espalda plana como mesa. Tira hacia la cadera.'),
      slot('d5-4', 'pec-deck', 2, reps(12, 15), 60, 'Codos ligeramente flexionados, espalda pegada.'),
      slot('d5-5', 'seated-lateral-raise', 3, reps(12, 15), 60, 'Sube hasta la altura del hombro, sin impulso.'),
      slot('d5-6', 'reverse-pec-deck', 3, reps(12, 15), 60, 'Hombro posterior; otro corrector de postura.'),
      // #7: superserie, 2 × 12 cada uno.
      slot('d5-7a', 'dumbbell-hammer-curl', 2, reps(12, 12), 60, DAY_5_SUPERSET_NOTE, { group: 'd5-superset' }),
      slot('d5-7b', 'overhead-triceps-cable', 2, reps(12, 12), 60, DAY_5_SUPERSET_NOTE, { group: 'd5-superset' }),
      // #8: 2 rondas de bird dog + plancha lateral, con los objetivos del Día 3.
      slot('d5-8a', 'bird-dog', 2, reps(6, 6, { perSide: true, holdSec: 8 }), 30, DAY_5_ROUNDS_NOTE, { group: 'd5-rounds' }),
      slot('d5-8b', 'side-plank', 2, time(20, 30, true), 30, DAY_5_ROUNDS_NOTE, { group: 'd5-rounds' }),
    ],
  }],
}

/* ---------- progresion en 12 semanas ---------- */

const PHASES: Phase[] = [
  { fromWeek: 1, toWeek: 2, sets: '2 por ejercicio', intensity: 'RIR 4 (bastante fácil)', goal: 'Aprender técnica y ajustes de cada máquina', rule: { kind: 'cap', sets: 2 }, loadNote: '' },
  { fromWeek: 3, toWeek: 6, sets: '3 por ejercicio', intensity: 'RIR 2–3', goal: 'Progresión doble: sumar reps y peso cada semana', rule: { kind: 'base' }, loadNote: '' },
  { fromWeek: 7, toWeek: 7, sets: 'Igual que semana 3–6, la mitad de peso', intensity: 'Suave', goal: 'Descarga: recuperarse y consolidar', rule: { kind: 'base' }, loadNote: 'la mitad de peso' },
  { fromWeek: 8, toWeek: 11, sets: '4 en los ejercicios #1 y #2 de cada día', intensity: 'RIR 1–2', goal: 'Más volumen; empieza el peso muerto rumano si no lo hiciste', rule: { kind: 'primaryBoost', sets: 4 }, loadNote: '' },
  { fromWeek: 12, toWeek: 12, sets: 'La mitad de series', intensity: 'Suave', goal: 'Descarga y revisión: compara tu registro con la semana 1', rule: { kind: 'half' }, loadNote: '' },
]

/* ---------- semana ---------- */

const REST_NOTE = 'Descanso activo: tus 10.000 pasos'

/** Indice 0 = domingo .. 6 = sabado. */
const WEEK: WeeklyRoutine = [
  { kind: 'rest', title: '', note: REST_NOTE },
  { kind: 'training', routineId: 'espalda-d1', title: '', note: DAY_1.duration },
  { kind: 'training', routineId: 'espalda-d2', title: '', note: DAY_2.duration },
  { kind: 'training', routineId: 'espalda-d3', title: '', note: DAY_3.duration },
  { kind: 'training', routineId: 'espalda-d4', title: '', note: DAY_4.duration },
  { kind: 'training', routineId: 'espalda-d5', title: '', note: DAY_5.duration },
  { kind: 'rest', title: '', note: REST_NOTE },
]

const TIPS: string[] = [
  'Si una semana solo puedes ir 4 días, quita el Día 3 y haz sus 3 ejercicios de core al final de las otras sesiones.',
  'Intensidad (RIR = repeticiones en reserva): termina cada serie sintiendo que podrías hacer 2–3 repeticiones más con buena técnica. Al principio nada de ir al fallo.',
  [
    'Progresión doble: cada ejercicio tiene un rango, por ejemplo 3 × 10–12.',
    '1. Empieza con un peso con el que hagas 10 reps limpias.',
    '2. Cada sesión intenta sumar 1 repetición.',
    '3. Cuando completes todas las series en 12, sube el peso lo mínimo posible (1 placa en máquina, 1–2 kg en mancuernas) y vuelve a 10.',
  ].join('\n'),
  'Descansos: 90–120 s en ejercicios grandes, 60 s en accesorios y core.',
  'Anota todo (peso, series, reps, dolor 0–10) en el celular. Sin registro no hay progresión.',
  'Equipo: el plan usa máquinas guiadas, poleas, mancuernas y el multipower (Smith), que son estándar en las sedes Smart Fit. Si una máquina no está o está ocupada, usa la alternativa indicada. Pide al instructor de turno que te enseñe a ajustar asiento y respaldo las primeras veces; está incluido en tu plan.',
]

export const DEFAULT_PLAN: TrainingPlan = {
  id: 'espalda-protegida',
  name: 'Plan de entrenamiento – 5 días (espalda protegida)',
  schemaVersion: 1,
  weeks: 12,
  warmup: WARMUP,
  routines: [DAY_1, DAY_2, DAY_3, DAY_4, DAY_5],
  phases: PHASES,
  weekTemplate: WEEK,
  tips: TIPS,
  customExercises: [],
}

/* ---------- rutinas anteriores (archivadas) ---------- */

/** Las tres rutinas de antes de este plan, para que el historial conserve
 *  nombre y ejercicios. Mismos ids de rutina y de ejercicio. */
export const LEGACY_ROUTINES: PlanRoutine[] = ROUTINES.map(r => ({
  id: r.id,
  name: r.name,
  focus: r.zone,
  intro: r.warmup,
  duration: '',
  warmup: false,
  archived: true,
  blocks: [{
    id: `${r.id}-main`,
    title: 'Ejercicios',
    note: '',
    slots: r.exercises.map(e => slot(
      `${r.id}-${e.id}`,
      e.id,
      e.sets,
      reps(e.repsLow, e.repsHigh),
      e.restSec,
      e.cue,
      e.main ? { primary: true } : {},
    )),
  }],
}))

/** El plan por defecto con las rutinas anteriores archivadas al final. Copia
 *  profunda: quien lo recibe puede mutarlo sin tocar DEFAULT_PLAN. */
export function defaultPlanWithLegacy(): TrainingPlan {
  return structuredClone({ ...DEFAULT_PLAN, routines: [...DEFAULT_PLAN.routines, ...LEGACY_ROUTINES] })
}

/* ---------- plantilla general (bienvenida) ---------- */

// A neutral 3-day full-body plan for people without the back condition the
// "espalda protegida" template was written for. Same 12-week structure and
// phase rules, no disc-specific notes. Only the welcome offers it.

const GENERIC_REST_NOTE = 'Descanso activo: camina 30–45 minutos'

const GENERIC_WARMUP: RoutineBlock = {
  id: 'warmup',
  title: 'Calentamiento (8–10 min, antes de cada sesión)',
  note: 'Sube la temperatura y la movilidad antes de cargar.',
  slots: [
    slot('gw-1', 'cardio-warmup', 1, time(300, 300), 0, 'Caminadora, elíptica o bicicleta: 5 min a ritmo moderado.'),
    slot('gw-2', 'glute-bridge', 1, reps(12, 12), 0, 'Puente de glúteo en el piso: 12 reps controladas.'),
    slot('gw-3', 'thoracic-rotation', 1, reps(8, 8, { perSide: true }), 0, 'Rotación torácica en cuatro apoyos: 8 por lado.'),
    slot('gw-4', 'approach-set', 1, { kind: 'note' }, 0, 'Primera serie de cada ejercicio principal con poco peso (aproximación) antes de las series de trabajo.'),
  ],
}

const GENERIC_A: PlanRoutine = {
  id: 'general-a',
  name: 'Día A – Cuerpo completo',
  focus: 'pierna, pecho y espalda',
  intro: 'Sesión de cuerpo completo con máquinas: fácil de aprender y de progresar.',
  duration: '50–60 min',
  warmup: true,
  blocks: [{
    id: 'general-a-main', title: 'Ejercicios', note: '',
    slots: [
      slot('ga-1', 'leg-press', 3, reps(10, 12), 120, 'Baja hasta donde la cadera no se despegue del asiento.', { primary: true }),
      slot('ga-2', 'chest-press', 3, reps(8, 10), 120, 'Omóplatos atrás y abajo, espalda pegada al respaldo.', { primary: true }),
      slot('ga-3', 'lat-pulldown', 3, reps(10, 12), 90, 'Lleva la barra a la clavícula sin balancearte.'),
      slot('ga-4', 'leg-curl', 3, reps(10, 12), 60, 'Sube y baja controlado, sin despegar la cadera.'),
      slot('ga-5', 'lateral-raise', 2, reps(12, 15), 60, 'Sube hasta la altura del hombro, sin impulso.'),
      slot('ga-6', 'forearm-plank', 3, time(20, 40), 45, 'Cuerpo en línea recta. Calidad sobre tiempo.'),
    ],
  }],
}

const GENERIC_B: PlanRoutine = {
  id: 'general-b',
  name: 'Día B – Cuerpo completo',
  focus: 'pierna, espalda y hombro',
  intro: 'Mismo esquema que el Día A con otros ejercicios, para repartir el trabajo de la semana.',
  duration: '50–60 min',
  warmup: true,
  blocks: [{
    id: 'general-b-main', title: 'Ejercicios', note: '',
    slots: [
      slot('gb-1', 'goblet-squat', 3, reps(8, 10), 120, 'Mancuerna pegada al pecho, torso erguido.', { primary: true }),
      slot('gb-2', 'seated-row', 3, reps(10, 12), 90, 'Torso quieto, codos hacia las costillas.', { primary: true }),
      slot('gb-3', 'shoulder-press', 3, reps(10, 12), 90, 'Espalda apoyada en el respaldo.'),
      slot('gb-4', 'hip-thrust', 3, reps(10, 12), 90, 'Aprieta el glúteo arriba sin arquear la zona lumbar.'),
      slot('gb-5', 'biceps-curl', 2, reps(10, 12), 60, 'Codos quietos junto al cuerpo.'),
      slot('gb-6', 'triceps-pushdown', 2, reps(12, 15), 60, 'Codos pegados al cuerpo.'),
      slot('gb-7', 'dead-bug', 3, reps(8, 8, { perSide: true }), 45, 'Zona lumbar suavemente apoyada en el piso.'),
    ],
  }],
}

const GENERIC_C: PlanRoutine = {
  id: 'general-c',
  name: 'Día C – Cuerpo completo',
  focus: 'cadera, pecho y espalda',
  intro: 'Cierra la semana con bisagra de cadera, empuje inclinado y remo a una mano.',
  duration: '50–60 min',
  warmup: true,
  blocks: [{
    id: 'general-c-main', title: 'Ejercicios', note: '',
    slots: [
      slot('gc-1', 'romanian-deadlift-db', 3, reps(10, 12), 120, 'Cadera atrás y espalda neutra; baja solo hasta donde no se redondee.', { primary: true }),
      slot('gc-2', 'incline-db-press', 3, reps(8, 10), 90, 'Banco a 30°, pies firmes.', { primary: true }),
      slot('gc-3', 'single-arm-row', 3, reps(10, 12, { perSide: true }), 90, 'Espalda plana, tira hacia la cadera.'),
      slot('gc-4', 'step-up', 3, reps(8, 8, { perSide: true, sideUnit: 'pierna' }), 90, 'Empuja con el talón de la pierna de arriba.'),
      slot('gc-5', 'face-pull', 3, reps(12, 15), 60, 'Cuerda hacia la frente, codos altos.'),
      slot('gc-6', 'calf-raise', 3, reps(12, 15), 60, 'Pausa abajo estirando, subida completa.'),
      slot('gc-7', 'side-plank', 3, time(20, 30, true), 30, 'Cadera alineada; empieza con rodillas apoyadas si hace falta.'),
    ],
  }],
}

const GENERIC_PHASES: Phase[] = [
  { fromWeek: 1, toWeek: 2, sets: '2 por ejercicio', intensity: 'RIR 3–4 (cómodo)', goal: 'Aprender técnica y ajustes de cada máquina', rule: { kind: 'cap', sets: 2 }, loadNote: '' },
  { fromWeek: 3, toWeek: 6, sets: '3 por ejercicio', intensity: 'RIR 2–3', goal: 'Progresión doble: sumar reps y peso cada semana', rule: { kind: 'base' }, loadNote: '' },
  { fromWeek: 7, toWeek: 7, sets: 'Igual que semana 3–6, la mitad de peso', intensity: 'Suave', goal: 'Descarga: recuperarse y consolidar', rule: { kind: 'base' }, loadNote: 'la mitad de peso' },
  { fromWeek: 8, toWeek: 11, sets: '4 en los ejercicios #1 y #2 de cada día', intensity: 'RIR 1–2', goal: 'Más volumen en los ejercicios principales', rule: { kind: 'primaryBoost', sets: 4 }, loadNote: '' },
  { fromWeek: 12, toWeek: 12, sets: 'La mitad de series', intensity: 'Suave', goal: 'Descarga y revisión: compara tu registro con la semana 1', rule: { kind: 'half' }, loadNote: '' },
]

/** Indice 0 = domingo .. 6 = sabado: lunes, miercoles y viernes. */
const GENERIC_WEEK: WeeklyRoutine = [
  { kind: 'rest', title: '', note: GENERIC_REST_NOTE },
  { kind: 'training', routineId: 'general-a', title: '', note: GENERIC_A.duration },
  { kind: 'rest', title: '', note: GENERIC_REST_NOTE },
  { kind: 'training', routineId: 'general-b', title: '', note: GENERIC_B.duration },
  { kind: 'rest', title: '', note: GENERIC_REST_NOTE },
  { kind: 'training', routineId: 'general-c', title: '', note: GENERIC_C.duration },
  { kind: 'rest', title: '', note: GENERIC_REST_NOTE },
]

const GENERIC_TIPS: string[] = [
  'Intensidad (RIR = repeticiones en reserva): termina cada serie sintiendo que podrías hacer 2–3 repeticiones más con buena técnica. Al principio nada de ir al fallo.',
  [
    'Progresión doble: cada ejercicio tiene un rango, por ejemplo 3 × 10–12.',
    '1. Empieza con un peso con el que hagas 10 reps limpias.',
    '2. Cada sesión intenta sumar 1 repetición.',
    '3. Cuando completes todas las series en 12, sube el peso lo mínimo posible y vuelve a 10.',
  ].join('\n'),
  'Descansos: 90–120 s en ejercicios grandes, 60 s en accesorios y core.',
  'Anota todo (peso, series, reps) en la app. Sin registro no hay progresión.',
]

export const GENERIC_PLAN: TrainingPlan = {
  id: 'general',
  name: 'Plan general – 3 días (cuerpo completo)',
  schemaVersion: 1,
  weeks: 12,
  warmup: GENERIC_WARMUP,
  routines: [GENERIC_A, GENERIC_B, GENERIC_C],
  phases: GENERIC_PHASES,
  weekTemplate: GENERIC_WEEK,
  tips: GENERIC_TIPS,
  customExercises: [],
}

/* ---------- plantillas que ofrece la bienvenida ---------- */

/** Id of the "espalda protegida" plan. The guide's disc-protrusion content and
 *  the lower-back tip in Hoy are tied to it. Existing installs keep it: the
 *  one-time migration wrote this plan with this id. */
export const BACK_CARE_PLAN_ID = 'espalda-protegida'

export type PlanTemplateId = typeof BACK_CARE_PLAN_ID | 'general'

export interface PlanTemplate {
  id: PlanTemplateId
  name: string
  description: string
}

export const PLAN_TEMPLATES: readonly PlanTemplate[] = [
  {
    id: BACK_CARE_PLAN_ID,
    name: 'Espalda protegida (5 días)',
    description: 'Pensado para protrusión discal o dolor lumbar: máquinas y ejercicios que no comprimen ni flexionan la columna bajo carga. Incluye una guía específica.',
  },
  {
    id: 'general',
    name: 'General (3 días, cuerpo completo)',
    description: 'Tres sesiones de cuerpo completo por semana con máquinas y mancuernas, para empezar sin una condición particular.',
  },
]

/** True for the "espalda protegida" plan (edited or not). */
export function isBackCarePlan(plan: Pick<TrainingPlan, 'id'>): boolean {
  return plan.id === BACK_CARE_PLAN_ID
}

/** Plan a new install starts with. Deep copy, like defaultPlanWithLegacy.
 *  "espalda protegida" is exactly what the first open used to seed (with the
 *  earlier routines archived), so the first sign-in recognizes both. */
export function templatePlan(id: PlanTemplateId): TrainingPlan {
  return id === BACK_CARE_PLAN_ID ? defaultPlanWithLegacy() : structuredClone(GENERIC_PLAN)
}
