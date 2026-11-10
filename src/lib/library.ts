// Biblioteca de ejercicios: una fila por movimiento. Los slots del plan la
// referencian por id y el historial se agrupa por ese mismo id, asi que un id
// publicado no se cambia nunca. Los pasos y claves estan redactados para esta
// app (no se copia texto de MuscleWiki); el enlace al video usa musclewiki.slug,
// o una busqueda cuando no hay slug verificado.
import type { ExerciseCategory, LibraryExercise, TrainingPlan } from '../types'

interface Entry {
  id: string
  name: string
  category: ExerciseCategory
  equipment: string
  primary: string[]
  secondary?: string[]
  steps: string[]
  cues: string[]
  slug: string | null
  alternativeId?: string
  alternativeText?: string
}

const entry = (e: Entry): LibraryExercise => ({
  id: e.id,
  name: e.name,
  category: e.category,
  equipment: e.equipment,
  primaryMuscles: e.primary,
  secondaryMuscles: e.secondary ?? [],
  steps: e.steps,
  cues: e.cues,
  ...(e.alternativeId !== undefined ? { alternativeId: e.alternativeId } : {}),
  ...(e.alternativeText !== undefined ? { alternativeText: e.alternativeText } : {}),
  musclewiki: { slug: e.slug, id: null },
})

const ENTRIES: Entry[] = [
  /* ---------- calentamiento, movilidad y cardio ---------- */
  {
    id: 'cardio-warmup', name: 'Caminadora o elíptica (calentamiento)', category: 'cardio',
    equipment: 'Caminadora o elíptica', primary: ['Sistema cardiovascular'], secondary: ['Piernas'],
    steps: ['Sube a la máquina y empieza a un ritmo cómodo.', 'Sube poco a poco hasta un ritmo moderado.', 'En caminadora, usa una inclinación de 3 a 5 %.', 'Mantén 5 minutos sin agarrarte con fuerza a las barras.'],
    cues: ['Camina erguido, sin inclinarte hacia adelante.', 'No te cuelgues de las barras: la columna debe sostener tu postura.'],
    slug: null,
  },
  {
    id: 'cat-camel', name: 'Gato-camello', category: 'mobility',
    equipment: 'Colchoneta', primary: ['Columna'], secondary: ['Core'],
    steps: ['Colócate en cuatro apoyos, manos bajo los hombros y rodillas bajo las caderas.', 'Redondea la espalda suavemente mientras sueltas el aire.', 'Pasa a una curva suave hacia el otro lado al inhalar.', 'Alterna despacio, sin llegar a los extremos.'],
    cues: ['Solo movimiento: no fuerces los extremos del recorrido.', 'Si algún sentido del movimiento te molesta, reduce el rango.'],
    slug: null,
  },
  {
    id: 'hip-flexor-stretch', name: 'Estiramiento de flexor de cadera en zancada', category: 'mobility',
    equipment: 'Colchoneta', primary: ['Flexores de cadera'], secondary: ['Cuádriceps', 'Glúteo'],
    steps: ['Apoya una rodilla en el piso y el otro pie al frente en zancada.', 'Aprieta el glúteo de la pierna de atrás.', 'Desplaza la cadera ligeramente hacia adelante sin arquear la espalda.', 'Sostén el tiempo indicado y cambia de lado.'],
    cues: ['Aprieta el glúteo para no arquear la zona lumbar.', 'Si la rodilla molesta, pon una toalla doblada debajo.'],
    slug: null,
  },
  {
    id: 'glute-bridge', name: 'Puente de glúteo en el piso', category: 'core',
    equipment: 'Colchoneta', primary: ['Glúteo'], secondary: ['Isquiotibiales', 'Core'],
    steps: ['Acuéstate boca arriba con las rodillas dobladas y los pies firmes en el piso.', 'Aprieta el abdomen y el glúteo.', 'Sube la cadera hasta alinear rodillas, cadera y hombros.', 'Haz una pausa arriba y baja con control.'],
    cues: ['Sube hasta la línea recta, no más: no arquees la zona lumbar.', 'El esfuerzo lo siente el glúteo, no la espalda baja.'],
    slug: 'glute-bridge',
  },
  {
    id: 'bird-dog', name: 'Bird dog', category: 'core',
    equipment: 'Colchoneta', primary: ['Core', 'Erectores de la columna'], secondary: ['Glúteo', 'Hombro'],
    steps: ['Colócate en cuatro apoyos con la espalda neutra.', 'Estira el brazo de un lado y la pierna contraria sin rotar la cadera.', 'Sostén el tiempo indicado con la espalda quieta.', 'Regresa con control y cambia de lado.'],
    cues: ['Espalda quieta como una mesa: nadie debería poder inclinarla.', 'No subas la pierna por encima de la altura de la cadera.'],
    slug: 'bird-dog',
  },
  {
    id: 'thoracic-rotation', name: 'Rotación torácica en cuatro apoyos', category: 'mobility',
    equipment: 'Colchoneta', primary: ['Columna torácica'], secondary: ['Hombro', 'Core'],
    steps: ['Colócate en cuatro apoyos y lleva una mano a la nuca.', 'Gira el torso llevando el codo hacia el techo.', 'Regresa y apunta el codo hacia el brazo de apoyo.', 'Completa las repeticiones y cambia de lado.'],
    cues: ['El giro sale de la parte media de la espalda, no de la zona lumbar.', 'Mueve la cadera lo menos posible.'],
    slug: null,
  },
  {
    id: 'approach-set', name: 'Series de aproximación', category: 'strength',
    equipment: 'El del ejercicio principal', primary: ['Según el ejercicio'],
    steps: ['Haz la primera serie de cada ejercicio principal con poco peso.', 'Usa el mismo recorrido y la misma técnica que en las series de trabajo.', 'Pasa a las series de trabajo cuando el movimiento se sienta fluido.'],
    cues: ['Es una serie de aprendizaje: sin fatiga y sin ir al límite.'],
    slug: null,
  },
  {
    id: 'hamstring-stretch-towel', name: 'Estiramiento de isquiotibiales con toalla', category: 'mobility',
    equipment: 'Toalla', primary: ['Isquiotibiales'], secondary: ['Pantorrilla'],
    steps: ['Acuéstate boca arriba con la espalda en el piso.', 'Pasa una toalla por la planta de un pie y sube la pierna casi recta.', 'Tira suavemente de la toalla hasta sentir tensión, sin dolor.', 'Sostén el tiempo indicado y cambia de pierna.'],
    cues: ['La espalda y la cadera se quedan en el piso.', 'Busca tensión suave detrás del muslo, nunca dolor.'],
    slug: null,
  },
  {
    id: 'figure-four-stretch', name: 'Figura 4 para glúteo', category: 'mobility',
    equipment: 'Colchoneta', primary: ['Glúteo', 'Piriforme'],
    steps: ['Acuéstate boca arriba con las rodillas dobladas.', 'Cruza un tobillo sobre la rodilla contraria.', 'Lleva el muslo de apoyo hacia el pecho hasta sentir el estiramiento.', 'Sostén el tiempo indicado y cambia de lado.'],
    cues: ['Mantén la cabeza y la espalda relajadas en el piso.', 'Si sientes dolor en la rodilla, reduce el rango.'],
    slug: null,
  },
  {
    id: 'child-pose', name: 'Postura del niño suave', category: 'mobility',
    equipment: 'Colchoneta', primary: ['Espalda baja', 'Dorsales'], secondary: ['Cadera'],
    steps: ['Colócate en cuatro apoyos.', 'Lleva la cadera hacia los talones.', 'Estira los brazos al frente y relaja la frente.', 'Respira lento y sostén el tiempo indicado.'],
    cues: ['Solo si te alivia; si aumenta el dolor, sáltala.', 'No fuerces la cadera hacia los talones.'],
    slug: null,
    alternativeId: 'prone-press-up',
    alternativeText: 'Extensiones en prono ("cobra" a medias) si te alivian.',
  },
  {
    id: 'prone-press-up', name: 'Extensión en prono ("cobra" a medias)', category: 'mobility',
    equipment: 'Colchoneta', primary: ['Extensores de la columna'], secondary: ['Abdomen'],
    steps: ['Acuéstate boca abajo con las manos junto a los hombros.', 'Empuja suavemente hasta apoyarte en los antebrazos o a medio recorrido.', 'Mantén la cadera en el piso y respira.', 'Baja con control.'],
    cues: ['Solo si te alivia; si aumenta el dolor, sáltala.', 'Sube a medias: no busques el recorrido completo.'],
    slug: null,
  },
  {
    id: 'zone2-cardio', name: 'Cardio zona 2', category: 'cardio',
    equipment: 'Elíptica, caminadora inclinada o bicicleta reclinada', primary: ['Sistema cardiovascular'], secondary: ['Piernas'],
    steps: ['Elige elíptica o caminadora inclinada.', 'Ajusta un ritmo en el que puedas hablar en frases completas.', 'Mantén el ritmo constante durante todo el bloque.', 'Si usas bicicleta, elige la reclinada.'],
    cues: ['Postura erguida; no te cuelgues de las barras.', 'Si no puedes hablar en frases completas, baja el ritmo.'],
    slug: null,
  },

  /* ---------- Día 1 y Día 4: tren inferior ---------- */
  {
    id: 'leg-press', name: 'Prensa de piernas (leg press)', category: 'strength',
    equipment: 'Máquina de prensa', primary: ['Cuádriceps', 'Glúteo'], secondary: ['Isquiotibiales', 'Pantorrilla'],
    steps: ['Ajusta el respaldo y apoya la espalda y la cola por completo.', 'Coloca los pies a media altura de la plataforma.', 'Baja con control hasta un rango en el que la cola siga pegada al respaldo.', 'Empuja sin bloquear las rodillas al subir.'],
    cues: ['Detén el descenso antes de que la cola se despegue del respaldo.', 'Cadera y espalda baja siempre apoyadas.'],
    slug: 'machine-leg-press',
  },
  {
    id: 'goblet-squat', name: 'Sentadilla goblet a un banco', category: 'strength',
    equipment: 'Mancuerna y banco', primary: ['Cuádriceps', 'Glúteo'], secondary: ['Core'],
    steps: ['Sujeta una mancuerna pegada al pecho y colócate frente al banco.', 'Baja las caderas hacia atrás hasta sentarte en el banco con control.', 'Mantén el torso erguido.', 'Empuja con los pies para volver a subir.'],
    cues: ['Torso erguido, sin redondear la espalda al sentarte.', 'No te dejes caer sobre el banco: baja con control.'],
    slug: 'dumbbell-goblet-squat',
    alternativeId: 'smith-squat-feet-forward',
    alternativeText: 'Sentadilla en multipower con pies adelantados.',
  },
  {
    id: 'smith-squat-feet-forward', name: 'Sentadilla en multipower con pies adelantados', category: 'strength',
    equipment: 'Multipower (Smith)', primary: ['Cuádriceps', 'Glúteo'], secondary: ['Core'],
    steps: ['Coloca la barra a la altura de los hombros sin cargarla sobre las vértebras.', 'Adelanta los pies respecto a la barra.', 'Baja con control manteniendo el torso erguido.', 'Sube empujando con los talones.'],
    cues: ['Pies adelantados para mantener el torso vertical.', 'Empieza solo con la barra y pide al instructor que revise tu técnica.'],
    slug: null,
  },
  {
    id: 'smith-split-squat', name: 'Zancada estática (split squat) en multipower', category: 'strength',
    equipment: 'Multipower (Smith)', primary: ['Cuádriceps', 'Glúteo'], secondary: ['Isquiotibiales', 'Core'],
    steps: ['Coloca la barra del multipower a la altura de los hombros y un pie adelantado.', 'Mantén el torso vertical y baja la rodilla de atrás recto hacia abajo.', 'Haz una pausa breve cerca del piso.', 'Empuja con el pie de adelante para subir y completa todas las repeticiones de cada lado.'],
    cues: ['Baja recto, como un ascensor, sin inclinarte hacia adelante.', 'Empieza solo con la barra.'],
    slug: 'smith-machine-split-squat',
  },
  {
    id: 'leg-extension', name: 'Extensión de cuádriceps (máquina)', category: 'strength',
    equipment: 'Máquina de extensión de piernas', primary: ['Cuádriceps'],
    steps: ['Ajusta el respaldo para que la rodilla quede alineada con el eje de giro.', 'Coloca el rodillo sobre los tobillos.', 'Extiende las piernas hasta arriba y haz una pausa de 1 s.', 'Baja con control sin dejar caer el peso.'],
    cues: ['Espalda pegada al respaldo durante toda la serie.', 'No bloquees las rodillas de golpe.'],
    slug: 'machine-leg-extension',
  },
  {
    id: 'leg-curl', name: 'Curl femoral sentado (máquina)', category: 'strength',
    equipment: 'Máquina de curl femoral sentado', primary: ['Isquiotibiales'], secondary: ['Pantorrilla'],
    steps: ['Ajusta el asiento y el respaldo para que la rodilla quede alineada con el eje.', 'Coloca el rodillo sobre el tendón de Aquiles.', 'Flexiona las rodillas llevando los talones hacia abajo.', 'Regresa con control hasta casi estirar.'],
    cues: ['Mejor sentado que acostado: evita arquear la zona lumbar.', 'La cadera se queda pegada al asiento.'],
    slug: 'machine-seated-leg-curl',
  },
  {
    id: 'seated-calf-raise', name: 'Pantorrilla sentado (o en prensa)', category: 'strength',
    equipment: 'Máquina de pantorrilla sentado o prensa', primary: ['Pantorrilla'],
    steps: ['Ajusta la máquina con el peso sobre las rodillas y las puntas de los pies en la plataforma.', 'Baja los talones estirando la pantorrilla y haz una pausa.', 'Sube hasta ponerte de puntas, con el recorrido completo.', 'Regresa con control.'],
    cues: ['Prefiere esta versión a la de pie con hombreras: no carga la columna.', 'Movimiento lento, sin rebotar.'],
    slug: 'machine-seated-calf-raises',
  },
  {
    id: 'pallof-press', name: 'Pallof press en polea', category: 'core',
    equipment: 'Polea con agarre', primary: ['Core (anti-rotación)'], secondary: ['Oblicuos', 'Hombro'],
    steps: ['Colócate de lado a la polea con el agarre a la altura del pecho.', 'Pies al ancho de caderas y rodillas ligeramente dobladas.', 'Empuja el agarre al frente hasta estirar los brazos.', 'Resiste el giro, vuelve al pecho y completa el lado antes de cambiar.'],
    cues: ['El torso no gira: resiste la tensión de la polea.', 'Aprieta el abdomen antes de empujar.'],
    slug: 'cable-pallof-press',
  },

  /* ---------- Día 2 y Día 5: tren superior ---------- */
  {
    id: 'chest-press', name: 'Press de pecho en máquina', category: 'strength',
    equipment: 'Máquina de press de pecho', primary: ['Pecho'], secondary: ['Tríceps', 'Hombro'],
    steps: ['Ajusta el asiento para que las manijas queden a la altura media del pecho.', 'Lleva los omóplatos atrás y abajo y apoya la espalda en el respaldo.', 'Empuja las manijas al frente sin bloquear los codos.', 'Regresa con control.'],
    cues: ['Cola y espalda alta pegadas al respaldo.', 'No arquees la zona lumbar para empujar.'],
    slug: 'machine-chest-press',
  },
  {
    id: 'lat-pulldown', name: 'Jalón al pecho (lat pulldown)', category: 'strength',
    equipment: 'Polea alta con barra', primary: ['Dorsal ancho'], secondary: ['Bíceps', 'Romboides'],
    steps: ['Traba los muslos bajo el rodillo y toma la barra un poco más ancha que los hombros.', 'Saca el pecho y tira de la barra hacia la clavícula llevando los codos hacia abajo.', 'Haz una pausa breve con los omóplatos juntos.', 'Sube la barra con control hasta estirar los brazos.'],
    cues: ['No te eches hacia atrás más de 10–15°.', 'Nunca jales la barra detrás de la nuca.'],
    slug: 'machine-pulldown',
  },
  {
    id: 'chest-supported-row', name: 'Remo en máquina con apoyo de pecho', category: 'strength',
    equipment: 'Máquina de remo con apoyo de pecho', primary: ['Espalda media', 'Dorsal ancho'], secondary: ['Bíceps', 'Hombro posterior'],
    steps: ['Ajusta el asiento para que el pecho quede firme contra el soporte.', 'Toma las manijas con los brazos estirados.', 'Tira con los codos hacia las costillas juntando las escápulas.', 'Regresa con control sin soltar el soporte.'],
    cues: ['El apoyo de pecho quita carga a la zona lumbar: aprovéchalo.', 'No te despegues del soporte para ganar impulso.'],
    slug: null,
    alternativeId: 'seated-row',
    alternativeText: 'Remo sentado en polea, torso quieto.',
  },
  {
    id: 'seated-row', name: 'Remo sentado en polea', category: 'strength',
    equipment: 'Polea baja', primary: ['Espalda media', 'Dorsal ancho'], secondary: ['Bíceps', 'Hombro posterior'],
    steps: ['Siéntate con los pies apoyados y la espalda neutra.', 'Toma el agarre con los brazos estirados.', 'Tira llevando los codos hacia atrás y junta las escápulas.', 'Regresa con control sin que el torso se mueva.'],
    cues: ['Torso quieto: no te mezas para mover el peso.', 'Mantén la curva natural de la espalda.'],
    slug: 'machine-seated-cable-row',
  },
  {
    id: 'shoulder-press', name: 'Press de hombro en máquina', category: 'strength',
    equipment: 'Máquina de press de hombro', primary: ['Hombro'], secondary: ['Tríceps'],
    steps: ['Ajusta el asiento para que las manijas queden a la altura de las orejas.', 'Apoya toda la espalda en el respaldo vertical.', 'Empuja hacia arriba sin bloquear los codos.', 'Baja con control hasta la altura de los hombros.'],
    cues: ['No arquees la zona lumbar para empujar.', 'Si arqueas, baja el peso.'],
    slug: 'machine-overhand-overhead-press',
  },
  {
    id: 'face-pull', name: 'Face pull en polea alta', category: 'strength',
    equipment: 'Polea alta con cuerda', primary: ['Hombro posterior', 'Trapecio medio'], secondary: ['Manguito rotador'],
    steps: ['Ajusta la polea a la altura de la frente y toma la cuerda con las palmas enfrentadas.', 'Da un paso atrás con los brazos estirados.', 'Tira de la cuerda hacia la frente abriendo los codos altos.', 'Regresa con control.'],
    cues: ['Codos altos y torso quieto.', 'Ayuda a corregir la postura de escritorio.'],
    slug: 'machine-face-pulls',
  },
  {
    id: 'seated-dumbbell-curl', name: 'Curl de bíceps con mancuernas sentado', category: 'strength',
    equipment: 'Mancuernas y banco inclinado', primary: ['Bíceps'], secondary: ['Antebrazo'],
    steps: ['Siéntate en un banco inclinado con la espalda apoyada.', 'Toma una mancuerna en cada mano con los brazos estirados.', 'Flexiona los codos subiendo las mancuernas sin mover los hombros.', 'Baja con control hasta estirar.'],
    cues: ['Espalda apoyada en el banco durante toda la serie.', 'No balancees el torso.'],
    slug: null,
  },
  {
    id: 'triceps-pushdown', name: 'Extensión de tríceps en polea', category: 'strength',
    equipment: 'Polea alta con cuerda o barra', primary: ['Tríceps'],
    steps: ['Colócate frente a la polea alta con un pie adelantado.', 'Pega los codos al cuerpo y sujeta el agarre.', 'Extiende los codos hacia abajo hasta estirar los brazos.', 'Regresa con control sin separar los codos.'],
    cues: ['Codos pegados al cuerpo; solo se mueve el antebrazo.', 'El pie adelantado da estabilidad: no te inclines sobre la polea.'],
    slug: 'cable-rope-pushdown',
  },
  {
    id: 'dead-bug', name: 'Dead bug', category: 'core',
    equipment: 'Colchoneta', primary: ['Core (anti-extensión)'], secondary: ['Flexores de cadera'],
    steps: ['Acuéstate boca arriba con los brazos al techo y las rodillas dobladas a 90°.', 'Apoya suavemente la zona lumbar en el piso.', 'Baja un brazo y la pierna contraria despacio sin perder el contacto lumbar.', 'Regresa al centro y alterna.'],
    cues: ['La zona lumbar se mantiene suavemente apoyada en el piso.', 'Si se despega, reduce el rango.'],
    slug: 'dead-bug',
  },

  /* ---------- Día 3: core, glúteo y cargadas ---------- */
  {
    id: 'mcgill-curl-up', name: 'Curl-up modificado', category: 'core',
    equipment: 'Colchoneta', primary: ['Recto abdominal'], secondary: ['Core'],
    steps: ['Acuéstate boca arriba con una rodilla doblada y la otra estirada.', 'Pon las manos bajo la zona lumbar para conservar la curva.', 'Despega solo cabeza y hombros unos centímetros y sostén.', 'Baja con control y repite.'],
    cues: ['No flexiones la columna: solo cabeza y hombros.', 'Cuello neutro, sin doblar la barbilla.'],
    slug: null,
  },
  {
    id: 'side-plank', name: 'Plancha lateral', category: 'core',
    equipment: 'Colchoneta', primary: ['Oblicuos', 'Cuadrado lumbar'], secondary: ['Glúteo medio', 'Hombro'],
    steps: ['Acuéstate de lado apoyado en el antebrazo con el codo bajo el hombro.', 'Empieza con las rodillas apoyadas.', 'Levanta la cadera hasta alinear hombros, caderas y rodillas.', 'Sostén el tiempo indicado y cambia de lado.'],
    cues: ['Cadera alineada: no se cae ni rota hacia adelante.', 'Empieza apoyando las rodillas.'],
    slug: 'elbow-side-plank',
  },
  {
    id: 'hip-thrust', name: 'Hip thrust o puente con peso', category: 'strength',
    equipment: 'Máquina de hip thrust, multipower o mancuerna', primary: ['Glúteo'], secondary: ['Isquiotibiales', 'Core'],
    steps: ['Apoya la espalda alta en el banco con los pies firmes al ancho de caderas.', 'Coloca la barra o la mancuerna sobre la cadera.', 'Lleva el mentón al pecho y sube hasta alinear cadera y torso.', 'Aprieta el glúteo arriba y baja con control.'],
    cues: ['Sube hasta la línea recta: no hiperextiendas la zona lumbar.', 'Mentón al pecho y costillas abajo.'],
    slug: 'machine-plate-loaded-hip-thrust',
  },
  {
    id: 'suitcase-carry', name: 'Caminata de maleta (suitcase carry)', category: 'core',
    equipment: 'Mancuerna', primary: ['Oblicuos', 'Core (anti-inclinación)'], secondary: ['Antebrazo', 'Glúteo medio'],
    steps: ['Sujeta una mancuerna en una mano a un lado del cuerpo.', 'Párate erguido con los hombros nivelados.', 'Camina la distancia indicada con pasos cortos y controlados.', 'Cambia de mano y repite.'],
    cues: ['No te inclines hacia el peso: el torso se mantiene recto.', 'Costillas abajo y abdomen firme.'],
    slug: null,
  },

  /* ---------- Día 4 ---------- */
  {
    id: 'cable-pull-through', name: 'Pull-through en polea', category: 'strength',
    equipment: 'Polea baja con cuerda', primary: ['Glúteo', 'Isquiotibiales'], secondary: ['Core'],
    steps: ['Colócate de espaldas a la polea baja y toma la cuerda entre las piernas.', 'Da un paso al frente con las rodillas semiflexionadas.', 'Lleva la cadera hacia atrás con la espalda neutra.', 'Aprieta el glúteo para volver a la posición erguida.'],
    cues: ['Bisagra de cadera pura: la espalda no se redondea.', 'Empieza liviano y pide al instructor que revise la técnica.'],
    slug: 'cable-pull-through',
  },
  {
    id: 'romanian-deadlift-db', name: 'Peso muerto rumano con mancuernas', category: 'strength',
    equipment: 'Mancuernas', primary: ['Isquiotibiales', 'Glúteo'], secondary: ['Erectores de la columna'],
    steps: ['Párate con una mancuerna en cada mano frente a los muslos y las rodillas semiflexionadas.', 'Lleva la cadera hacia atrás deslizando las mancuernas cerca de las piernas.', 'Baja solo hasta donde la espalda se mantenga neutra.', 'Aprieta el glúteo para volver a subir.'],
    cues: ['Baja solo hasta donde la espalda no se redondee (suele ser debajo de la rodilla).', 'Empieza liviano y pide al instructor que revise la técnica.'],
    slug: 'dumbbell-romanian-deadlift',
  },
  {
    id: 'step-up', name: 'Subida al cajón (step-up)', category: 'strength',
    equipment: 'Cajón y mancuernas', primary: ['Cuádriceps', 'Glúteo'], secondary: ['Isquiotibiales', 'Core'],
    steps: ['Coloca un cajón a la altura de media tibia o rodilla.', 'Apoya todo el pie de una pierna sobre el cajón.', 'Empuja con el talón de la pierna de arriba hasta quedar erguido.', 'Baja con control y completa las repeticiones antes de cambiar de pierna.'],
    cues: ['Empuja con la pierna de arriba, no con el impulso de la de abajo.', 'Torso erguido durante todo el recorrido.'],
    slug: 'dumbbell-step-up',
  },
  {
    id: 'single-leg-press', name: 'Prensa a una pierna', category: 'strength',
    equipment: 'Máquina de prensa', primary: ['Cuádriceps', 'Glúteo'], secondary: ['Isquiotibiales'],
    steps: ['Ajusta el respaldo y apoya un solo pie en el centro de la plataforma.', 'Baja con control hasta el mismo rango que en la prensa a dos piernas.', 'Empuja sin bloquear la rodilla.', 'Completa las repeticiones y cambia de pierna.'],
    cues: ['Mismo rango que en el Día 1: la cola nunca se despega.', 'La rodilla sigue la línea del pie, sin caer hacia adentro.'],
    slug: 'machine-single-leg-leg-press',
  },
  {
    id: 'hip-abduction', name: 'Abductores en máquina', category: 'strength',
    equipment: 'Máquina de abductores', primary: ['Glúteo medio'], secondary: ['Glúteo mayor'],
    steps: ['Siéntate con la espalda apoyada y las piernas contra las almohadillas.', 'Inclina el torso un poco al frente para trabajar más el glúteo medio.', 'Abre las piernas despacio.', 'Regresa más despacio todavía.'],
    cues: ['Movimiento lento y controlado, sin rebotar.', 'Mantén la espalda baja apoyada.'],
    slug: 'machine-hip-abduction',
  },
  {
    id: 'forearm-plank', name: 'Plancha frontal', category: 'core',
    equipment: 'Colchoneta', primary: ['Core'], secondary: ['Glúteo', 'Hombro'],
    steps: ['Apóyate en los antebrazos con los codos bajo los hombros.', 'Estira las piernas con los pies al ancho de caderas.', 'Aprieta glúteos y abdomen para dejar el cuerpo en línea recta.', 'Sostén el tiempo indicado respirando.'],
    cues: ['Calidad sobre tiempo: termina cuando la cadera se hunda.', 'No dejes caer la zona lumbar.'],
    slug: 'forearm-plank',
  },

  /* ---------- Día 5 ---------- */
  {
    id: 'neutral-pulldown', name: 'Jalón con agarre neutro o cerrado', category: 'strength',
    equipment: 'Polea alta con agarre neutro', primary: ['Dorsal ancho'], secondary: ['Bíceps', 'Romboides'],
    steps: ['Traba los muslos bajo el rodillo y toma el agarre con las palmas enfrentadas.', 'Saca el pecho.', 'Tira del agarre hacia el pecho llevando los codos hacia los bolsillos.', 'Sube con control hasta estirar los brazos.'],
    cues: ['Pecho alto y torso casi fijo.', 'El agarre neutro es más amable con el hombro y el codo.'],
    slug: 'neutral-pulldown',
  },
  {
    id: 'incline-db-press', name: 'Press inclinado con mancuernas', category: 'strength',
    equipment: 'Mancuernas y banco inclinado', primary: ['Pecho (porción alta)'], secondary: ['Hombro', 'Tríceps'],
    steps: ['Ajusta el banco a 30° y siéntate con la espalda apoyada y los pies firmes.', 'Lleva las mancuernas a la altura del pecho con los codos a unos 45° del torso.', 'Empuja hacia arriba hasta estirar los brazos sin chocar las mancuernas.', 'Baja con control.'],
    cues: ['Cola en el banco y pies firmes: no arquees la zona lumbar.', 'Si no puedes controlar las mancuernas, baja el peso.'],
    slug: 'dumbbell-incline-bench-press',
    alternativeId: 'incline-chest-press',
    alternativeText: 'Press inclinado en máquina.',
  },
  {
    id: 'incline-chest-press', name: 'Press de pecho inclinado en máquina', category: 'strength',
    equipment: 'Máquina de press inclinado', primary: ['Pecho (porción alta)'], secondary: ['Hombro', 'Tríceps'],
    steps: ['Ajusta el asiento para que las manijas queden a la altura media del pecho.', 'Apoya la espalda y lleva los omóplatos atrás y abajo.', 'Empuja las manijas hacia arriba sin bloquear los codos.', 'Regresa con control.'],
    cues: ['Espalda apoyada durante toda la serie.', 'No arquees la zona lumbar para empujar.'],
    slug: 'machine-plate-loaded-incline-chest-press',
  },
  {
    id: 'single-arm-row', name: 'Remo a una mano con apoyo en banco', category: 'strength',
    equipment: 'Mancuerna y banco', primary: ['Dorsal ancho', 'Espalda media'], secondary: ['Bíceps', 'Hombro posterior'],
    steps: ['Apoya una mano y la rodilla del mismo lado en el banco con la espalda plana.', 'Toma la mancuerna con el brazo libre estirado.', 'Tira la mancuerna hacia la cadera llevando el codo atrás.', 'Baja con control y completa el lado antes de cambiar.'],
    cues: ['Espalda plana como una mesa, sin rotar el torso.', 'Tira hacia la cadera, no hacia el hombro.'],
    slug: 'dumbbell-single-arm-row',
  },
  {
    id: 'pec-deck', name: 'Aperturas en máquina (pec deck)', category: 'strength',
    equipment: 'Máquina de aperturas (pec deck)', primary: ['Pecho'], secondary: ['Hombro anterior'],
    steps: ['Ajusta el asiento para que los codos queden a la altura del pecho.', 'Apoya la espalda en el respaldo con los codos ligeramente flexionados.', 'Junta las manijas al frente sin chocarlas y sostén medio segundo.', 'Abre despacio hasta sentir el estiramiento sin forzar.'],
    cues: ['Espalda pegada al respaldo.', 'No abras más allá de la línea de los hombros.'],
    slug: 'machine-pec-fly',
  },
  {
    id: 'seated-lateral-raise', name: 'Elevaciones laterales con mancuernas, sentado', category: 'strength',
    equipment: 'Mancuernas y banco', primary: ['Hombro (deltoides medio)'],
    steps: ['Siéntate con la espalda recta y una mancuerna en cada mano a los lados.', 'Sube los brazos hacia los lados con los codos ligeramente flexionados.', 'Detente a la altura del hombro.', 'Baja con control sin balancear.'],
    cues: ['Sube hasta la altura del hombro, sin impulso.', 'Usa un peso liviano: la espalda no debe moverse.'],
    slug: 'seated-lateral-raise',
  },
  {
    id: 'reverse-pec-deck', name: 'Pájaros en máquina (reverse pec deck)', category: 'strength',
    equipment: 'Máquina de aperturas inversas', primary: ['Hombro posterior'], secondary: ['Trapecio medio', 'Romboides'],
    steps: ['Siéntate de frente al respaldo con el pecho apoyado.', 'Toma las manijas con los codos ligeramente flexionados.', 'Abre los brazos hacia atrás hasta alinear con los hombros.', 'Regresa con control.'],
    cues: ['Pecho apoyado y cuello relajado.', 'Es otro corrector de la postura de escritorio.'],
    slug: 'machine-reverse-fly',
  },
  {
    id: 'dumbbell-hammer-curl', name: 'Curl martillo con mancuernas', category: 'strength',
    equipment: 'Mancuernas', primary: ['Braquial', 'Bíceps'], secondary: ['Antebrazo'],
    steps: ['Párate o siéntate con una mancuerna en cada mano y las palmas enfrentadas.', 'Flexiona los codos subiendo las mancuernas sin girar las muñecas.', 'Baja con control hasta estirar.'],
    cues: ['Codos pegados al cuerpo y torso quieto.', 'Si te balanceas, baja el peso.'],
    slug: 'dumbbell-seated-hammer-curl',
  },
  {
    id: 'overhead-triceps-cable', name: 'Extensión de tríceps sobre la cabeza en polea', category: 'strength',
    equipment: 'Polea con cuerda', primary: ['Tríceps'],
    steps: ['Colócate de espaldas a la polea con la cuerda detrás de la cabeza.', 'Da un paso adelante con un pie y el torso estable.', 'Extiende los codos llevando la cuerda al frente y arriba.', 'Regresa con control.'],
    cues: ['Torso estable: no arquees la zona baja de la espalda.', 'Costillas abajo y abdomen firme.'],
    slug: null,
  },

  /* ---------- solo en las rutinas anteriores ---------- */
  {
    id: 'glute-machine', name: 'Máquina de glúteo', category: 'strength',
    equipment: 'Máquina de glúteo', primary: ['Glúteo'], secondary: ['Isquiotibiales'],
    steps: ['Ajusta la máquina y apoya el cuerpo según el diseño del equipo.', 'Empuja con el glúteo llevando la pierna hacia atrás.', 'Aprieta 1 segundo arriba.', 'Regresa con control y repite con la otra pierna.'],
    cues: ['El movimiento sale de la cadera, no de la espalda baja.', 'No arquees la zona lumbar al final del recorrido.'],
    slug: 'machine-glute-kickback',
  },
  {
    id: 'calf-raise', name: 'Elevación de talones', category: 'strength',
    equipment: 'Máquina de pantorrilla de pie', primary: ['Pantorrilla'],
    steps: ['Coloca las puntas de los pies en el borde de la plataforma.', 'Baja los talones estirando la pantorrilla.', 'Sube hasta ponerte de puntas y sostén 1 segundo.', 'Regresa con control.'],
    cues: ['La versión de pie con hombreras carga la columna: el plan actual prefiere la sentada.', 'Recorrido completo y sin rebotes.'],
    slug: 'machine-standing-calf-raises',
  },
  {
    id: 'lateral-raise', name: 'Elevaciones laterales', category: 'strength',
    equipment: 'Polea baja', primary: ['Hombro (deltoides medio)'],
    steps: ['Colócate de lado a la polea baja y toma el agarre con la mano lejana.', 'Sube el brazo hacia un lado con el codo ligeramente flexionado.', 'Detente a la altura del hombro.', 'Baja con control.'],
    cues: ['Peso liviano de verdad, sin impulso del torso.', 'No subas por encima de la altura del hombro.'],
    slug: 'cable-low-bilateral-lateral-raise',
  },
  {
    id: 'crunch-machine', name: 'Máquina de abdominales', category: 'core',
    equipment: 'Máquina de abdominales', primary: ['Recto abdominal'],
    steps: ['Ajusta el asiento y apoya la espalda.', 'Toma las manijas y flexiona el torso hacia adelante.', 'Sostén brevemente.', 'Regresa con control.'],
    cues: ['Flexión repetida de la columna: el plan de espalda protegida lo evita.', 'Si la espalda molesta, cámbialo por dead bug o Pallof press.'],
    slug: 'machine-crunch',
  },
  {
    id: 'pullover', name: 'Pullover en polea alta', category: 'strength',
    equipment: 'Polea alta', primary: ['Dorsal ancho'], secondary: ['Tríceps (cabeza larga)'],
    steps: ['Colócate frente a la polea alta con los brazos casi rectos.', 'Lleva la barra hacia los muslos en arco.', 'Aprieta el dorsal al final del recorrido.', 'Regresa con control.'],
    cues: ['Brazos casi rectos y torso estable.', 'No arquees la zona lumbar para ganar recorrido.'],
    slug: 'machine-pullover',
  },
  {
    id: 'biceps-curl', name: 'Curl de bíceps en máquina o polea', category: 'strength',
    equipment: 'Máquina de curl o polea', primary: ['Bíceps'], secondary: ['Antebrazo'],
    steps: ['Ajusta el asiento para que los codos queden en el apoyo.', 'Flexiona los codos subiendo el agarre.', 'Haz una pausa arriba.', 'Baja con control hasta estirar.'],
    cues: ['Codos apoyados y quietos.', 'No balancees el cuerpo para subir el peso.'],
    slug: 'machine-bicep-curl',
  },
  {
    id: 'hammer-curl', name: 'Curl martillo en polea con cuerda', category: 'strength',
    equipment: 'Polea baja con cuerda', primary: ['Braquial', 'Bíceps'], secondary: ['Antebrazo'],
    steps: ['Colócate frente a la polea baja y toma la cuerda con las palmas enfrentadas.', 'Flexiona los codos subiendo la cuerda.', 'Mantén los codos pegados al cuerpo.', 'Baja con control.'],
    cues: ['Palmas enfrentadas y codos quietos.', 'Torso erguido, sin inclinarte hacia atrás.'],
    slug: 'cable-rope-hammer-curl',
  },
  {
    id: 'back-extension', name: 'Máquina de espalda baja', category: 'strength',
    equipment: 'Máquina de extensión lumbar', primary: ['Erectores de la columna'], secondary: ['Glúteo'],
    steps: ['Ajusta la máquina y apoya el cuerpo según el diseño del equipo.', 'Haz un recorrido corto y controlado.', 'Detente sin hiperextender al final.', 'Regresa con control.'],
    cues: ['Flexión-extensión lumbar repetida: el plan de espalda protegida la evita.', 'Peso liviano siempre y recorrido corto.'],
    slug: 'machine-45-degree-back-extension',
  },
]

export const EXERCISE_LIBRARY: LibraryExercise[] = ENTRIES.map(entry)

const BY_ID = new Map(EXERCISE_LIBRARY.map(e => [e.id, e]))

export const libraryById = (id: string): LibraryExercise | undefined => BY_ID.get(id)

/** Busca primero entre los ejercicios propios del plan y luego en la
 *  biblioteca. Un ejercicio propio con el mismo id gana. */
export function resolveExercise(plan: Pick<TrainingPlan, 'customExercises'>, id: string): LibraryExercise | undefined {
  return plan.customExercises.find(e => e.id === id) ?? libraryById(id)
}
