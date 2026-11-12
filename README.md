# FitPlan

Bitácora de entrenamiento y composición corporal con un plan editable. Trae precargado el plan de 5 días «espalda protegida» (12 semanas, del 16 de noviembre de 2026 al 7 de febrero de 2027).

PWA **local-first**: todos los datos viven en IndexedDB dentro del dispositivo. No hay servidor, no hay cuenta, no hay analítica y funciona sin señal — que es exactamente lo que se necesita en el sótano de un gimnasio.

## Qué hace

**Plan.** El plan vive en el dispositivo y se edita desde la pestaña *Plan*: renombrar rutinas, agregar, quitar, reordenar y cambiar ejercicios desde la biblioteca, ajustar series, repeticiones, tiempos, distancias y descansos, crear ejercicios propios, agregar rutinas y archivarlas. Archivar nunca borra: el historial conserva nombres y ejercicios. Las acciones destructivas piden confirmación y se pueden deshacer. *Restablecer plan original* vuelve a la plantilla sin tocar el historial.

**Entrenar.** Cada sesión arranca con el calentamiento fijo y sigue los bloques de la rutina. Durante la sesión:

- Al marcar una serie arranca solo el temporizador de descanso del ejercicio, que vibra y suena al terminar.
- Cada ejercicio muestra **los pesos y repeticiones de la sesión anterior** y los usa como marcador de posición. Cuando completaste todas las series en el extremo alto del rango, aparece **«sube peso»** (doble progresión).
- Planchas y sostenidos tienen cronómetro; las caminatas con carga se marcan por serie; las superseries y circuitos se agrupan y el descanso corre al terminar el grupo.
- Las series se ajustan a la fase de la semana (12 semanas: técnica, progresión, descarga, volumen, revisión) y la cabecera muestra la semana y el RIR objetivo.
- Se registra el dolor 0–10 por ejercicio con la regla del semáforo, escrita y no solo en color. *Señales de alarma* está a un toque.
- Cada ejercicio abre su ficha: músculos, pasos, claves para cuidar la espalda, alternativa y **Ver video en MuscleWiki**.
- Guarda el número de asiento de cada máquina y te lo muestra la próxima vez.

**Guía.** Antes de empezar, señales de alarma, reglas de oro, ejercicios a evitar con su reemplazo, progresión de 12 semanas y hábitos de escritorio.

**Medidas.** Bitácora de bioimpedancia y cinta cada dos semanas. Calcula masa magra, ratio músculo/grasa, FFMI, IMC, índice cintura/estatura y agua sobre masa magra; compara contra la línea base y contra la meta del bloque, y grafica la tendencia.

**Inicio.** Qué toca hoy según el día de la semana, en qué semana del bloque vas y cómo va la composición.

**Ajustes.** Exportar e importar respaldo en JSON, cambiar estatura, fechas del bloque y metas.

## Correrlo

```bash
npm install
npm run dev
```

## Cuenta y backend

El login y la sincronización son opcionales. Se activan con dos variables de entorno de Vite (por ejemplo en un archivo `.env.local`, que no se versiona):

| Variable | Para qué |
| --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clave pública de Clerk. Con ella aparece el inicio de sesión en Ajustes. |
| `VITE_API_URL` | URL base de la API de MagniFit, por ejemplo `https://api.magnifit.co`. |

Sin ellas la app es solo local: no se carga Clerk, no hay cuenta y todo vive en el dispositivo (IndexedDB), igual que hoy. El despliegue en GitHub Pages funciona sin configurar nada.

### Sincronización (offline-first)

IndexedDB sigue siendo la fuente de verdad local; el código vive en `src/lib/sync/`.

- **Outbox.** Cada escritura de la tienda (`store.tsx` → `sync/localWrites.ts`) guarda en IndexedDB y deja el cambio en una base aparte, `magnifit-sync` (almacenes `outbox` y `meta`), sin tocar la versión de `fitplan`. Dos escrituras del mismo registro quedan como una sola entrada; un borrado viaja como lápida con el último body conocido. Con el login deshabilitado no se encola nada; con login pero sin sesión sí, para subirlo al entrar.
- **`syncNow()`** (`sync/engine.ts`, una a la vez): sube el outbox en lotes (≤ 200 registros, ≤ 4 MB) y quita lo que vuelve `applied` o `stale`; luego baja desde el cursor hasta `hasMore: false`, guardando el cursor por página. Un registro todavía pendiente en el outbox no se pisa con la copia remota. Lo bajado se escribe directo con `db.ts` y no se vuelve a encolar. Sin red (o `ClerkOfflineError`) se conserva el outbox, se anota el error y se reintenta con espera creciente (5 s a 5 min).
- **Cuándo corre** (solo con sesión iniciada): al abrir la app o entrar, al volver la red, al volver a primer plano, 3 s después de una escritura y cada 5 min con la app visible. Ajustes → Cuenta muestra el estado y el botón *Sincronizar ahora*.
- **Primer ingreso.** Si este teléfono nunca sincronizó, baja todo desde 0 (en las llaves que existen en ambos lados gana el servidor), sube lo que solo está aquí y recién ahí queda asociado a la cuenta. Nunca borra datos locales.
- **Otra cuenta en el mismo teléfono.** Si entra una cuenta distinta a la que ya sincronizó, no se mezclan datos: la sincronización se pausa con el aviso "Esta app tiene datos de otra cuenta…" hasta volver a la cuenta original. Para usar el teléfono con otra cuenta: exporta un respaldo y usa *Borrar todos los datos* (también olvida el estado de sincronización).
- **Restaurar un respaldo** con login habilitado marca todo lo restaurado como lo más nuevo y lo sube. Lo que solo existe en el servidor no se borra allá.
- **Límites conocidos.** Las notas por ejercicio, el plan y la config no tienen borrado local, así que sus lápidas remotas se ignoran. Un registro que el servidor rechaza por validación (400) bloquea su lote hasta corregirlo; el error queda visible en Ajustes.

## Publicar en GitHub Pages

1. Crea el repo y sube esto.
2. En **Settings → Pages**, elige *Source: GitHub Actions*.
3. Empuja a `main`. El workflow de `.github/workflows/deploy.yml` compila e inyecta el `base` correcto a partir del nombre del repo.
4. Entra desde el celular a `https://<usuario>.github.io/<repo>/` y usa *Añadir a pantalla de inicio*. A partir de ahí abre como app, a pantalla completa y sin conexión.

> El service worker solo funciona sobre HTTPS o en `localhost`. GitHub Pages da HTTPS, así que no hay nada más que configurar.

## Los datos son tuyos, y esa es también la responsabilidad

Todo está en IndexedDB de **ese** navegador. Si borras los datos del sitio, cambias de teléfono o desinstalas la app, se pierden. **Exporta el respaldo una vez al mes** desde Ajustes y guárdalo donde tengas copia.

Con la cuenta y la API configuradas, los datos además se sincronizan con el servidor (ver *Sincronización* arriba). Igual conviene exportar: el respaldo no depende de ninguna cuenta.

**Compatibilidad de respaldos hacia atrás, no hacia adelante.** Desde que existe el motor de disciplinas (`Session` como unión de fuerza y natación), los respaldos llevan `version: 2`. Restaurar un respaldo v2 en una versión de FitPlan **anterior** a este cambio falla: esa build no sabe leer el campo `kind` y revienta al calcular el volumen de una sesión. Restaura siempre con la versión de la app que generó el respaldo, o una más nueva — nunca una más vieja. Desde el plan editable los respaldos llevan `version: 3` e incluyen el plan; importar un respaldo v1 o v2 (sin plan) sigue funcionando y conserva el plan actual.

## Estructura

```
src/
  types.ts                 Modelo de datos (plan, biblioteca, sesiones, respaldo)
  lib/library.ts           Biblioteca de ejercicios y estiramientos (resolveExercise)
  lib/defaultPlan.ts       Plantilla del plan de 5 días y rutinas anteriores archivadas
  lib/phases.ts            Semana del bloque, fase, series por semana, etiquetas de objetivo
  lib/planEdits.ts         Operaciones puras del editor del plan
  lib/planQueries.ts       Consultas sobre el plan activo (rutina del día, conteo de series)
  lib/planStorage.ts       Lectura defensiva del plan guardado (normalizePlan)
  lib/migration.ts         Migración de una sola vez al plan editable
  lib/legacyConfig.ts      Reescritura de la semana y el bloque anteriores (arranque y respaldos)
  lib/guideContent.ts      Texto de la Guía
  lib/musclewiki.ts        Enlaces a MuscleWiki
  lib/db.ts                IndexedDB: sesiones, medidas, notas, configuración, plan, respaldo
  lib/store.tsx            Contexto de React sobre la base de datos (incluye plan y savePlan)
  lib/plan.ts              Configuración por defecto, línea base, metas y normalizeSession
  lib/calc.ts              Derivadas de composición, primitivas de fuerza, doble progresión
  lib/disciplines.ts       Tabla de disciplinas, digest de sesión, agregados semanales
  components/BottomSheet   Hoja modal única (ficha, señales de alarma, editor)
  components/ExerciseSheet Ficha del ejercicio
  views/                   Inicio, Entrenar, Sesión, Plan (editor), Guía, Medidas, Ajustes
```

Los identificadores de ejercicio (`leg-press`, `chest-press`, …) son la llave del historial: ningún cambio del editor los modifica salvo *Cambiar ejercicio*, y un ejercicio aparece una sola vez por rutina porque las series se agrupan por ejercicio.

## Cambiar el plan

Desde la app, en la pestaña *Plan*. El plan se guarda en IndexedDB (almacén `config`, clave `plan`) y viaja en el respaldo. El código solo trae la plantilla (`src/lib/defaultPlan.ts`) que usan la primera apertura y *Restablecer plan original*. Si agregas un campo a los tipos del plan, agrégalo también a `src/lib/planStorage.ts`: la lectura descarta campos desconocidos y la prueba de ida y vuelta del plan por defecto falla si lo olvidas.

## Videos de MuscleWiki

Cada ficha abre la página del ejercicio en MuscleWiki.com, fuera de la app, o una búsqueda cuando no hay un enlace verificado. Mostrar los videos dentro de la app requiere la API oficial de pago y un servidor que emita tokens, y sus términos no permiten guardarlos para usarlos sin conexión. El modelo ya reserva `musclewiki.id` para esa integración.

---

Herramienta personal de seguimiento. No sustituye valoración médica ni nutricional.
