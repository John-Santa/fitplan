# Daily-use flows (audit 2026-11-12)
Objective: specify the day-to-day user flows the owner asked for, grounded in what the current screens already do. Branch: `docs/daily-use-flows`. Runners: `cd web && pnpm typecheck && pnpm test` (Vitest in node, `renderToString`, no DOM).
Status: implementation authorized on 2026-11-13 (L5) on branch `feat/daily-use-flows`; one isolated worktree and branch per unit (U1-U6), then one integration unit (U7) and a feature-end verifier. Delivery: ask-on-risk; no push without the owner.

## Current state
One entry per candidate, in the owner's numbering. Evidence was read at merged main 54a2d7b.

- **C1 — Previous session reference and suggested load: Partial.** The current set card already shows "Anterior: 60 kg × 10" from the same set index of the last finished session (`web/src/features/session/components/SlotCard.tsx:151-155`, `refFor` at `:48`, `lastPerformance` at `web/src/lib/calc.ts:80-89`), prefills the weight stepper with that weight (`SlotCard.tsx:165-169`) and shows "Sube peso la próxima" plus "Cerraste las tres series en 12. Hoy va la siguiente placa." when double progression is met (`SlotCard.tsx:111,146-158`, `calc.ts:95-116`). The week's phase line, including week 7's "la mitad de peso", is printed above the exercise (`web/src/features/session/components/StrengthBody.tsx:195,392`, `web/src/lib/defaultPlan.ts:180`). Missing: no load is suggested for today: in week 7 the stepper still prefills the full previous weight, and after a progression it prefills the old weight while the line says "Hoy va la siguiente placa".
- **C2 — Session closing summary: Missing.** "Terminar entrenamiento" saves and drops the user back on the Entrenar list (`web/src/features/session/routes/Train.tsx:58-68`). Volume and duration exist only in the history detail (`Train.tsx:104-109`). No records, no comparison and no streak at the end of a session.
- **C3 — Swap an exercise only for today: Exists.** "Cambiar" on every exercise (`SlotCard.tsx:235-239`) opens the picker in swap mode (`StrengthBody.tsx:396-405`); the swap is stored per session in `StrengthSession.swaps` (`web/src/lib/types.ts:179-181`, `StrengthBody.tsx:151-153`), survives normalization (`web/src/lib/plan.ts:675,688`), shows "Cambiado solo por hoy." and offers "Guardar en el plan" (`SlotCard.tsx:241-246`, `StrengthBody.tsx:154-162`). The plan is untouched unless the user taps that button. No spec.
- **C4 — Weekly summary of the closed week: Partial.** Hoy shows the current, still open week: "Esta semana · N de M entrenamientos", rest wildcards, strength volume and a 5-week volume sparkline (`web/src/features/today/routes/Home.tsx:124-131,341-347,456-485`, `weekSummary` at `web/src/features/habit/lib/week.ts:60-68`). Hábito repeats "Esta semana N de M" (`web/src/features/habit/routes/Habit.tsx:136-142`). Missing: any view of the previous, closed week; walks are never counted; no position against the block beyond the phase goal line.
- **C5 — Personal records per exercise: Partial.** ExerciseProgress charts the best set and the exercise volume per session (`web/src/features/progress/routes/ExerciseProgress.tsx:55-83`). Its "Mejor serie" tile shows the latest session's best set, not the all-time best (`ExerciseProgress.tsx:61,111`). History is filtered by routine (`:52`), so the same exercise in two routines is split. No best volume figure and no alert when a record is broken (no "récord" string anywhere in `web/src`).
- **C6 — Monthly calendar: Partial.** Hábito shows a 12-week grid (`Habit.tsx:96-127`, `habitGrid` at `web/src/features/habit/lib/habit.ts:80-89`) that tells "Entrenado" (any finished session) from "Hecho" (a check-in), plus rest wildcards and misses. It does not tell strength from swimming, has no month layout and cannot go further back than 12 weeks. Hoy's strip covers only the current week (`Home.tsx:349-413`).
- **C7 — Quick weight log: Partial.** A weight-only measurement is already valid ("Fecha y peso son obligatorios", `web/src/features/progress/routes/Measure.tsx:42-48,139`), but it takes Progreso (lands on Hábito, `web/src/app/App.tsx:55-58`) → Medidas → "Nueva medición" → a form of 11 inputs. Measurements are keyed by date and saved with a whole-record `put` (`web/src/lib/db.ts:164`, `web/src/features/sync/lib/localWrites.ts:52-55`), so saving only the weight on a date that already has a full measurement replaces the record and drops the other fields; the existing form has the same behavior.
- **C8 — Move today's workout to tomorrow: Exists (implicitly, by design).** The week is flexible: no routine is tied to a weekday (`week.ts:1-3`), the suggestion is the first routine not done this week, so tomorrow suggests the same routine (`week.ts:46-49`), a past day without activity automatically spends a rest wildcard (`habit.ts:63-76`), rest days extend the streak and one isolated miss is forgiven (`habit.ts:95-115`). Hoy shows "Comodines de descanso: N de M disponibles" (`Home.tsx:202-205,347`). There is no explicit "move" button. No spec; see D7.
- **C9 — Pain over time: Partial.** Pain 0–10 is recorded per exercise and session (`types.ts:173-175`, `web/src/features/session/components/PainControl.tsx`, shown after the last set at `SlotCard.tsx:314-316`) with the plan's traffic-light verdict (`web/src/lib/pain.ts:21-25`). It is visible only inside one session's history detail ("Dolor registrado", `Train.tsx:133-142`). No view by exercise or by week.

## Specs
Order: the owner's priority (1, 2, then 4), then the recommended order with its reason. Every quoted line is the owner's, verbatim. UI copy is Spanish and marked "proposed copy".

### S1 — Previous session reference and today's suggested load (C1)
Owner: "Referencia de la sesión anterior en cada serie. Mostrar "la vez pasada: 60 kg × 10" junto a la serie y sugerir la carga de hoy según la fase."
- Goal: each weighted set shows what was done last time and the load to use today, according to the week's phase.
- Happy path:
  1. The user opens a strength exercise with a weighted reps target and a previous finished session.
  2. The current set card shows the previous line for that set index. Proposed copy: "La vez pasada: 60 kg × 10" (replaces "Anterior: …" at `SlotCard.tsx:153`).
  3. Below it, the card shows today's load and why. Proposed copy: "Sugerido hoy: 62,5 kg · Sube una placa"; "Sugerido hoy: 30 kg · Semana de descarga: la mitad de peso"; "Sugerido hoy: 60 kg · Mismo peso, suma repeticiones".
  4. The weight stepper behaves per D2.
- Edge cases: first time with the exercise keeps today's "Primera vez: empieza liviano, la primera serie es de reconocimiento." with no suggestion; the previous session had fewer sets than today (`refFor` falls back to the last set, `SlotCard.tsx:48`); the previous sets used different weights (suggestion per set index); a value the user already typed always wins over the suggestion; editing a finished session (`Train.tsx:74-87` reuses this screen) must not change logged weights; time, distance and note targets get no suggestion; a swapped exercise uses the swapped exercise's own history. Known, not changed here: `lastPerformance` orders by `startedAt` (`calc.ts:82-83`) and a session logged for a past date gets `startedAt = Date.now()` (`web/src/lib/disciplines.ts:47-53`), so a back-dated session counts as "la vez pasada".
- Assumption: the "Sube peso la próxima" pill (`SlotCard.tsx:147`) reads "Sube peso hoy" so it agrees with "Hoy va la siguiente placa" (`calc.ts:115`) and with the suggestion.
- Assumption: one plate is 2.5 kg, the stepper's step (`SlotCard.tsx:166`).
- Data: reuses `lastPerformance`, `shouldProgress`, `refFor`, `completionPatch` (`calc.ts:80,95`; `SlotCard.tsx:48,52`), `phaseForWeek`, `blockWeekNumber`, `setsForSlot` (`web/src/lib/phases.ts:8,15,34`). New pure function (for example `suggestLoad(prevSets, setIndex, slot, expectedSets, phase)`) in `web/src/lib/calc.ts` or a new `web/src/lib/load.ts`. No persisted or synced shape change under D1 option A; D1 option B adds an optional `Phase.loadFactor` to the plan document (risk item 3, see D1).
- Files likely touched: `web/src/lib/calc.ts` (or new `load.ts`) and its test, `web/src/features/session/components/SlotCard.tsx`, `StrengthBody.tsx` (pass phase and expected sets).
- Acceptance criteria:
  - With previous sets 60×12, 60×12, 60×12, target 10–12, 3 expected sets and a base phase, the suggestion is 62.5 kg with reason "Sube una placa".
  - In a phase whose load note is "la mitad de peso", previous 60 kg suggests 30 kg.
  - Otherwise the suggestion equals the previous weight for that set index.
  - `renderToString(<SlotCard …/>)` contains "La vez pasada: 60 kg × 10" and "Sugerido hoy: 62,5 kg".
  - Under D2 option A, `completionPatch` with no typed weight logs the suggested weight; reps, time, distance and note branches are unchanged (pinned first: no test covers `completionPatch`, `lastPerformance` or `shouldProgress` today).
- First RED test: `suggestLoad` returns 62.5 kg and "Sube una placa" for three sets of 60 kg × 12 with a 10–12 target in a base phase.
- Size: M. Risk: none under D1-A (derived values, no persisted change); item 3 under D1-B.

### S2 — Session closing summary (C2)
Owner: "Resumen al terminar. Hoy la sesión se guarda y listo. Falta una pantalla de cierre con volumen total, récords del día, comparación con la sesión anterior y la racha."
- Goal: after "Terminar entrenamiento", the user sees what the session achieved before returning to the list.
- Happy path:
  1. The user taps "Terminar entrenamiento" (or "Terminar" and confirms); the session is saved exactly as today (`Train.tsx:58-67`).
  2. A closing screen opens. Proposed copy: title "Sesión terminada", the routine name and duration.
  3. "Volumen total: 4.320 kg" (proposed copy).
  4. "Récords de hoy" lists each record from S4 ("Prensa: 65 kg, nuevo mejor peso"); with none, the block is hidden.
  5. "Frente a la sesión anterior: +180 kg de volumen · +2 series" (proposed copy), per D4.
  6. "Racha: 12 días" (proposed copy), computed after the save so today counts.
  7. "Listo" (proposed copy) returns to the Entrenar list, today's destination.
- Edge cases: first session of the routine ("Primera vez con esta rutina", proposed copy, no comparison); a session with only time, distance or note items (volume 0: hide the volume line); finishing early with partial sets; a back-dated session (streak computed for today, comparison against the session before it by date); a minimal session (Assumption: comparison skipped, it covers one exercise); finishing an edit of a past session (`Train.tsx:80-83`) shows no summary; a reload on the summary loses only the summary, the session is already saved.
- Assumption: the summary applies to strength sessions only; swimming keeps today's behavior.
- Data: reuses `sessionVolume`, `doneSets`, `fmtDuration` (`calc.ts:66,68,47`), `streak` with the Hoy context (`habit.ts:100`, `restAllowance` at `week.ts:30`), `useToast`/`BottomSheet` patterns, and S4's record detection. Pure function (for example `summarizeSession(finished, sessions, today)`) in `web/src/features/session/lib/summary.ts`, presentational `SessionSummary.tsx`. No persisted or synced shape change: everything is derived from saved sessions and config.
- Files likely touched: `web/src/features/session/routes/Train.tsx` (state after finish), new `web/src/features/session/lib/summary.ts` + test, new `web/src/features/session/components/SessionSummary.tsx` + test.
- Acceptance criteria:
  - `summarizeSession` returns the finished session's volume, the previous comparable session (D4) with volume and set deltas, today's records and the streak including today.
  - `renderToString(<SessionSummary …/>)` contains "Volumen total", "Frente a la sesión anterior" and "Racha"; with no previous session it contains "Primera vez con esta rutina" and no comparison.
  - Editing a finished session and saving never produces a summary (`Train.tsx` editing branch unchanged).
- First RED test: `summarizeSession` for a finished session of 4,320 kg after one of 4,140 kg of the same routine returns volume 4320 and a delta of +180.
- Size: M. Risk: none. Depends on S4's record function (built first, see Tasks) and D3, D4.

### S3 — Weekly summary of the closed week (C4)
Owner: "Resumen semanal. Una vista de la semana cerrada: entrenamientos hechos contra planeados, volumen, caminatas y cómo vas respecto al bloque."
- Goal: once a calendar week (Monday..Sunday) ends, the user can review it.
- Happy path:
  1. The user opens the weekly summary (placement per D5).
  2. Proposed copy: title "Semana del 16 al 22 nov".
  3. "Entrenamientos: 4 de 5" (distinct routines done against the rotation target, same rule as `weekSummary`).
  4. "Volumen: 18.400 kg" with the change against the week before ("+6 % frente a la semana anterior", proposed copy).
  5. "Caminatas: 2" (check-ins of the week).
  6. "Bloque" line per D6, for example "Semana 5 de 12 · Progresión doble: sumar reps y peso cada semana".
  7. A control to step to earlier closed weeks (proposed copy "Semana anterior").
- Edge cases: the first week of use (days before the first activity are "none", `habit.ts:57-58`); a week with no sessions; a week before the block start or after its end (no block line, or "Bloque terminado"); routines archived since that week (Assumption: the target uses the current rotation, as `weeklyTarget` does today, `week.ts:25-27`); swims are not counted in "Entrenamientos" (Assumption, same as `weekSummary`); a walk check-in on a day that also had a session (Hoy hides the button that day, `Home.tsx:329`).
- Assumption: "caminatas" are `Config.habitCheckIns` dates, the only thing "Marcar caminata hecha" writes (`Home.tsx:330-338`, `habit.ts:134-138`).
- Data: reuses `weekDays`, `routinesDoneThisWeek`, `weeklyTarget` (`week.ts:13,35,25`), `finishedIn` (`disciplines.ts:257`), `sessionVolume`, `blockWeekNumber`/`phaseForWeek`, and `weekVolumes` (`web/src/features/today/lib/blockEnd.ts:12`) for D6-A. `weekSummary` cannot be reused as is for a closed week: it counts rest days only before `today` (`week.ts:66`); a new pure function (for example `closedWeekSummary(plan, sessions, checkIns, monday)`) next to it. Note: `weeklySummary`, `weeklyVolume` and `weeklyCount` in `disciplines.ts:280-355` have no non-test callers and use a rolling 7-day window and the old fixed `weeklyRoutine` target, so they are not the base. No persisted or synced shape change under D5-A; D5-B stores a per-device dismissal in localStorage only.
- Files likely touched: `web/src/features/habit/lib/week.ts` + test, new `web/src/features/habit/components/WeekReview.tsx` + test, `Habit.tsx` or `Home.tsx` per D5.
- Acceptance criteria:
  - For a fixture week 2026-11-16..22 with 4 of 5 routines done, 2 check-ins and 18,400 kg, `closedWeekSummary` returns done 4, target 5, walks 2, volume 18400 and the previous week's volume.
  - The rendered review contains "4 de 5", "Caminatas: 2" and the D6 block line.
  - Hoy's "Esta semana" numbers are unchanged for the same data (differential against base).
- First RED test: `closedWeekSummary` for Monday 2026-11-16 returns `{ done: 4, target: 5, walks: 2, volume: 18400 }` from the fixture.
- Size: M. Risk: none.

### S4 — Personal records per exercise (C5)
Recommended next because S2 needs the same record detection, so it is built once and early.
Owner: "Récords personales por ejercicio. Mejor peso y mejor volumen, con aviso cuando rompes uno."
- Goal: each weighted exercise shows its best weight and best volume, and the user is told when a session beats one.
- Happy path:
  1. In Ver progresión, the tiles show "Mejor peso: 80 kg × 8" and "Mejor volumen: 2.400 kg" (proposed copy), all-time per exercise, replacing the "Mejor serie" tile that today shows the latest session (`ExerciseProgress.tsx:111`).
  2. During a session, completing a set that beats the best weight shows the toast "Nuevo récord: 65 kg en Prensa" (proposed copy); the best-volume record is evaluated when the exercise's last set is done.
  3. The same records appear in S2's "Récords de hoy".
- Edge cases: first ever session with an exercise (Assumption: no record alert; there is nothing to beat); equal to the record is not a record; a record set later undone (the toast stays shown, the summary recomputes from saved sets); editing or deleting a past session recomputes records (derived data); swapped exercises keep their own records (history is keyed by `exerciseId`, `types.ts:6-7`); sets without weight or reps are ignored; back-dated sessions compare against sessions dated before them.
- Data: reuses `bestSet`, `setVolume` (`calc.ts:61,71`) and the toast already owned by `SessionShell` (`web/src/features/session/components/SessionShell.tsx:66,147,152`), which needs a way for `StrengthBody` to call `show` (today only the rest timer does). New pure functions (for example `personalRecords(sessions, exerciseId, beforeDate?)` and `recordsBroken(session, history)`) in `web/src/lib/records.ts`. ExerciseProgress should read records across all routines for that `exerciseId` (today it filters by routine, `ExerciseProgress.tsx:52`). No persisted or synced shape change: records are derived from sessions.
- Files likely touched: new `web/src/lib/records.ts` + test, `ExerciseProgress.tsx` + new test, `SessionShell.tsx`, `StrengthBody.tsx`.
- Acceptance criteria:
  - With sessions of 80 kg then 70 kg for one exercise, ExerciseProgress renders "Mejor peso" with 80, not 70.
  - `recordsBroken` returns a weight record when a done set's weight is strictly greater than every earlier session's, and a volume record when the session's exercise volume is strictly greater; none for a first session.
  - The same exercise logged in two routines yields one record set.
- First RED test: ExerciseProgress with an 80 kg session followed by a 70 kg session renders the best weight as 80 (fails today: the tile shows the latest, 70).
- Size: M. Risk: none. Blocked by D3.

### S5 — Quick weight log (C7)
Recommended next: smallest change with daily use, and it fixes a latent overwrite.
Owner: "Registro rápido de peso. Un acceso de un toque para anotar solo el peso."
- Goal: from Hoy, one tap opens a single weight field and saves it for today.
- Happy path:
  1. On Hoy, the user taps "Anotar peso" (proposed copy).
  2. A bottom sheet "Peso de hoy" (proposed copy) opens with one decimal input prefilled with the last recorded weight.
  3. "Guardar" (proposed copy) saves today's measurement and shows "Peso guardado" (proposed copy).
- Edge cases: today already has a measurement with body-composition fields: the new weight is merged and every other field is kept; an empty, zero, negative or non-numeric value is rejected ("Escribe tu peso en kg", proposed copy); no measurement exists yet (this becomes the first row, the "inicio" base of Cuerpo, `Measure.tsx:28,174`, so body-composition deltas show "—" until a full measurement exists); the same date edited on another device (last write wins per record, as today); Cuerpo's advice "Cada dos semanas, no cada día" (`Measure.tsx:108`) is about bioimpedance and stays.
- Assumption: the shortcut lives on Hoy next to "Marcar caminata hecha" and always saves for today.
- Data: reuses `Measurement` (`types.ts:230-242`) and `saveMeasurement` (`web/src/lib/store.tsx:155` → `localWrites.ts:52-55`, synced per date at `web/src/features/sync/lib/engine.ts:341`). New pure merge (for example `withWeight(existing, date, weight)`) in `web/src/lib/calc.ts` or a measurement helper. No shape change: the merged record has today's `Measurement` shape and syncs as one record. Risk is the write path: it updates an existing stored record.
- Files likely touched: `Home.tsx`, a new small sheet component under `web/src/features/today/components/`, the merge helper + test.
- Acceptance criteria:
  - `withWeight({ date: '2026-11-12', weight: 80, fatPct: 20, waist: 90 }, '2026-11-12', 79)` returns `{ date: '2026-11-12', weight: 79, fatPct: 20, waist: 90 }`.
  - With no existing record it returns `{ date, weight }` only.
  - Hoy renders "Anotar peso".
- First RED test: the merge above keeps `fatPct` and `waist`.
- Size: S. Risk: item 1 (rewrites an existing stored measurement; a wrong merge would silently drop body-composition data).

### S6 — Pain over time (C9)
Recommended next: the default plan is built around back care, and the pain rule ("más de 5/10 o que se queda al día siguiente, cambia el ejercicio", `pain.ts:1-3`) needs a trend to act on.
Owner: "Registro de dolor a lo largo del tiempo. Una vista que lo muestre por ejercicio y por semana."
- Goal: the user sees recorded pain per exercise, week by week.
- Happy path:
  1. In Progreso › Entrenamientos, the user taps "Ver registro de dolor" (proposed copy).
  2. The screen lists exercises with any recorded pain; each row shows its weeks ("Semana del 16 nov: 4/10 · Baja peso o rango", proposed copy), newest first, with the verdict label and text, never color alone.
  3. An empty state when no pain was recorded: "Todavía no registraste dolor. Aparece aquí cuando lo marques al terminar un ejercicio." (proposed copy).
- Edge cases: several sessions of one exercise in a week; pain values outside 0–10 in old data (`isPainValue`, `pain.ts:17`, and `normalizePain` clamps, `plan.ts:619-626`); exercises from archived routines or deleted custom exercises (name fallback); swapped exercises (pain is keyed by the exercise actually done).
- Assumption: a week is a calendar week, Monday..Sunday, as in Hoy and Hábito.
- Assumption: a week's value is the maximum pain recorded that week (the safety-relevant figure).
- Data: reuses `StrengthSession.pain` (`types.ts:173-175`), `painVerdict`, `isPainValue` (`pain.ts:17,21`), `weekDays` (`week.ts:13`), `exerciseNameInRoutine` (`web/src/lib/planQueries.ts:197`). New pure function (for example `painByExerciseWeek(sessions)`) in `web/src/lib/pain.ts`. No persisted or synced shape change.
- Files likely touched: `web/src/lib/pain.ts` + test, new `web/src/features/progress/routes/PainHistory.tsx` + test, `Train.tsx` (entry point, like `progressFor`).
- Acceptance criteria:
  - Pain 2 and 4 for one exercise in the week of 2026-11-16 give one row with 4 and "Baja peso o rango".
  - Exercises without pain do not appear; the empty state renders with no pain at all.
- First RED test: `painByExerciseWeek` returns `[{ exerciseId, weeks: [{ monday: '2026-11-16', max: 4 }] }]` for that fixture.
- Size: M. Risk: none.

### S7 — Monthly calendar (C6)
Recommended last: Hábito's 12-week grid already answers "did I keep the habit"; the month view adds the discipline split and older history.
Owner: "Calendario o historial por mes. Ver de un vistazo qué días entrenaste, nadaste o caminaste."
- Goal: a month grid shows, per day, whether the user trained, swam or walked.
- Happy path:
  1. In Progreso › Hábito, a "Calendario" card (proposed copy) shows the current month, Monday-first like the 12-week grid.
  2. Each day shows one mark per activity: strength, swim, walk; a legend explains them with text ("Fuerza", "Natación", "Caminata", proposed copy) and each day has an accessible label ("martes 12 de noviembre: fuerza, caminata").
  3. "Mes anterior" / "Mes siguiente" (proposed copy) move between months; the next month is disabled after the current one.
- Edge cases: a day with two activities; unfinished sessions are ignored (`finishedAt == null`); months before the first activity; Assumption: walks are `habitCheckIns` (see S3).
- Data: reuses sessions (`kind`, `date`, `finishedAt`), `Config.habitCheckIns`, the date helpers in `habit.ts:33-43`. New pure function (for example `monthActivity(sessions, checkIns, year, month)`) in `web/src/features/habit/lib/`. No persisted or synced shape change.
- Files likely touched: new `web/src/features/habit/lib/month.ts` + test, new `web/src/features/habit/components/MonthCalendar.tsx`, `Habit.tsx`, `habit.css`.
- Acceptance criteria:
  - For November 2026 with a strength session on the 10th, a swim and a check-in on the 12th, `monthActivity` returns `{ '2026-11-10': ['strength'], '2026-11-12': ['swim', 'walk'] }`.
  - The rendered calendar contains the three legend labels and the accessible day label.
- First RED test: the `monthActivity` fixture above.
- Size: M. Risk: none.

### S8 — Rest-wildcard hint on Hoy (C8, decision D7-B)
- Owner's line: "Reprogramar un día. Mover el entrenamiento de hoy a mañana sin perder la racha, usando los comodines de descanso." Owner's decision: "Sí, una línea en Hoy (Recomendada)".
- Goal: make the existing flexible-week behavior discoverable; no behavior or data change.
- Happy path: while rest wildcards remain this week and today's routine is not done, Hoy's hero shows one informational line, proposed copy: "¿Hoy no puedes? Descansa: usas un comodín y mañana sigue {rutina}." where {rutina} is the routine Hoy suggests today.
- Edge cases: no wildcards left → no line; today already trained or a rest day → no line; block ended → no line.
- Data: reuses the wildcard count and suggested routine Hoy already computes (`web/src/features/habit/lib/week.ts:46-60`, `Home.tsx:341-347`); nothing stored or synced.
- Files likely touched: `web/src/features/today/routes/Home.tsx`, a pure helper in `web/src/features/habit/lib/week.ts` (or beside it), its test.
- Acceptance: with wildcards left and an untrained training day, the rendered Hoy contains the line with the suggested routine's name; with zero wildcards it does not.
- First RED test: the pure helper returns the hint for (wildcards 2, not trained, routine "Tren inferior A") and null for wildcards 0.
- Size: S. Risk: none.

- S9 — S5 amendment (owner decision L8): "Prellenar al editar (Recomendada)": when "Nueva medición" is opened for a date that already has a measurement, the form is prefilled with that date's stored values; what is on screen is what is saved, so emptying a field removes it, and a weight-only save from Hoy (QuickWeight) still merges and never removes fields. Acceptance: for a stored `{date, weight: 80, fatPct: 20, waist: 90}`, opening the form on that date shows 80, 20 and 90; clearing waist and saving stores `{date, weight: 80, fatPct: 20}` and queues that body; QuickWeight with 79 on the same date stores `{date, weight: 79, fatPct: 20, waist: 90}`.

## Decisions
All seven were answered by the owner on 2026-11-13 (Log L3-L4): D1 A, D2 A, D3 A, D4 A, D5 A, D6 A, D7 B. The options are kept below for context.

- **D1 — How "sugerir la carga de hoy" is computed (S1).** A: derived from existing data, no shape change: last weight + 2.5 kg when double progression was met (`shouldProgress`), half the last weight when the phase load note says "la mitad de peso" (the only weight change in both templates, `defaultPlan.ts:180,346`; phases are read-only in the editor), otherwise the last weight. B: add an optional structured `loadFactor` to `Phase` in the synced plan document (`normalizePlan`'s `readPhase` must keep it, `web/src/lib/planStorage.ts:120-126`; older clients drop it when they rewrite the plan; stored plans lack it until reset). **Recommendation: A**, with the text match isolated in one function so B can replace it later.
- **D2 — Does the suggestion fill the weight (S1).** A: the stepper prefills the suggested weight and "Completar serie"/"Completar ejercicio" log it when nothing was typed (what is on screen is what gets saved). B: show it as a hint only; the stepper keeps today's prefill of the last weight. **Recommendation: A**; B leaves the screen saying one load and logging another.
- **D3 — What counts as a "récord" (S2, S4).** A: best weight = heaviest weight in any done set; best volume = highest weight × reps summed over one session for that exercise (the figure the "Volumen del ejercicio" chart already plots, `ExerciseProgress.tsx:73-83`). B: estimated one-rep max (Epley) plus best single-set volume. **Recommendation: A**: matches what the app already shows and needs no formula explanation.
- **D4 — "Comparación con la sesión anterior" against what (S2).** A: the previous finished session of the same routine (totals: volume, sets, duration). B: per exercise, the last time each exercise was done in any routine. **Recommendation: A**; S1 already gives the per-exercise view during the session.
- **D5 — Where the weekly summary lives (S3).** A: a section in Progreso › Hábito with "Semana anterior" navigation (no stored state). B: a card on Hoy at the start of each week until dismissed (dismissal in localStorage, per device). **Recommendation: A**.
- **D6 — "Cómo vas respecto al bloque" (S3).** A: block week and phase goal plus strength volume against the block's week 1 (generalizing `weekVolumes`, `blockEnd.ts:12`). B: adherence: weeks that met the target over weeks elapsed in the block. **Recommendation: A**.
- **D7 — Candidate 8, an explicit "move" action.** The outcome already happens on its own (C8). A: no change; close the candidate. B: an informational line on Hoy's hero, no stored data, for example "¿Hoy no puedes? Descansa: usas un comodín y mañana sigue Tren inferior A." (proposed copy), shown only while wildcards remain. **Recommendation: B** (size S, risk none) because the owner did not find the behavior, which points to discoverability; not specified until chosen.

## Tasks
Suggested routes: inline unless a writer reason holds. T1 and T3 have disjoint surfaces (`session/*` vs `habit/*`) and could run as parallel writers if launched together.

- [x] T1 — S1 (+ back-dated sessions ordered by their date for "la vez pasada", L5). Unit U1, branch `feat/suggested-load`. Route: delegated (Sonnet, high), parallel writer.
- [x] T2 — S4 record detection (`web/src/lib/records.ts`) and its ExerciseProgress/toast use. Unit U2 with T3, branch `feat/records-summary`. Route: delegated (Opus, high), parallel writer; built before T3 in the same unit.
- [x] T3 — S2. Unit U2 (after T2).
- [x] T4 — S3. Unit U3 with T8 (shared `habit/lib/week.ts`), branch `feat/weekly-review`. Route: delegated (Sonnet, medium), parallel writer.
- [x] T5 — S5. Unit U4, branch `feat/quick-weight`. Route: delegated (Sonnet, high), parallel writer. Risk item 1: independent verifier after its checks.
- [x] T6 — S6. Unit U5, branch `feat/pain-history`, commit 6433bea (RED 4 failures → GREEN; typecheck clean; 654/654; parent spot check pain+progress 19/19; Risk: none; session-detail pain display not pinned: internal state unreachable without a DOM). Route: delegated (Sonnet, medium), parallel writer.
- [x] T7 — S7. Unit U6, branch `feat/month-calendar`, commit 3062928 (RED → GREEN incl. locale-comma label; typecheck clean; 657/657; parent spot check habit 60/60; Risk: none; adds `--fp-swim` token in `styles.css`). Route: delegated (Sonnet, medium), parallel writer. Shares the walk assumption with T4.
- [x] T8 — S8. Unit U3 (with T4).
- [ ] T10 — S9 (form prefill) and the read-modify-write of a measurement in one IndexedDB transaction (U4 verifier advisory). Done inside T9.
- [ ] T9 — integration of U1-U6 on `feat/daily-use-flows` (Opus, high), then one feature-end verifier (Opus, high).

## Log
- L1 — 2026-11-13, owner: "Si, delega a opus para que lo haga y arme los specs en relacion a eso". Candidate flows, verbatim:
  1. "Referencia de la sesión anterior en cada serie. Mostrar "la vez pasada: 60 kg × 10" junto a la serie y sugerir la carga de hoy según la fase."
  2. "Resumen al terminar. Hoy la sesión se guarda y listo. Falta una pantalla de cierre con volumen total, récords del día, comparación con la sesión anterior y la racha."
  3. "Sustituir un ejercicio solo por hoy. Si la máquina está ocupada, cambiarlo en la sesión sin modificar el plan."
  4. "Resumen semanal. Una vista de la semana cerrada: entrenamientos hechos contra planeados, volumen, caminatas y cómo vas respecto al bloque."
  5. "Récords personales por ejercicio. Mejor peso y mejor volumen, con aviso cuando rompes uno."
  6. "Calendario o historial por mes. Ver de un vistazo qué días entrenaste, nadaste o caminaste."
  7. "Registro rápido de peso. Un acceso de un toque para anotar solo el peso."
  8. "Reprogramar un día. Mover el entrenamiento de hoy a mañana sin perder la racha, usando los comodines de descanso."
  9. "Registro de dolor a lo largo del tiempo. Una vista que lo muestre por ejercicio y por semana."
  Owner's priority: 1 and 2 first, then 4.
- L2 — 2026-11-12, audit evidence (read-only, no `.codegraph/` index, bounded reads of `features/session`, `today`, `progress`, `habit`, `lib`). Candidate 3 exists in full (session-only `swaps` plus "Guardar en el plan"); candidate 8 exists by design (flexible week, automatic rest wildcards, never-miss-twice streak). Candidates 1, 4, 5, 6, 7 and 9 are partial; 2 is missing. Findings beyond the candidates: ExerciseProgress's "Mejor serie" tile shows the latest session, not the best (`ExerciseProgress.tsx:61,111`); measurements are saved with a whole-record `put` by date, so a weight-only save on a date with a full measurement drops its other fields (`db.ts:164`); in week 7 the stepper prefills the full previous weight under a "la mitad de peso" line; back-dated sessions get `startedAt = Date.now()`, so `lastPerformance` treats them as the latest; no unit test covers `completionPatch`, `lastPerformance` or `shouldProgress`; `weeklySummary`, `weeklyVolume` and `weeklyCount` in `disciplines.ts` have no production caller. No spec needs a synced `Config`, `Session` or plan shape change unless D1-B is chosen.
- L3 — 2026-11-13, owner decision on D1: "Con los datos actuales (Recomendada)" → option A (no shape change; the phase-text match isolated in one function).
- L4 — 2026-11-13, owner decisions: D2 "Sí, prellena la sugerida (Recomendada)" (A); D3 "Mejor peso y mejor volumen (Recomendada)" (A); D4 "Misma rutina, vez anterior (Recomendada)" (A); D5 "Sección en Hábito (Recomendada)" (A); D6 "Fase y volumen vs semana 1 (Recomendada)" (A); D7 "Sí, una línea en Hoy (Recomendada)" (B) → S8 and T8 added by the parent. Implementation is still not authorized.
- L5 — 2026-11-13, owner: "Vamos con todos.en paralelo, siguiendo el.flujo odd y cambiando de modelo y effort acorde a las necesidades". Routing: Writer trigger (a), six independent units with overlapping files (`Home.tsx`, `Habit.tsx`, `Train.tsx`, `StrengthBody.tsx`), so each runs in an isolated worktree and is integrated afterwards. Assumption (parent): the back-dated `startedAt` defect found by the audit (L2) is fixed inside T1, because it decides what S1 shows as "la vez pasada".
- L6 — 2026-11-13, unit results: U5 6433bea (S6), U6 3062928 (S7), U3 57e08bf (S3) + de561c9 (S8); each with RED → GREEN, typecheck clean and full suite green in its worktree; parent spot checks pain+progress 19/19, habit 60/60, habit+today 76/76. U3 assumptions: archived routines use the current rotation for the target; a walk check-in today also hides the rest hint (the day already counts as kept). Home.tsx has no render test (needs the store); S8 acceptance is pinned on the pure `restHint` helper.
- L7 — 2026-11-13, U1 (S1) defb54c pins, ecfd5e8 back-dated order fix, 18ebfac `suggestLoad`, 926d096 set card + prefill; RED → GREEN per rule; 686/686; differential: no change for same-day sessions, intended change only for back-dated ones; parent spot check lib+session 341/341; Risk: none. Open: ExerciseProgress, SwimProgress and `db.ts` still order by `startedAt`; StrengthBody computes the block week from `startedAt` for back-dated sessions; half weight rounds to the nearest 2.5 kg (assumption). U4 (S5) 83f1682 measurement merge (own commit), 3808e83 QuickWeight; RED → GREEN; 674/674; parent spot check db+today+progress 59/59; Risk: item 1, independent verifier running. Open product point: blank fields in "Nueva medición" no longer clear a stored value; there is no way to remove one field.
- L8 — 2026-11-13, owner decision on the measurement form: "Prellenar al editar (Recomendada)" → S9 added. U4 independent verifier: S5 PASS, no blockers (weight-only save keeps every field in IndexedDB and in the outbox; every other `saveMeasurement` caller byte-identical to base; two-device sync converges with no outbox loop). Advisories: `withWeight` is named `db.mergeMeasurement`; read-then-put in separate transactions can lose a remote edit applied in between (reproduced; loses strictly less than base) → fixed in T10; `parseWeight` has no upper bound.
- L9 — 2026-11-13, U2 (S4, S2) 580708b records + in-session notice, 69e4ffe closing summary; RED → GREEN; 684/684; finish-flow differential byte-identical; parent spot check records+session+progress 49/49; Risk: none. Assumptions: a minimal session is never a comparison baseline; the duration delta is not shown (S2 copy has only volume and sets). Integration also aligns the remaining back-dated orderings found by U1 (ExerciseProgress, SwimProgress, `db.ts` list, StrengthBody block week by session date), since S1 and S4 already order by session date.
