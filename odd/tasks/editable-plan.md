# Feature: editable-plan

Objective: replace the hardcoded 3-routine block with the user's 5-day "espalda protegida" plan as editable, persisted data, with a per-exercise sheet linking to MuscleWiki, a guide screen and a plan editor, built to MVP-product quality.
Branch: `feat/editable-plan` · Delivery strategy: single-pr (L6) · Test runner: `pnpm typecheck && pnpm test` (vitest, src/lib), UI harness `BASE=http://localhost:5173/ pnpm check:ui`.

## Specs

UI copy stays Spanish, like the rest of the app. Plan content strings come verbatim from L1; quoting below is verbatim.

- **S1 — Plan content.** The default plan is exactly the plan in L1: "5 sesiones de 50–70 minutos", the weekly table (Lunes "Día 1 – Tren inferior A", Martes "Día 2 – Tren superior A", Miércoles "Día 3 – Core, movilidad y cardio", Jueves "Día 4 – Tren inferior B", Viernes "Día 5 – Tren superior B", "Sábado y domingo" "Descanso activo: tus 10.000 pasos"), the "Calentamiento fijo (10 min, antes de cada sesión)" with its 7 items, every exercise of each day with its "Series × reps", "Descanso" and "Claves técnicas" verbatim, Day 3's three blocks ("Bloque 1 – Core", "Bloque 2 – Cardio zona 2, 20–25 min", "Bloque 3 – Movilidad, 5–8 min"), and the per-day intro line. Prescriptions keep their real shape: reps ("3 × 10–12"), per side ("3 × 8–10 por pierna", "3 × 10 por lado"), timed holds ("3 × 20–30 s por lado", "3 × 20–40 s"), holds per rep ("3 × 6 (10 s cada una)"), distance ("3 × 30 m por lado"), superset ("2 × 12 cada uno (superserie)"), rounds ("2 rondas"), and Day 4 #2 "Semanas 1–4: pull-through en polea. Desde semana 5: peso muerto rumano con mancuernas" (two exercises, each with its own history, chosen by block week).
- **S2 — Exercise library.** Every exercise and stretch in the plan exists once in a library with: Spanish name, primary/secondary muscles, equipment, short execution steps, back-safety cues, an alternative where L1 gives one ("Alternativa: …"), and a MuscleWiki reference. Stable ids; existing ids (`leg-press`, `leg-extension`, …) keep their history.
- **S3 — 12-week progression.** Per L1 table: weeks "1–2" "2 por ejercicio" "RIR 4 (bastante fácil)"; "3–6" "3 por ejercicio" "RIR 2–3"; "7" "Igual que semana 3–6, la mitad de peso" "Descarga"; "8–11" "4 en los ejercicios #1 y #2 de cada día" "RIR 1–2"; "12" "La mitad de series" "Descarga y revisión". The session shows the week's sets and RIR target. Double progression per L1 ("Cuando completes todas las series en 12, sube el peso…") keeps working via the slot's high rep.
- **S4 — Editable, persisted plan.** "el plan se debe poder editar, no necesariamente debe ser fijo". The plan lives in IndexedDB, not in code; code only ships the default template. Editing never deletes history: routines are archived, not hard-deleted; sessions whose routine is unknown or archived are kept and still shown (today `normalizeStrengthSession` drops them, plan.ts:479).
- **S5 — Migration & backup.** On first run with this version: the new plan becomes active; legacy routines `dia1`/`dia2`/`dia3` remain as archived routines so their history keeps names and exercises; if the stored week still points at legacy routines it is replaced by the plan's week (assumption A1); block dates set to 12 weeks (assumption A2). Backups include the plan (backup version 3); importing v1/v2 still works and keeps the current plan.
- **S6 — Week template.** Mon–Fri → Days 1–5, Sat/Sun → "Descanso activo: tus 10.000 pasos". Weekly editor in Ajustes still works and offers all non-archived routines. "Si una semana solo puedes ir 4 días, quita el Día 3 y haz sus 3 ejercicios de core al final de las otras sesiones." is shown as a tip.
- **S7 — Session.** "cada ejercicio o estiramiento debe llevar su video y especificaciones". In the session: warm-up block first (checkable items, approach-set reminder), then the day's blocks; time holds have a hold timer, distance items a checkbox per side/set; supersets are visually grouped; each exercise records pain 0–10 with the traffic-light rule ("0–2/10 … está bien; 3–5/10 baja peso o rango; más de 5/10 … cambia el ejercicio") shown with text, not color only; rest timer uses the slot's rest.
- **S8 — Views read the plan from the store.** Home, Train, ExerciseProgress, Settings, disciplines digest use the persisted plan (no direct `ROUTINES` import in views). "Las tres rutinas" copy becomes plan-driven.
- **S9 — Exercise sheet.** Opening any exercise (session, plan, library) shows a bottom sheet: name, muscles, equipment, prescription, steps, plan cues, alternative, and a "Ver video en MuscleWiki" button opening `https://musclewiki.com/es-es/exercise/<slug>` in a new tab; when no verified slug exists, the button opens a MuscleWiki search for the exercise name. Model carries `musclewikiId: number | null` for future API (decision L2). Sheet has a visible close control, ≥44 px targets.
- **S10 — Guide.** A "Guía" screen with L1's "Antes de empezar", the medical disclaimer verbatim ("Aviso: no soy médico ni fisioterapeuta…"), "Detente y consulta si aparece" list with the urgent line emphasized, "Reglas de oro para tu espalda" 1–6, "Ejercicios a evitar por ahora" table (Evitar / Por qué / Reemplazo), progression table, and "Hábitos para 8 horas de escritorio". The red-flag list is reachable from the session in one tap.
- **S11 — Plan editor.** "el plan se debe poder editar": rename routine and focus; add, remove, reorder exercises; edit sets, rep/time/distance target, rest and technique note; swap an exercise from the library; create a custom exercise (name, muscles, optional MuscleWiki slug); add a routine; archive/restore a routine; reset to the plan template. Destructive actions confirm and offer undo. Edits persist immediately.
- **S12 — Product quality.** "el desarrollo debe ser limpio, piensa en esto como un producto para la venta que en el momento esta en su fase mvp". Keep the v2 design system (tokens in styles.css), ≥44 px touch targets, one primary action per screen, SVG icons (no emoji), visible focus, `prefers-reduced-motion`, light/dark both legible, no horizontal scroll at 375 px. MuscleWiki attribution line on the sheet. Typecheck, unit tests and UI harness green; README updated.

Assumptions: **A1** replace the stored week only when it references legacy routines. **A2** blockStart `2026-11-16` (Monday after the plan date), blockEnd `2027-02-07` (12 weeks), editable in Ajustes.

## Tasks

| ID | Specs | Route | Model | Status | Commit |
|----|-------|-------|-------|--------|--------|
| T1 | S1 S2 S3 S6 | delegated (user-mandated model routing) | sonnet | done (typecheck ok, 106 tests; RED observed; assess medium/under_budget) | f927318 |
| T2 | S4 S5 | delegated; Risk item 1+3, own commit, independent verifier | sonnet (+opus verify) | verifier: S4 PASS, S5 B1 → corrected (3b93c15), recheck B1 + write order GREEN (41 persistence tests); native review granted → APPROVED and acknowledged (lineage review-e764f4c139512d2c, lenses risk/resilience/reliability; 0 blockers) | 6ba9e64, 3b93c15 |
| T3 | S7 S8 | delegated, parallel (L7) | sonnet | done (typecheck, 219 tests, build ok; planQueries RED observed, pain/disciplines tests written alongside; Playwright smoke d1/d3/d5 at 375px clean) | f283729 |
| T3b | S11 S12 | inline (parent seam fixes) | opus | done: one exercise per routine (RED observed), data-driven tabbar/weekbar columns; single portal BottomSheet replaces plan/Sheet.tsx | 155119a, cc4657a |
| T4 | S9 S10 | delegated, parallel (L7) | haiku | done (typecheck ok, 192 tests in shared tree; RED observed; 57 guide strings verbatim-checked) | fa3e059 |
| T5 | S11 | delegated, parallel (L7) | sonnet | done (48 tests, RED observed; Playwright 375px light/dark: no h-scroll, 0 targets <44px) + parent App.tsx Plan tab/Guide wiring | 80f0ff4 |
| T6 | S12 | harness delegated (sonnet), app fixes + docs inline | sonnet + opus | done: check:ui 867/0, check:occlusion 12/0 after 3 app fixes; 256 unit tests, typecheck, build green | ff84950, this+next commit |

Forecast: ~2,500 authored changed lines (content-heavy T1) → exceeds 400, chain strategy needed before first commit.

## Log

- **L1 (2026-11-10, user, verbatim request):** "Toma esto" + the full pasted document "Plan de entrenamiento – 5 días (espalda protegida) 10 nov 2026 · @John" (verbatim in the block below; table cells were pasted one per line) + "y llevalo a mi plan actual, cada ejercicio o estiramiento debe llevar su video y especificaciones desde muscle wiki y el plan se debe poder editar, no necesariamente debe ser fijo, el desarrollo debe ser limpio, piensa en esto como un producto para la venta que en el momento esta en su fase mvp" + "Has uso del flujo odd y tu rol cómo orquestador cambiando de modelo acorde a las necesidades, no lo hagas todo con opus, aparte de esto ayudate con stitch o UX/UI Pro max para mejorar el diseño, la experiencia de usuario y la interfaz para que sea altamente comodo de usar y atractivo para el usuario final".
- **L2 (2026-11-10, decision):** MuscleWiki in-app video needs the paid official API (GROWTH $39.99/mo for Spanish), a backend token minter, and cannot play offline (api.musclewiki.com docs/llms.txt, verified). User chose "Enlace externo (Recomendado)": in-app sheet + link-out, model API-ready via `musclewikiId`.
- **L3 (2026-11-10, design):** UI UX Pro Max consulted; kept v2 brand tokens (no unrequested rebrand), adopted UX rules listed in S12. Stitch not used (user asked for one of the two).
- **L4 (2026-11-10, evidence):** repo map — `normalizeStrengthSession` drops unknown routines (plan.ts:479); `Routine.warmup` never rendered; views import `ROUTINES` directly; config store uses out-of-line keys so a `plan` record needs no DB_VERSION bump; deploy.yml deploys every push to main without the test gate.
- **L5 (2026-11-10, state):** T1 launched (sonnet). Engram mirror `odd/editable-plan/tasks` PENDING: mem_save blocked by auto-mode classifier because a hook rewrites the call input; resync when available.
- **L6 (2026-11-10, user, verbatim):** delivery question answered "Una sola rama " → strategy `single-pr`: work-unit commits on `feat/editable-plan`, one PR to main at the end (push/PR remain user decisions).
- **L7 (2026-11-10, user, verbatim):** "paraleliza lo que puedas paralelizar". Parent wrote contract stubs (store `plan`/`savePlan` in-memory, ExerciseSheet, Guide/RedFlagsSheet, PlanEditor) and launched T2, T3, T4, T5 in parallel in the same tree with disjoint surfaces and per-unit CSS files; parent owns App.tsx and styles.css. T1 contract additions: `TrainingPlan.customExercises`, `StrengthSession.pain`, `resolveExercise`.
- **L8 (2026-11-10, T1 result):** reused legacy ids leg-press, leg-extension, leg-curl, hip-abduction, chest-press, lat-pulldown, shoulder-press, pec-deck, triceps-pushdown, neutral-pulldown (history continues). Legacy-only exercises keep their previously shipped slugs (existing behavior). Parent added `sideUnit: 'pierna'` so split squat, step-up and single-leg press render "por pierna" verbatim (RED observed, then GREEN).
- **L9 (2026-11-10, T2 result):** `DEFAULT_WEEKLY_ROUTINE` kept as legacy fixture; new `PLAN_WEEKLY_ROUTINE` (literal copy of DEFAULT_PLAN.weekTemplate, equality-tested, avoids a plan.ts↔defaultPlan.ts import cycle) used by DEFAULT_CONFIG and as merge fallback. Two old tests that asserted 'diaX' ids are invalid were rewritten (contradict S4). Importing an old v2 backup does not re-run the migration (legacy ids still resolve through archived routines). `normalizePlan` drops unknown fields: any new field in plan types must be added to planStorage.ts (DEFAULT_PLAN round-trip test guards it).
- **L10 (2026-11-10, T4 result + parent):** dark `--ring` (#2b2b2b) is invisible as a focus ring on #0b0b0b; parent added a global `:focus-visible` using `--accent-ink` (both themes ≥4.5:1) in styles.css and removed the sheet-local rule. Component behavior is not unit-tested (vitest node env, no DOM) → covered by the UI harness in T6.
- **L11 (2026-11-10, T5 result):** resetToTemplate resets routines only (not warmup/phases/tips/weekTemplate); restSec ≥ 0 allowed (mobility/cardio rest 0); warm-up block not editable (not in S11, open question). `src/views/plan/Sheet.tsx` duplicates `components/BottomSheet.tsx` (same props; built before T4 landed) → unify in the seam step.
- **L12 (2026-11-10, process):** native committed-only review targets base..HEAD, so the T2 review must run in a separate worktree pinned at 6ba9e64 to stay isolated from later commits.
- **L13 (2026-11-10, opus verifier on 6ba9e64):** S4 PASS; S5 PARTIAL with blocker B1 — restoring a v1/v2 backup restores the legacy week and old dates and the migration never re-runs (db.ts importBackup saves mergeConfig(b.config) as-is). Advisory 1: migration writes plan before config, so a failed config write leaves it legacy forever. Accepted advisories: pain clamped 0..10; SetLog whitelist (new fields must be added to normalizeSetLog); corrupt stored plan skips migration. S1–S3/S6 no regression. Correction batch (one) launched: extract pure legacy-config rewrite, apply on old-backup import, write config before plan, port verifier probes as committed regression tests. Recheck limited to B1 + write order.
- **L14 (2026-11-10, T3 result):** `sessionDigest(s, plan)` / `Discipline.digest(s, plan)` take the plan; ActiveSession no longer takes setsDelta (week from session.startedAt + config.blockStart). Legacy exercise names now come from the library (e.g. leg-press "Prensa de piernas (leg press)"). ExerciseProgress range uses the sets due in each session's own week. Settings "Metas de la semana 8" → "Metas del bloque"; footer dates from config. Pain control is a labelled native select (Sin registro, 0–10). Found: tabbar fixed at 4 columns (wraps with 5 tabs), weekbar fixed at 8 columns, same exercise twice in a routine would share SetLogs (editor allows it) → parent fixes.
- **L15 (2026-11-10, parent):** fixed tabbar/weekbar/duplicate-exercise findings (155119a); unified sheets on a portal-mounted `components/BottomSheet` with `className` scope, z-index 70 above toast, preventScroll focus; removed plan/Sheet.tsx and its CSS (cc4657a). Full suite 233 tests, typecheck and build green in shared tree.
- **L16 (2026-11-10):** T2 correction (3b93c15): pure `migrateLegacyConfig` in legacyConfig.ts shared by boot migration and old-backup import; config written before plan; in-memory IndexedDB (src/lib/testing/memoryIdb.ts) covers boot/import/partial-write paths; verifier probes ported (persistence.regression/idb tests). Recheck limited to B1 + write order: GREEN. Native review: isolated worktree ~/Downloads/fitapp-worktrees/review-t2 (branch review/t2-persistence = f927318 + 6ba9e64 + cherry-pick c38c425), user answered "Revisar este cambio".
- **L17 (2026-11-10, native review T2):** approved, acknowledged (`gentle-ai.review-acknowledged/v1`), authority burned; boundary advances past 3b93c15. Non-blocking follow-ups (separate later work, do not reopen this review): R4-import-no-tx WARNING — importBackup writes config/plan/sessions in separate IDB transactions, a crash mid-import leaves a partial import (same pattern as pre-existing sessions/measurements writes); R4-silent-corrupt-plan — corrupt stored plan falls back to default with no user signal; R3-savePlan-no-reload — savePlan sets state without reload(), unlike other save*; R3-memoryidb-upgrade-always — test double fires onupgradeneeded on every open. Review worktree and branch removed.
- **L18 (2026-11-10, T6):** harness rewritten for the plan (MIG-01, PLAN-01/02, SHEET-01, GUIDE-01, PAIN-01, LEGACY-03, LAYOUT-01 light+dark at 375px, WARMUP-01). First run 867 checks / 24 failures, all from 3 app defects: guide tables inherited global th/td nowrap (page 600px wide at 375); session header 64% of 844x390 covering the current set; Chrome scroll anchoring jumped the page on step change at ≥768px. Parent fixed all three (wrap guide cells, landscape compact header with icon-only 44px alarm, overflow-anchor none on session main). Rerun: 867/0 and occlusion 12/0. README updated (plan tab, session, guide, structure, MuscleWiki section). Note: another project's vite holds 127.0.0.1:5173, run the harness on a free port.
- **L19 (2026-11-10, RDD):** slice 6ba9e64..6766065 assessed medium, review_due false (under_budget, 50 paths / 5,907 lines); no high-risk item applies, not escalated. T1 slice medium/under_budget. T2 reviewed and approved alone.
- **L20 (2026-11-10, user, verbatim):** "1" → authorize push + PR (no merge). Pre-push check found origin/main ahead with ebddbb6 (PR #1 "Permite personalizar los ejercicios de cada rutina", already deployed): it stores `config.routineExercises` (per-legacy-routine exercise lists incl. `custom-…` exercises). The branch would have dropped that data on read. Push halted. Merged origin/main (c60c41d): feature views/store kept, RoutineEditor + its helpers removed, `routineExercises` kept read-only in Config/mergeConfig. New unit e9efdf2: `legacyRoutines.ts` carries the lists into archived dia1..dia3 and custom exercises into plan.customExercises on upgrade; v2 restore adds missing custom exercises (RED observed: 6 unit + 2 idb tests; 267 tests green). Risk item 1 → opus verifier + UI harness rerun running.
- **L21 (2026-11-10, opus verifier on e9efdf2):** S5 PASS; S4 blocker B1 — PR #1 let users rename library exercises (e.g. leg-curl → "Curl femoral acostado"); the migration drops the name (PlanSlot has no name; resolveExercise finds the library id), so history shows the library name. Advisories: A1 v2 restore onto a fresh device keeps default archived lists; A2 import now overwrites a corrupt stored plan; A3 non-legacy keys (unreachable). Decision (parent): optional `PlanSlot.label` (routine-scoped name, mirrors production exerciseNameFor which looked in routines first; a global shadow would wrongly rename the new Day 1 seated curl). One correction batch: B1 + A1 + A2.
- **L22 (2026-11-10):** correction batch for L21 (sonnet): `PlanSlot.label` + `slotExerciseName`/`exerciseNameInRoutine` used at every name call site; swapExercise drops label; v2 restore applies legacy lists when archived dia1..dia3 are untouched (`legacyRoutinesUntouched`); import never writes over a missing/corrupt stored plan. RED observed (10 tests), recheck limited to B1/A1/A2 GREEN, 280 tests, typecheck, build.
- **Close:** all S1–S12 delivered on `feat/editable-plan` (single-pr). Pending user decisions: push + PR to main (a merge deploys to the phone); follow-ups from L13/L17 (import transaction, corrupt-plan signal); open question: editable warm-up. then native review (isolated worktree), T3 result, seam (sheet unification, full suite once), harness.

### L1 pasted document (verbatim)

```text
Plan de entrenamiento – 5 días (espalda protegida)
10 nov 2026 · @John
Antes de empezar
Con una protrusión discal, el progreso rápido viene de entrenar constante y sin lesionarte, no de cargar pesado desde la semana 1. Este plan prioriza máquinas y ejercicios que no comprimen ni flexionan la columna bajo carga.
Aviso: no soy médico ni fisioterapeuta. Muéstrale este plan a tu ortopedista o fisio antes de empezar, sobre todo si la protrusión te da síntomas hoy.
Detente y consulta si aparece:
• Dolor, hormigueo o adormecimiento que baja por la pierna (y peor si pasa de la rodilla).
• Debilidad en una pierna o pie.
• Dolor que empeora durante la sesión y sigue peor al día siguiente.
• Pérdida de control de orina o esfínteres, o adormecimiento en la zona genital: esto es urgencia, ve a la clínica ese mismo día.
Reglas de oro para tu espalda:
1. Columna neutra siempre: mantén la curva natural, sin redondear ni arquear de más. Con rectificación lumbar tu tendencia es aplanar la zona baja; piensa en "sacar un poco la cola" sin exagerar.
2. Bisagra de cadera: para bajar o agacharte, dobla las caderas, no la espalda.
3. Respira y aprieta el abdomen (como si te fueran a dar un golpe suave) antes de cada repetición.
4. Nada de flexión de columna con carga (abdominales tipo crunch, tocarse los pies con peso).
5. Regla del semáforo para el dolor: 0–2/10 que se va al terminar está bien; 3–5/10 baja peso o rango; más de 5/10 o que se queda al día siguiente, cambia el ejercicio.
6. Evita entrenar la espalda en la primera hora después de despertarte: los discos están más hidratados y sensibles. Si vas temprano, alarga el calentamiento.
Cómo funciona el plan
Son 5 sesiones de 50–70 minutos: dos de pierna, dos de tren superior y una de core, movilidad y cardio. Cada músculo grande se entrena 2 veces por semana, que es lo que mejor funciona para principiantes.
Día | Sesión | Duración
Lunes | Día 1 – Tren inferior A | 60 min
Martes | Día 2 – Tren superior A | 60 min
Miércoles | Día 3 – Core, movilidad y cardio | 45–50 min
Jueves | Día 4 – Tren inferior B | 60 min
Viernes | Día 5 – Tren superior B | 60 min
Sábado y domingo | Descanso activo: tus 10.000 pasos | —
Si una semana solo puedes ir 4 días, quita el Día 3 y haz sus 3 ejercicios de core al final de las otras sesiones.
Intensidad (RIR = repeticiones en reserva): termina cada serie sintiendo que podrías hacer 2–3 repeticiones más con buena técnica. Al principio nada de ir al fallo.
Progresión doble: cada ejercicio tiene un rango, por ejemplo 3 × 10–12.
1. Empieza con un peso con el que hagas 10 reps limpias.
2. Cada sesión intenta sumar 1 repetición.
3. Cuando completes todas las series en 12, sube el peso lo mínimo posible (1 placa en máquina, 1–2 kg en mancuernas) y vuelve a 10.
Descansos: 90–120 s en ejercicios grandes, 60 s en accesorios y core.
Anota todo (peso, series, reps, dolor 0–10) en el celular. Sin registro no hay progresión.
Equipo: el plan usa máquinas guiadas, poleas, mancuernas y el multipower (Smith), que son estándar en las sedes Smart Fit. Si una máquina no está o está ocupada, usa la alternativa indicada. Pide al instructor de turno que te enseñe a ajustar asiento y respaldo las primeras veces; está incluido en tu plan.
Calentamiento fijo (10 min, antes de cada sesión)
Este calentamiento despierta glúteos y core, que se "apagan" tras 8 horas sentado, y prepara la espalda para cargar.
1. Caminadora o elíptica: 5 min a ritmo moderado (inclinación 3–5 % en caminadora).
2. Gato-camello suave: 8 reps, solo movimiento sin forzar extremos.
3. Estiramiento de flexor de cadera en zancada (rodilla atrás en el piso, glúteo apretado): 30 s por lado.
4. Puente de glúteo en el piso: 12 reps con 2 s de pausa arriba.
5. Bird dog (cuatro apoyos, brazo y pierna contraria): 6 por lado, 5 s sosteniendo.
6. Rotación torácica en cuatro apoyos (mano en la nuca): 8 por lado.
7. Primera serie de cada ejercicio principal con poco peso (aproximación) antes de las series de trabajo.

Día 1 – Tren inferior A (cuádriceps)
Enfoque en cuádriceps y glúteo con la espalda apoyada o vertical, sin carga sobre los hombros.
# | Ejercicio | Series × reps | Descanso | Claves técnicas
1 | Prensa de piernas (leg press) | 3 × 10–12 | 2 min | Pies a media altura de la plataforma. Baja solo hasta antes de que la cola se despegue del respaldo; ese es tu rango.
2 | Sentadilla goblet a un banco | 3 × 8–10 | 90 s | Mancuerna pegada al pecho, siéntate al banco y sube. Torso erguido. Alternativa: sentadilla en multipower con pies adelantados.
3 | Zancada estática (split squat) en multipower | 3 × 8–10 por pierna | 90 s | Torso vertical, baja recto como ascensor. Empieza solo con la barra.
4 | Extensión de cuádriceps (máquina) | 3 × 12–15 | 60 s | Pausa 1 s arriba. Espalda pegada al respaldo.
5 | Curl femoral sentado (máquina) | 3 × 10–12 | 60 s | Mejor sentado que acostado: acostado tiendes a arquear la zona lumbar.
6 | Pantorrilla sentado (o en prensa) | 3 × 12–15 | 60 s | Pausa abajo estirando, subida completa. Evita la de pie con hombreras (carga la columna).
7 | Pallof press en polea | 3 × 10 por lado | 45 s | De lado a la polea, empuja el agarre al frente sin dejar que te gire. Core anti-rotación.

Día 2 – Tren superior A (pecho, espalda, hombro)
Todo sentado y con respaldo o apoyo de pecho, para que la espalda baja no trabaje de estabilizador bajo carga.
# | Ejercicio | Series × reps | Descanso | Claves técnicas
1 | Press de pecho en máquina | 3 × 8–10 | 2 min | Omóplatos atrás y abajo, cola y espalda alta pegadas al respaldo.
2 | Jalón al pecho (lat pulldown) | 3 × 10–12 | 90 s | Muslos trabados bajo el rodillo. Lleva la barra a la clavícula sin echarte atrás más de 10–15°.
3 | Remo en máquina con apoyo de pecho | 3 × 10–12 | 90 s | El apoyo de pecho quita carga lumbar. Codos hacia las costillas. Alternativa: remo sentado en polea, torso quieto.
4 | Press de hombro en máquina | 3 × 10–12 | 90 s | Respaldo vertical, no arquees la zona lumbar para empujar. Si arqueas, baja el peso.
5 | Face pull en polea alta | 3 × 12–15 | 60 s | Cuerda hacia la frente, codos altos. Corrige la postura de escritorio (hombros adelante).
6 | Curl de bíceps con mancuernas sentado | 2 × 10–12 | 60 s | Espalda apoyada en banco inclinado.
7 | Extensión de tríceps en polea | 2 × 12–15 | 60 s | Codos pegados al cuerpo, pie adelantado para estabilidad.
8 | Dead bug | 3 × 8 por lado | 45 s | Boca arriba, zona lumbar suavemente apoyada en el piso, bajas brazo y pierna contraria despacio.

Día 3 – Core, movilidad y cardio
Este día es tu seguro para la espalda: core que resiste movimiento (en vez de flexionar), glúteos fuertes y cardio suave.
Bloque 1 – Core ("Big 3" de McGill + cargadas), 20 min
# | Ejercicio | Series × reps | Descanso | Claves técnicas
1 | Curl-up modificado | 3 × 6 (10 s cada una) | 30 s | Una rodilla doblada, manos bajo la zona lumbar. Despega solo cabeza y hombros unos centímetros, sin doblar el cuello.
2 | Plancha lateral | 3 × 20–30 s por lado | 30 s | Empieza apoyando rodillas. Cadera alineada, no se cae.
3 | Bird dog | 3 × 6 por lado (8 s cada una) | 30 s | Espalda quieta como mesa, no levantes la pierna por encima de la cadera.
4 | Hip thrust o puente con peso | 3 × 10–12 | 60 s | En máquina de hip thrust o con mancuerna sobre la cadera. Aprieta glúteo, no arquees la zona lumbar arriba.
5 | Caminata de maleta (suitcase carry) | 3 × 30 m por lado | 60 s | Mancuerna en una mano, camina erguido sin inclinarte hacia el peso.
Bloque 2 – Cardio zona 2, 20–25 min
Elíptica o caminadora inclinada (8–10 %, 5 km/h) a un ritmo en el que puedas hablar en frases completas. Si usas bicicleta, prefiere la reclinada (con respaldo) sobre la vertical.
Bloque 3 – Movilidad, 5–8 min
• Flexor de cadera en zancada: 45 s por lado.
• Estiramiento de isquiotibiales acostado con toalla (espalda en el piso): 45 s por lado.
• Figura 4 para glúteo, acostado: 45 s por lado.
• Postura del niño suave o extensiones en prono ("cobra" a medias) si te alivian; si alguna aumenta el dolor, sáltala.

Día 4 – Tren inferior B (glúteo e isquiotibiales)
Enfoque en cadera. Un glúteo fuerte es de lo que más protege la zona lumbar de alguien que pasa el día sentado.
# | Ejercicio | Series × reps | Descanso | Claves técnicas
1 | Hip thrust (máquina o multipower) | 3 × 8–10 | 2 min | Espalda alta en el banco, mentón al pecho, sube hasta que cadera y torso queden alineados. Sin hiperextender la zona lumbar.
2 | Semanas 1–4: pull-through en polea. Desde semana 5: peso muerto rumano con mancuernas | 3 × 10–12 | 90 s | Bisagra de cadera pura: rodillas semiflexionadas, cola atrás, espalda neutra. Baja solo hasta donde la espalda no se redondee (suele ser debajo de la rodilla). Empieza liviano y pide al instructor que revise la técnica.
3 | Subida al cajón (step-up) | 3 × 8 por pierna | 90 s | Cajón a altura de media tibia o rodilla. Empuja con el talón de la pierna de arriba.
4 | Prensa a una pierna | 2 × 10–12 por pierna | 60 s | Mismo rango que en el Día 1: la cola nunca se despega.
5 | Abductores en máquina | 3 × 15 | 60 s | Torso un poco inclinado al frente para más glúteo medio.
6 | Curl femoral sentado | 2 × 12–15 | 60 s | Igual que el Día 1.
7 | Plancha frontal | 3 × 20–40 s | 45 s | Glúteos y abdomen apretados, cuerpo en línea recta. Calidad sobre tiempo.

Día 5 – Tren superior B (espalda y hombros prioridad)
Más volumen de espalda que de pecho para compensar la postura de escritorio (hombros caídos hacia adelante).
# | Ejercicio | Series × reps | Descanso | Claves técnicas
1 | Jalón con agarre neutro o cerrado | 3 × 8–10 | 2 min | Pecho alto, tira con los codos hacia los bolsillos.
2 | Press inclinado con mancuernas | 3 × 8–10 | 90 s | Banco a 30°, pies firmes, cola en el banco. Alternativa: press inclinado en máquina.
3 | Remo a una mano con apoyo en banco | 3 × 10–12 por lado | 90 s | Mano y rodilla en el banco, espalda plana como mesa. Tira hacia la cadera.
4 | Aperturas en máquina (pec deck) | 2 × 12–15 | 60 s | Codos ligeramente flexionados, espalda pegada.
5 | Elevaciones laterales con mancuernas, sentado | 3 × 12–15 | 60 s | Sube hasta la altura del hombro, sin impulso.
6 | Pájaros en máquina (reverse pec deck) | 3 × 12–15 | 60 s | Hombro posterior; otro corrector de postura.
7 | Curl martillo + extensión de tríceps sobre la cabeza en polea | 2 × 12 cada uno (superserie) | 60 s | Tríceps: de espaldas a la polea, torso estable, sin arquear la zona baja.
8 | Bird dog + plancha lateral | 2 rondas | 30 s | Versión corta del Día 3 para cerrar.

Ejercicios a evitar por ahora
No están prohibidos para siempre: algunos se pueden introducir después de 3–6 meses sin síntomas y con el visto bueno de tu fisio.
Evitar | Por qué | Reemplazo
Abdominales crunch, sit-ups, máquina de abdomen, giros rusos | Flexión y rotación repetida de la columna: el patrón que más estresa el disco | Dead bug, curl-up modificado, Pallof press, planchas
Sentadilla con barra en la espalda | Carga directa y alta sobre la columna | Prensa, goblet squat, split squat en multipower
Peso muerto convencional desde el piso | Exige mucha técnica; error común = redondear la espalda con carga | Hip thrust, pull-through, rumano liviano desde semana 5
Buenos días (good mornings) | Gran palanca sobre la zona lumbar | Pull-through en polea
Máquina de hiperextensiones con mucho rango o peso | Flexión-extensión lumbar repetida | Bird dog, hip thrust
Remo con barra inclinado (sin apoyo) | La espalda baja sostiene todo el torso | Remo con apoyo de pecho o a una mano en banco
Press militar de pie con barra | Tendencia a arquear la zona lumbar | Press de hombro sentado en máquina
Elevaciones de piernas colgado | Tiran de la pelvis y arquean la zona lumbar | Dead bug

Progresión en 12 semanas y hábitos diarios
Las primeras 2 semanas parecen fáciles a propósito: tus músculos se adaptan rápido, pero discos y tendones necesitan más tiempo.
Semanas | Series en ejercicios principales | Intensidad | Objetivo
1–2 | 2 por ejercicio | RIR 4 (bastante fácil) | Aprender técnica y ajustes de cada máquina
3–6 | 3 por ejercicio | RIR 2–3 | Progresión doble: sumar reps y peso cada semana
7 | Igual que semana 3–6, la mitad de peso | Suave | Descarga: recuperarse y consolidar
8–11 | 4 en los ejercicios #1 y #2 de cada día | RIR 1–2 | Más volumen; empieza el peso muerto rumano si no lo hiciste
12 | La mitad de series | Suave | Descarga y revisión: compara tu registro con la semana 1
En la semana 12 revisa el plan con tu fisio y decide qué cambiar o introducir.
Hábitos para 8 horas de escritorio:
• Levántate cada 45–60 min aunque sea 2 min: camina, haz 5 extensiones de pie con las manos en la cintura, o 10 sentadillas al aire.
• Pantalla a la altura de los ojos, pies apoyados, cadera un poco más alta que las rodillas, cojín o toalla enrollada en la zona lumbar.
• Mantén tus 10.000 pasos: caminar es de lo mejor que existe para la espalda. Cuenta como cardio de base.
• Proteína: apunta a 1,6–2 g por kg de peso al día (pollo, huevos, carne, lácteos, legumbres, whey si te queda práctico).
• Duerme 7–9 horas: ahí es donde realmente progresas.
• Si un día la espalda está irritada, no faltes: haz solo el Día 3 suave y camina.
```
