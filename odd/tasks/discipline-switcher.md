# Discipline switcher (spec 2026-11-13)
Objective: a Duolingo-style discipline selector that scopes Hoy, Entrenar, Progreso and Perfil to the selected discipline, turns Perfil into a per-discipline metrics summary and moves the technical configuration to a separate Ajustes screen. Branch: `feat/discipline-switcher`. Runners: `cd web && pnpm typecheck && pnpm test` (Vitest in node, `renderToString`, no DOM).
Status: authorized (L6); D1-D11 closed with option A. Delivery: integration branch `integration/discipline-switcher` and one PR, as in the two previous deliveries (L7); the forecast (~1,940 authored changed lines) exceeds the 400-line budget and is recorded as a size exception in the PR. No push or merge without the owner.

## Current state (audit)
Evidence read at origin/main 929cd5f. "Gimnasio" below means `SessionKind` `'strength'` (label "Fuerza", `web/src/lib/disciplines.ts:199-200`); "Natación" means `'swim'` (`disciplines.ts:211-212`). The catalog is closed: `SessionKind = 'strength' | 'swim'` (`web/src/lib/types.ts:152`).

How the pieces work today:
- **Tabs.** Hoy, Plan, Progreso, Perfil (`web/src/app/App.tsx:23,26-31`). There is no "Entrenar" tab: "Entrenar" is the h1 of the session screen inside Progreso › Entrenamientos (`web/src/features/session/routes/Train.tsx:213`, mounted at `App.tsx:132-134`). Perfil renders `<Settings />` (`App.tsx:138`); the sync chip and Hoy's avatar both open Perfil (`App.tsx:92`, `web/src/features/today/routes/Home.tsx:221`).
- **Plan per discipline.** Gimnasio has a full plan: `TrainingPlan` with routines, phases, block weeks and a week template (`types.ts:124-136`), edited in the Plan tab ("Tu plan", `web/src/features/plan/routes/PlanEditor.tsx:178`), which has no swimming at all. Natación has no plan: a swim session is free blocks created from `Config.poolLengthM` (`disciplines.ts:83-95`), started from a single card in Train (`Train.tsx:265-282`). `Config.weeklyRoutine` can still tag weekdays `'swim'` or `'walk'` (legacy week, `web/src/lib/plan.ts:141-149`), but no screen shows it; only reminders and a fallback read it (`web/src/features/reminders/lib/scheduler.ts:39`, `web/src/features/habit/lib/habit.ts:66`).
- **Walks are a habit, not a discipline.** `DayKind` has `'walk'` (`types.ts:253`) but it maps to no session kind (`SESSION_KIND_FOR_DAY.walk = null`, `plan.ts:44-50`). A walk is only a date in `Config.habitCheckIns` (`types.ts:305-307`), written by "Marcar caminata hecha" on Hoy (`Home.tsx:344-345`, `toggleCheckIn` at `habit.ts:134-138`).
- **Streak is global across disciplines and walks.** A day is kept by any finished session of any kind or a check-in (`finishedDates` and `dayStatus`, `habit.ts:45-46,56`); `votes` counts every finished session plus check-ins (`habit.ts:120-124`).
- **Weekly target and rest wildcards come from the gym plan only.** Target = active gym routines (`weeklyTarget`, `web/src/features/habit/lib/week.ts:28-30`), done = distinct gym routines finished this week (`week.ts:38-45`), wildcards = 7 − target (`week.ts:33-35`). But a swim day counts as an active day, so it spends no wildcard (`weekSummary`, `week.ts:67`).
- **Config sync.** Config is one synced document. `mergeConfig` builds a fixed object from defaults on every read and drops unknown keys (`plan.ts:571-584`); the flat-field rule exists because of the nested-field defect of 53590ef (`types.ts:299-302`). The three-way merge treats every key it does not know as a deep-equal scalar (`web/src/features/sync/lib/configMerge.ts:45-50,181-187`) and labels conflicts from `SCALAR_LABELS` (`configMerge.ts:52-56`). The API stores the body as opaque JSON, up to 256 KiB (`api/internal/domain/sync/sync.go:22,49`; document kinds `plan` and `config` only, `api/openapi.yaml:242-244`).

Every place where disciplines are mixed today:
1. Perfil is titled "Ajustes" and mixes account, sync, backup, height, block dates, "Largo de la piscina (m)", body goals and the danger zone; its only figures are counts of sessions and measurements (`web/src/features/account/routes/Settings.tsx:222,225,228,243-244,272-300,310,330`).
2. Hoy's streak and "N entrenamientos" votes count swims and walks (`Home.tsx:83-85,239-249`), while its routine hero, "Esta semana", "Sesiones N / M" and the volume sparkline are gym only (`Home.tsx:97-99,129-135,466-490`); "finished today" counts any discipline (`Home.tsx:120`) next to a gym-only `strengthDoneToday` (`Home.tsx:121`). Nothing on Hoy starts a swim.
3. Hoy's rest wildcards are derived from the gym target but spent only on days with no session of any kind (`week.ts:63-70`, shown at `Home.tsx:210-212`).
4. Entrenar (Train) shows the gym phase card, gym routines, the Natación card with the pool length, the pain log, and one history list that mixes both kinds (`Train.tsx:215-224,230-262,265-282,284-286,290-302`).
5. Progreso › Hábito: streak, best streak, consistency and the 12-week grid count every discipline (`web/src/features/habit/routes/Habit.tsx:43-47`), the grid legend says "Entrenado" for any session (`Habit.tsx:123-125`), "Esta semana N de M" is gym only (`Habit.tsx:141-144`).
6. Hábito's closed-week review mixes gym routines and volume with walks (`web/src/features/habit/components/WeekReview.tsx:61-72`, `closedWeekSummary` at `week.ts:101-113`).
7. Hábito's month calendar marks strength, swim and walk on the same grid (`web/src/features/habit/lib/month.ts:33-35`, `web/src/features/habit/components/MonthCalendar.tsx:5-6`, mounted at `Habit.tsx:131`).
8. The gym closing summary's "Racha" counts swims and walks (`web/src/features/session/lib/summary.ts:55`).
9. Progression is split correctly but both are reached from the same mixed Train list: ExerciseProgress is gym only (`web/src/features/progress/routes/ExerciseProgress.tsx:53`), SwimProgress swim only (`web/src/features/progress/routes/SwimProgress.tsx:22`).
10. Onboarding asks nothing about disciplines: steps welcome, profile, measures, block, template (`web/src/features/onboarding/lib/onboarding.ts:21-27`); every template is a gym plan (`web/src/lib/defaultPlan.ts:190-198`), and the pool length is fixed at 25 m (`plan.ts:250`).
11. `weeklyCount`, `weeklyVolume`, `weeklySetCount` and `weeklySummary` (`disciplines.ts:280-352`) have no production caller (same finding as daily-use-flows L2); they are not the base for this feature.

## Specs
UI copy is Spanish and marked "proposed copy". Every quoted owner line is verbatim from the Log. Specs follow option A of each decision unless a spec says otherwise; a different answer rewrites only the affected spec.

Assumptions shared by every spec:
- A1: the selector names the disciplines "Gimnasio" and "Natación" (the owner's word is "gimnasio", L1). The existing "Fuerza" label stays only where both kinds still appear together (backups, legacy texts).
- A2: the owner's "Hoy, Entrenar, Progreso y Perfil" (L3) means the four tabs, with "Entrenar" covering the Plan tab and the Train screen (see D9). Tab names do not change.
- A3: no new `SessionKind` is created; the catalog is `Object.keys(DISCIPLINES)`. A third discipline (running, cycling) is out of scope: it changes the synced session contract.
- A4: weekday intentions ("Tu plan de acción", `Habit.tsx:151`) and reminders stay global and are shown under every discipline; they say when and where you train, not what.

### S1 — Your disciplines and the selected one (data)
Owner: "Quiero algo cómo la visual de duolingo donde puedes seleccionar el lenguaje, pero en nuestro caso vamos a seleccionar la disciplina que vamos a entrenar "
- Goal: the app knows the user's list of disciplines and which one is selected, and every screen reads both from one place.
- Model: the list is an ordered, unique, non-empty subset of the catalog; the selected discipline is a member of the list.
- Storage (D3-A): the list is a new flat Config field `disciplines` (array of `SessionKind`). It is optional in every stored and synced body (absent in all existing configs and from older clients) and `mergeConfig` fills it with the D2 default on every read, like `poolLengthM` (`plan.ts:579`). The selected discipline is per device, in localStorage, read and written inside try/catch; a missing, invalid or unreadable value resolves to the first of the list.
- Default (D2-A): Gimnasio is selected; the list is `['strength']`, plus `'swim'` when the user has at least one swim session. New installs get `['strength']`.
- Helpers: pure `disciplineList(config)` / `defaultDisciplines(sessions)` and `resolveActive(stored, list)` in a new `web/src/lib/disciplineSelection.ts`; a hook (for example `useDiscipline()`) exposing `{ active, list, select, add, hide }`; `add` and `hide` save Config through the existing `saveConfig` path (`web/src/lib/store.tsx`), never a parallel write.
- Edge cases: the selected discipline was hidden on another device → first of the list; a synced list with duplicates, unknown ids (from a newer client) or nothing valid → deduplicated, filtered, or the default; a device on an older build that saves any config drops the field (`plan.ts:571-584`), so the next read falls back to the default (D2-A rebuilds it from data, so at worst a hidden discipline reappears); a conflicting edit on two devices is a scalar conflict with the proposed label "Tus disciplinas" in `SCALAR_LABELS` (`configMerge.ts:52-56`), not the raw key; "Borrar dispositivo" and the local erase also remove the localStorage key (`web/src/features/sync/lib/erase.ts:18-29`, `web/src/features/account/lib/eraseDevice.ts`).
- Acceptance criteria:
  - `mergeConfig({})` contains `disciplines: ['strength']`; `mergeConfig` of today's stored `DEFAULT_CONFIG` (no `disciplines`) returns every other field byte-identical to today's result.
  - `mergeConfig({ disciplines: ['swim', 'swim', 'running'] })` returns `['swim']`; `mergeConfig({ disciplines: [] })` returns the default.
  - `resolveActive('swim', ['strength'])` is `'strength'`; `resolveActive(null, ['swim', 'strength'])` is `'swim'`; a localStorage that throws resolves to the first of the list.
  - A config pushed with `disciplines` round-trips through the outbox body and a backup v3 export/import unchanged.
- First RED test: `mergeConfig({}).disciplines` equals `['strength']`.
- Size: S. Risk: item 1 (new field in the persisted, synced Config) and item 3 (the config document is consumed by older clients that drop it).

### S2 — Duolingo-style selector
Owner: "Quiero algo cómo la visual de duolingo donde puedes seleccionar el lenguaje, pero en nuestro caso vamos a seleccionar la disciplina que vamos a entrenar "
- Goal: like Duolingo's course flag, the selected discipline is always visible and one tap switches it.
- Placement (D1-A): a chip at the top of Hoy, Plan, Progreso and Perfil showing the discipline's icon and name (proposed copy "Gimnasio", "Natación"; Hoy reuses its `swim` icon and a dumbbell, `Home.tsx:27,33`).
- Happy path:
  1. The user taps the chip (accessible name, proposed copy: "Disciplina: Gimnasio. Cambiar").
  2. A bottom sheet "Tus disciplinas" (proposed copy) lists the user's disciplines, each with icon, name and its current streak ("Racha: 12 días", proposed copy); the selected one is marked and announced ("seleccionada").
  3. Tapping another discipline selects it, closes the sheet and every tab re-renders for it; the current tab stays open.
  4. Below the list: "Agregar disciplina" (S3).
- Edge cases: only one discipline in the list (the chip still opens the sheet, which offers "Agregar disciplina"); a workout in progress (the draft reopens in Progreso › Entrenamientos, `App.tsx:50-51`; Assumption: switching is allowed and the active session keeps its own kind, since `ActiveSession` switches on `session.kind`, `web/src/features/session/routes/ActiveSession.tsx:16-23`); the guide screen (`App.tsx:97-98`) shows no chip.
- Data: S1's hook only. No stored state beyond S1.
- Files likely touched: new `web/src/components/DisciplineSwitcher.tsx` (+ test), headers of `Home.tsx`, `PlanEditor.tsx`, `App.tsx` (Progreso header), Perfil (S8).
- Acceptance criteria:
  - `renderToString(<DisciplineSwitcher …/>)` with list `['strength', 'swim']` and active `'strength'` contains "Gimnasio", the accessible name "Disciplina: Gimnasio. Cambiar", and in the open sheet "Tus disciplinas", "Natación" and "Agregar disciplina".
  - Selecting `'swim'` calls `select('swim')` once and stores it per device; Config is not saved (D3-A).
- First RED test: the render above contains "Disciplina: Gimnasio. Cambiar".
- Size: M. Risk: none.

### S3 — Add (and hide) a discipline
- Goal: the list holds the disciplines the user trains; the user can add one (and, per D7, hide one).
- Happy path:
  1. "Agregar disciplina" opens the catalog entries not in the list (today only Gimnasio or Natación); with nothing left the button is hidden.
  2. Picking one appends it to the list (synced, S1) and selects it. Proposed copy for the toast: "Natación agregada".
  3. (D7-A) In the sheet, each discipline has "Quitar de mi lista" (proposed copy), behind a confirmation: "Tus sesiones de natación se conservan. Puedes volver a agregarla." (proposed copy). Hiding removes it from the list only; no session, measurement or plan is deleted.
- Edge cases: the last discipline cannot be hidden (the action is absent); hiding the selected one selects the first remaining; adding Natación for the first time shows the pool length prompt only if the user never set one (Assumption: no prompt; the default 25 m stays editable in Ajustes, S9).
- Data: S1's `add` / `hide`, through `saveConfig`.
- Files likely touched: `DisciplineSwitcher.tsx` (+ test), `disciplineSelection.ts` (+ test).
- Acceptance criteria: `addDiscipline(['strength'], 'swim')` returns `['strength', 'swim']`; adding an existing one returns the list unchanged; `hideDiscipline(['strength'], 'strength')` returns `['strength']`; hiding never touches sessions (the session store is byte-identical before and after).
- First RED test: `addDiscipline(['strength'], 'swim')`.
- Size: S. Risk: none (the persisted part is S1's).

### S4 — Per-discipline habit rules (domain)
Owner's decision: "Toda la app (Recomendada)" with the description "Igual que Duolingo con el idioma: Hoy, Entrenar, Progreso y Perfil muestran solo la disciplina elegida, con sus métricas, su racha y su plan. Así no se mezclan conceptos en ninguna pantalla."
- Goal: streak, best streak, consistency, votes, weekly target and rest wildcards are computed for one discipline (D5-A), so no screen mixes them.
- Rules (D5-A, D4-A, D10-A):
  - A day is kept for a discipline by a finished session of that kind; walk check-ins keep the day for Gimnasio only (D4-A).
  - Gimnasio's weekly target and wildcards stay exactly as today (`week.ts:28-35`); a swim no longer keeps a Gimnasio day, so a swim-only day now spends a Gimnasio wildcard (today it spends none).
  - Natación's weekly target is `swimWeeklyTarget` (D10-A), its wildcards are 7 − target, and "done" is the number of distinct days with a finished swim this week.
  - The never-miss-twice rule and the wildcard walk (`habit.ts:54-77,100-115`) are reused unchanged, fed with the discipline's sessions and allowance.
- Data: `HabitContext` (`habit.ts:9-18`) gets the discipline's sessions and allowance from one helper (for example `habitContextFor(kind, sessions, config, plan, today)`) instead of every screen building it (`Home.tsx:82-83`, `Habit.tsx:43`, `summary.ts:55`). `weekSummary` / `closedWeekSummary` take the discipline. Reuses `finishedIn` (`disciplines.ts:257-268`) as the only kind filter.
- Edge cases: a day with a gym session and a swim keeps both streaks; a user who never swam sees Natación's streak start at its first swim ("none" before it, `habit.ts:57-58`); a walk on a swim-only day keeps only Gimnasio.
- Observable change (intended by L3, pinned as such): for a user with swim sessions, Gimnasio's streak, votes and wildcards stop counting swim days.
- Acceptance criteria:
  - For data with gym sessions and check-ins only, Gimnasio's `streak`, `bestStreak`, `consistency`, `votes` and `weekSummary` equal today's results (differential against base).
  - A swim on Tuesday with no gym session that day: Gimnasio counts Tuesday as a wildcard or a miss; Natación counts it as kept.
  - With `swimWeeklyTarget: 2` and swims on Monday and Thursday, Natación's week is `{ done: 2, target: 2, restAllowance: 5 }`.
- First RED test: Gimnasio's `dayStatus` for a swim-only Tuesday is `'rest'` (today it is `'kept'`).
- Size: M. Risk: none (derived values; existing results pinned by the differential).

### S5 — Hoy for the selected discipline
- Goal: Hoy shows only the selected discipline: its next session, its streak, its week.
- Gimnasio: today's Hoy (routine hero, week strip, "Rutinas de la semana", stats, rest hint, QuickWeight), with S4's Gimnasio numbers; "Marcar caminata hecha" stays (D4-A).
- Natación:
  1. Hero: "Natación" with "Piscina de 25 m" and the primary button "Nadar" (proposed copy; same labels as Train, `Train.tsx:269-277`), which starts a swim session and opens it like `startRoutine` does for gym (`App.tsx:61-66`).
  2. Streak and votes of Natación (S4); votes copy "N sesiones de natación" (proposed copy) instead of "entrenamientos".
  3. "Esta semana: 1 de 2" (proposed copy) and, instead of volume, "Distancia: 1.500 m" for the calendar week with the last 5 weeks' bars.
  4. Last swim line: "Última sesión: 1.500 m · 2:05 /100 m" (proposed copy, `swimSessionPaceSecPer100m`, `disciplines.ts:163`); none before the first swim.
- No session planned today (D8-A): Natación has no plan, so the hero always offers "Nadar"; when the week's target is met it shows "Semana cumplida. Puedes nadar igual." (proposed copy) with the same button. Gimnasio keeps "Semana completa" (`Home.tsx:326-327`).
- Edge cases: a swim already finished today ("Ya nadaste hoy", proposed copy, plus the session's distance); block ended (BlockEndCard is gym only, `Home.tsx:227-233`, hidden under Natación); the rest hint (`restHint`) uses the selected discipline's wildcards.
- Data: S4's helpers, `swimDistance`, `finishedIn`. Pure helper for the Natación hero (for example `swimToday(sessions, config, today)`) so the acceptance does not need a Home render test (Home has none, daily-use-flows L6).
- Files likely touched: `Home.tsx`, new `web/src/features/today/components/SwimToday.tsx` and `web/src/features/today/lib/swimToday.ts` (+ tests), `App.tsx` (start a swim from Hoy).
- Acceptance criteria:
  - `swimToday` with swims of 1,500 m on Monday and 1,000 m on Wednesday (target 2) returns done 2, target 2, distance 2500 and the "Semana cumplida" state.
  - `renderToString(<SwimToday …/>)` contains "Nadar", "Piscina de 25 m" and "Esta semana: 1 de 2" for one swim.
  - Under Gimnasio, Hoy's numbers equal today's for gym-only data (S4 differential).
- First RED test: the `swimToday` fixture above.
- Size: M. Risk: item 6 (Home has no render test; acceptance is pinned on the pure helper and the new component).

### S6 — Entrenar (Train screen and Plan tab) for the selected discipline
- Goal: starting, planning and history show only the selected discipline (D9-A).
- Train (Progreso › Entrenamientos):
  - Gimnasio: the phase card, the routines with "Entrenar" and "Ver progresión", "Ver registro de dolor", and a history of gym sessions only.
  - Natación: the "Natación" card with "Nadar" and "Ver progresión" (SwimProgress), and a history of swim sessions only. No phase card, no pain log.
  - Empty history copy per discipline (proposed copy): "Cuando termines la primera, aquí vas a ver series y peso de cada sesión." / "Cuando termines la primera, aquí vas a ver largos y tiempo de cada sesión." (splits `Train.tsx:293`).
- Plan tab:
  - Gimnasio: today's PlanEditor unchanged.
  - Natación (D10-A): "Tu plan de natación" (proposed copy) with "Sesiones por semana" (stepper 1–7, `swimWeeklyTarget`) and "Largo de la piscina (m)" (also editable in Ajustes, S9, same field and validation `v > 0`, `Settings.tsx:294-300`).
- Edge cases: editing a past session opens it regardless of the selected discipline (it is reached from that discipline's history); archived gym routines with sessions stay under Gimnasio (`Train.tsx:55`); an active draft of the other discipline still reopens (S2 edge case).
- Data: `swimWeeklyTarget` is a new flat Config field, optional in stored bodies, default 2 (Assumption: the legacy week has two swim days, `plan.ts:144,146`), merged by `mergeConfig`, labelled "Sesiones de natación por semana" in `SCALAR_LABELS` (proposed copy). Same rules and risk as S1.
- Files likely touched: `Train.tsx` (+ `Train.test.tsx`), `PlanEditor.tsx`, new `web/src/features/plan/components/SwimPlan.tsx` (+ test), `web/src/lib/types.ts`, `web/src/lib/plan.ts`, `configMerge.ts`.
- Acceptance criteria:
  - With one gym and one swim session, Train under Gimnasio renders the gym history line and not "m"; under Natación it renders the swim distance and no "Entrenar" routine button.
  - `mergeConfig({}).swimWeeklyTarget` is 2; values outside 1–7 or non-numbers fall back to 2.
  - `renderToString(<SwimPlan …/>)` contains "Sesiones por semana" and "Largo de la piscina (m)".
- First RED test: Train under Natación does not contain "Ver registro de dolor".
- Size: M. Risk: item 1 (new field in the persisted, synced Config).

### S7 — Progreso for the selected discipline
- Goal: Hábito and its review and calendar show one discipline.
- Hábito: hero streak, best streak, consistency, the 12-week grid and votes from S4 for the selected discipline; legend (proposed copy) "Nadado" under Natación, "Entrenado" and "Caminata" under Gimnasio (replaces "Hecho" for check-ins, `Habit.tsx:125`; Assumption). "Esta semana N de M" uses the discipline's target.
- WeekReview: Gimnasio unchanged ("Entrenamientos", "Volumen", "Caminatas", "Bloque"); Natación (proposed copy): "Sesiones: 2 de 2", "Distancia: 3.000 m · +10 % frente a la semana anterior", no block line.
- MonthCalendar: only the selected discipline's mark, plus walks under Gimnasio (D4-A); the legend lists only those.
- Medidas: unchanged under both disciplines (Assumption: body measurements are not a discipline; D6 decides only whether Perfil shows them).
- Data: S4's helpers; `monthActivity` (`month.ts:21-40`) and `closedWeekSummary` take the discipline.
- Files likely touched: `Habit.tsx`, `WeekReview.tsx`, `MonthCalendar.tsx`, `month.ts`, `week.ts` (+ tests).
- Acceptance criteria:
  - `monthActivity` for November 2026 with a gym session on the 10th, a swim and a check-in on the 12th returns `{ '2026-11-10': ['strength'], '2026-11-12': ['walk'] }` for Gimnasio and `{ '2026-11-12': ['swim'] }` for Natación.
  - The Natación review contains "Sesiones: 2 de 2" and "Distancia" and no "Volumen" or "Bloque".
  - Gimnasio's review and calendar for gym-only data equal today's (differential).
- First RED test: the `monthActivity` fixture for Natación.
- Size: M. Risk: none.

### S8 — Perfil as a per-discipline metrics summary
Owner: "En la pantalla de profile siento que debemos mejorarla para que ahí muestre metricas de interes para el usuario  y no mezclar conceptos, es una app para gimnasio (por ahora) y estamos metiendo temas de natación"
- Goal: Perfil shows the metrics that matter for the selected discipline; no settings (they move to Ajustes, S9).
- Layout: the S2 chip, title "Tu progreso en gimnasio" / "Tu progreso en natación" (proposed copy), a gear button "Ajustes" (D11-A), then the blocks below. Each block has an empty state.
- Gimnasio (D6-A), proposed copy:
  1. "Racha": current and best (S4), e.g. "12 días · mejor: 30".
  2. "Este bloque": "Semana 5 de 12" and "Entrenamientos: 18 de 25" (finished gym sessions in the block against weeks elapsed × weekly target).
  3. "Volumen por semana": one bar per block week, current highlighted, with "+12 % frente a la semana 1" (`blockWeekVolume`, `weekVolumes`, `web/src/features/today/lib/blockEnd.ts:12,19`).
  4. "Récords personales": the 5 most recent best-weight records, "Prensa: 80 kg × 8" (`personalRecords`, `web/src/lib/records.ts:48`); "Ver todos" opens Progreso › Entrenamientos.
  5. "Cuerpo frente a tus metas": latest weight, fat mass, muscle and waist with goal and progress, reusing Measure's tiles and `progressPct` (`web/src/features/progress/routes/Measure.tsx:72-85`); "Anotar medición" opens Medidas.
- Natación (D6-A), proposed copy:
  1. "Racha": current and best (S4).
  2. "Esta semana": "Sesiones: 1 de 2" and "Distancia: 1.500 m".
  3. "Últimas 4 semanas": total distance and sessions, with one bar per week (Assumption: 4 calendar weeks, since Natación has no block).
  4. "Mejor ritmo": the lowest session pace, "1:58 /100 m" (`swimSessionPaceSecPer100m`, `disciplines.ts:163`), and "Velocidad media" over the 4 weeks (`swimSessionSpeedMPerMin`, `disciplines.ts:175`).
  5. "Sesión más larga": the largest `swimDistance` with its date.
  6. "Distancia total" since the first swim (same figure as SwimProgress, `SwimProgress.tsx:67`).
- Edge cases: no sessions of the discipline (one empty state per block, e.g. "Todavía no nadaste. Tu progreso aparece aquí después de tu primera sesión.", proposed copy); no measurement or no goal set (the body block shows "Define tus metas en Ajustes", proposed copy); unfinished sessions ignored; swim sessions without timed blocks have no pace (`disciplines.ts:142-151` returns null) and are skipped for "Mejor ritmo".
- Data: pure `profileMetrics(kind, sessions, measurements, config, plan, today)` in a new `web/src/features/profile/lib/profileMetrics.ts`; presentational `web/src/features/profile/routes/Profile.tsx`. No persisted or synced change.
- Acceptance criteria:
  - `profileMetrics('strength', …)` for a fixture block returns streak, block week, sessions vs target, the week volumes, the top records and the latest body values with goals.
  - `profileMetrics('swim', …)` for swims of 1,500 m at 2:05 /100 m and 2,000 m at 1:58 /100 m returns best pace 118 s, longest 2,000 m and total 3,500 m.
  - `renderToString(<Profile …/>)` under Gimnasio contains "Récords personales" and "Cuerpo frente a tus metas" and not "Largo de la piscina"; under Natación it contains "Mejor ritmo" and not "Volumen".
- First RED test: the `profileMetrics('swim', …)` fixture.
- Size: L. Risk: none.

### S9 — Ajustes as a separate screen
Owner: "…y no mezclar conceptos, es una app para gimnasio (por ahora) y estamos metiendo temas de natación"
- Goal: the technical configuration leaves the metrics view and lives in "Ajustes", reached from Perfil (D11-A).
- Content, moved without changing any control's behavior (proposed group order):
  1. "Cuenta" (`AccountCard`, sync status).
  2. "Tus datos" (backup export/import, last backup).
  3. "Tu cuerpo": "Estatura (cm)" and "Metas del bloque" (Assumption: goal editing is configuration; Perfil only shows progress against goals).
  4. "Gimnasio": "Inicio del bloque" / "Fin del bloque" (the block belongs to the gym plan).
  5. "Natación": "Largo de la piscina (m)", shown only while Natación is in the list.
  6. "Zona de peligro" last.
- Navigation: the gear in Perfil opens Ajustes with "Volver" (proposed copy); the sync chip opens Ajustes directly (`App.tsx:92`); Hoy's avatar opens Perfil (`Home.tsx:221`).
- Edge cases: Ajustes shows no discipline chip (it is not scoped); a pool length edit while Natación is hidden is still possible from the Plan tab only when listed (Assumption: hidden means not shown anywhere); the "Sesiones" / "Mediciones" count tiles stay in "Tus datos".
- Files likely touched: `Settings.tsx` (regrouped, title stays "Ajustes"), `Settings.test.tsx`, `App.tsx` (Perfil vs Ajustes routing).
- Acceptance criteria:
  - `renderToString(<Settings />)` contains "Cuenta", "Tus datos", "Tu cuerpo", "Gimnasio", "Zona de peligro"; it contains "Largo de la piscina (m)" only when the list includes Natación.
  - Every control saves the same Config patch as today (differential against base for height, block dates, pool length and each goal).
- First RED test: Settings with list `['strength']` does not contain "Largo de la piscina (m)".
- Size: M. Risk: none (account, sync and danger-zone components are moved, not changed; the differential pins their saves).

### S10 — Existing data and the sync contract are preserved
- Goal: switching disciplines never changes or loses stored data, and devices on different builds keep syncing.
- Rules:
  - No change to the shape of sessions, measurements, the plan document or exercise meta; no new document kind (the API accepts only `plan` and `config`, `api/openapi.yaml:242-244`); no API change (the config body is opaque, `api/internal/domain/sync/sync.go:49`).
  - Every new Config field (`disciplines`, `swimWeeklyTarget`) is flat, optional in stored and synced bodies, and filled with its default by `mergeConfig` on every read (local boot, pull, backup import `web/src/lib/db.ts:273,294`, merge `configMerge.ts:190`), following the 53590ef lesson (`types.ts:299-302`).
  - Each new field has a Spanish conflict label in `SCALAR_LABELS`.
  - Per-device state (the selected discipline) lives only in localStorage, behind try/catch, and is removed by both erase paths.
  - Hiding a discipline deletes nothing.
- Acceptance criteria:
  - Boot with today's IndexedDB fixture (no new fields): sessions, measurements, plan and every existing Config field are byte-identical after boot, and no outbox entry is queued just by booting.
  - A config body from an older client (no new fields) merges with a local one that has them without a conflict notice and keeps the local values; a body from this build read by today's `mergeConfig` still yields a valid Config (the fields are dropped, nothing else changes).
  - Backup v3 export → import keeps `disciplines` and `swimWeeklyTarget`.
- First RED test: the older-client merge case keeps the local `disciplines`.
- Size: S. Risk: item 1 and item 3 (same fields as S1 and S6; this spec is their contract test).

## Decisions
Closed 2026-11-13: the owner accepted the recommended option of every decision (L6), so D1-D11 are all A and the specs stand as written.

- **D1 — Where the selector lives (S2).**
  - A — "Chip arriba en cada pestaña (Recomendada)": a chip with icon and name at the top of Hoy, Plan, Progreso and Perfil, like Duolingo's flag; it opens the "Tus disciplinas" sheet.
  - B — "Solo en Perfil": the selector is the first block of Perfil.
  - C — "En la cabecera de Hoy": the chip replaces Hoy's brand line only.
  - Tradeoff: A costs one element per header but switching never leaves the tab; B and C hide which discipline is active on the other tabs.
- **D2 — Default discipline for existing and new users (S1).**
  - A — "Gimnasio, y Natación si ya nadaste (Recomendada)": Gimnasio selected for everyone; existing users with at least one swim session also get Natación in their list; new users start with Gimnasio only.
  - B — "Ambas para todos": every user gets both in the list, Gimnasio selected.
  - C — "Preguntar al abrir": a one-time chooser for existing users and a new onboarding step "¿Qué vas a entrenar?" for new users.
  - Tradeoff: A changes nothing for gym-only users and rebuilds itself from data if an older device drops the field; C asks for the user's intent but adds an onboarding step and a screen.
- **D3 — Does the selection sync across devices (S1).**
  - A — "La lista se sincroniza, la elección es del dispositivo (Recomendada)": "Tus disciplinas" is synced in Config; the selected one is per device.
  - B — "Todo se sincroniza": the list and the selected discipline are both in Config.
  - C — "Todo es del dispositivo": both in localStorage, nothing synced.
  - Tradeoff: B makes every switch a synced config write (outbox traffic and possible "esto cambió en otro dispositivo" notices) and switching on the phone flips the tablet; C makes the user add Natación again on each device.
- **D4 — What happens to walks (S4, S5, S7).**
  - A — "Siguen en Gimnasio (Recomendada)": walks stay a check-in habit shown under Gimnasio (Hoy's button, review, calendar) and keep Gimnasio's streak as today.
  - B — "Hábito común": walks show under every discipline and keep every discipline's streak.
  - C — "Caminata como disciplina": walking becomes a third discipline with its own sessions.
  - Tradeoff: A keeps today's gym streak numbers and matches the gym plan's active rest ("Descanso activo: tus 10.000 pasos", `plan.ts:156`); B mixes a non-discipline concept into Natación; C needs a new session kind (synced contract change, risk item 3) and a larger scope.
- **D5 — Streak, weekly target and rest wildcards: per discipline or global (S4).**
  - A — "Todo por disciplina (Recomendada)": each discipline has its own streak, weekly target and wildcards, with today's rules.
  - B — "Racha común, meta por disciplina": one streak for any activity, target and wildcards per discipline.
  - C — "Todo común, como hoy": one streak, the gym target and wildcards for everyone.
  - Tradeoff: A is what the chosen option says ("su racha", L3) but swim days stop counting for the gym streak; B keeps one number to protect but mixes disciplines on every screen; C contradicts L3.
- **D6 — What each Perfil shows (S8).**
  - A — "Métricas de la disciplina y, en Gimnasio, el cuerpo (Recomendada)": Gimnasio: racha, bloque, volumen por semana, récords, cuerpo frente a metas; Natación: racha, semana, últimas 4 semanas, mejor ritmo, velocidad media, sesión más larga, distancia total.
  - B — "Cuerpo en ambas": the same discipline metrics, and the body block in both Perfiles.
  - C — "Sin cuerpo en Perfil": discipline metrics only; the body stays only in Progreso › Medidas.
  - Tradeoff: A follows "es una app para gimnasio (por ahora)" (L1); B is useful for a swimmer who also weighs in but repeats a non-discipline block; C keeps Perfil purest but drops the goals view the owner's gym users rely on.
- **D7 — Can the user hide or add disciplines (S3).**
  - A — "Agregar y quitar de la lista (Recomendada)": add from the catalog and hide from the list; data is kept and at least one discipline stays.
  - B — "Solo agregar": once added, a discipline stays.
  - C — "Lista fija": both disciplines always listed; the selector only switches.
  - Tradeoff: A lets a gym-only user keep Natación out of sight; B is simpler but a mistaken add is permanent; C has no add flow, which the Duolingo model implies.
- **D8 — What Hoy shows when the selected discipline has nothing planned today (S5).**
  - A — "Botón para empezar igual (Recomendada)": Natación always shows "Nadar" with the week's count; once the target is met, "Semana cumplida. Puedes nadar igual."; Gimnasio keeps "Semana completa".
  - B — "Mensaje de descanso": a rest message with a secondary "Empezar igual".
  - C — "Próximo día planeado": "Próxima natación: jueves", which needs swim weekdays.
  - Tradeoff: A matches the flexible week (no routine is tied to a weekday, `week.ts:1-3`); C needs a swim schedule that does not exist and contradicts the flexible week.
- **D9 — What "Entrenar" means in "Hoy, Entrenar, Progreso y Perfil" (S6, assumption A2).**
  - A — "El plan y la pantalla de entrenar (Recomendada)": tab names stay; the Plan tab and the Train screen (Progreso › Entrenamientos) both follow the selected discipline.
  - B — "Renombrar Plan a Entrenar": the Plan tab becomes "Entrenar" and holds start, plan and history; Progreso keeps only charts and habit.
  - C — "Solo la pantalla de entrenar": Train follows the discipline; the Plan tab stays gym only.
  - Tradeoff: A keeps the navigation users know; B is closer to the owner's wording but restructures navigation and the deep links from Hoy (`App.tsx:61-66`); C leaves Natación without "su plan" (L3).
- **D10 — Natación's plan and weekly target (S4, S6).**
  - A — "Sesiones por semana (Recomendada)": Natación's plan is one number, "Sesiones por semana" (new optional Config field, default 2), plus the pool length; it drives the swim target and wildcards.
  - B — "Sin meta": Natación shows counts only, no target and no wildcards; its streak counts weeks with at least one swim.
  - C — "Plan con sesiones de natación": swim workouts with blocks, like gym routines.
  - Tradeoff: A gives Natación "su plan" (L3) with one synced scalar; B needs a second streak rule; C changes the synced plan document (risk item 3) and is a feature of its own.
- **D11 — Where Ajustes lives (S9).**
  - A — "Engranaje en Perfil (Recomendada)": a gear button in Perfil's header opens Ajustes; the sync chip opens it directly.
  - B — "Quinta pestaña": a fifth tab "Ajustes".
  - C — "Al final de Perfil": a collapsed section under the metrics.
  - Tradeoff: A keeps four tabs and separates the views; B costs tab-bar space for a rarely used screen; C keeps settings in the metrics view the owner wants clean.

## Tasks
Routes as run (L7): wave 1 runs T1 and T3 as two parallel writers in isolated worktrees (disjoint files; T3 takes the swim target as an explicit number, so it does not need T1's type). Wave 2 runs T2, T4, T5, T6, T7 and the Settings part of T8 as parallel writers in isolated worktrees from the wave-1 merge (disjoint files, each 150+ lines). T2 builds the component only, and no unit edits `App.tsx`. The parent owns `App.tsx` (the chip above each tab, Perfil vs Ajustes routing, the sync chip target and the swim start from Hoy) and integrates on `integration/discipline-switcher`. T9 runs at the end.

- [x] T1 — Done: `edf85f3` + correction `47d20c3` on `ds/t1-config` (delegated, opus high). 861/861 and typecheck clean at the unit; second correction `afc3fa0` (B1, B2); verifier PASS (L10). Spec: S1, S10 (+ `swimWeeklyTarget` of S6). Config fields, `mergeConfig` defaults, `SCALAR_LABELS`, `disciplineSelection.ts`, hook, erase paths. Files: `web/src/lib/types.ts`, `web/src/lib/plan.ts`, `web/src/features/sync/lib/configMerge.ts`, new `web/src/lib/disciplineSelection.ts` (+ test), `web/src/lib/store.tsx`, `web/src/features/sync/lib/erase.ts`, `web/src/features/account/lib/eraseDevice.ts`, `plan.test.ts`, `configMerge` tests. Route: inline, own commit. Risk: item 1 (persisted synced Config), item 3 (older clients drop the fields) → independent verifier. Forecast: ~250 lines.
- [x] T2 — Done: `cf8d445` on `ds/t2-switcher` (delegated, sonnet). The component only; the parent mounts it in `App.tsx` (`4d84c78`). Spec: S2, S3. Selector chip and sheet, add/hide. Files: new `web/src/components/DisciplineSwitcher.tsx` (+ test), headers of `Home.tsx` and `PlanEditor.tsx` (chip only). Route: inline. Risk: none. Forecast: ~250 lines.
- [x] T3 — S4. Done: `82b9ac0` on `ds/t3-habit` (delegated, opus). 817/817 tests and typecheck clean. Parent re-ran `disciplineHabit.test.ts`: 11/11. Per-discipline habit context, `weekSummary` / `closedWeekSummary` by discipline, closing summary streak. Files: `web/src/features/habit/lib/habit.ts`, `web/src/features/habit/lib/week.ts`, `web/src/features/session/lib/summary.ts` (+ tests). Route: inline (T4-T7 depend on it). Risk: none (gym-only results pinned by a differential test). Forecast: ~220 lines.
- [x] T4 — Done: `d8ba613` on `ds/t4-hoy` (delegated, sonnet high). Exposes the Home prop `onStartSwim`. Spec: S5. Hoy by discipline, Natación hero. Files: `web/src/features/today/routes/Home.tsx`, new `web/src/features/today/components/SwimToday.tsx`, new `web/src/features/today/lib/swimToday.ts` (+ tests). Route: parallel writer. Risk: item 6 (no Home render test; pinned on the pure helper). Forecast: ~260 lines.
- [x] T5 — Done: `f2e6925` on `ds/t5-train` (delegated, sonnet). Spec: S6. Train by discipline, Natación plan view. Files: `web/src/features/session/routes/Train.tsx` (+ test), `web/src/features/plan/routes/PlanEditor.tsx`, new `web/src/features/plan/components/SwimPlan.tsx` (+ test). Route: inline. Risk: none (its Config field lands in T1). Forecast: ~200 lines.
- [x] T6 — Done: `09eaecf` on `ds/t6-habit-ui` (delegated, sonnet). Spec: S7. Hábito, WeekReview and MonthCalendar by discipline. Files: `web/src/features/habit/routes/Habit.tsx`, `web/src/features/habit/components/WeekReview.tsx`, `web/src/features/habit/components/MonthCalendar.tsx`, `web/src/features/habit/lib/month.ts` (+ tests). Route: parallel writer. Risk: none. Forecast: ~220 lines.
- [x] T7 — Done: `d50dbbb` on `ds/t7-profile` (delegated, opus). Spec: S8. Perfil metrics. Files: new `web/src/features/profile/lib/profileMetrics.ts` (+ test), new `web/src/features/profile/routes/Profile.tsx` (+ test), new `web/src/features/profile/routes/profile.css`. Route: parallel writer. Risk: none. Forecast: ~380 lines.
- [x] T8 — Done: Settings `820095c` on `ds/t8-settings` (delegated, sonnet); `App.tsx` wiring done by the parent in `4d84c78` and the Perfil/Ajustes commit, with the swim start through `features/session/lib/autoStart.ts` (RED: module missing, then 3/3). Spec: S9 and `App.tsx` wiring (Perfil vs Ajustes, sync chip target, chip in the Progreso header, swim start from Hoy). Files: `web/src/features/account/routes/Settings.tsx`, `Settings.test.tsx`, `web/src/app/App.tsx`. Route: inline (parent, after T2-T7). Risk: none (moved components, saves pinned by a differential). Forecast: ~160 lines.
- [x] T9 — Done: seam check 972/972, both builds OK; feature-end verifier first FAIL (B1, B2), then PASS on recheck at `80e0141` (L10). Spec: Seam check and feature-end verification: full suite and typecheck once, the S10 boot and older-client probes in a `mktemp -d` scratch copy, and the T1 independent verifier (item 1/3). Route: per-action worker. Forecast: 0 authored lines.

Forecast total: ~1,940 authored changed lines (additions plus deletions, tests included).

## Log
- L1 — 2026-11-13, owner: "En la pantalla de profile siento que debemos mejorarla para que ahí muestre metricas de interes para el usuario  y no mezclar conceptos, es una app para gimnasio (por ahora) y estamos metiendo temas de natación"
- L2 — 2026-11-13, owner: "Quiero algo cómo la visual de duolingo donde puedes seleccionar el lenguaje, pero en nuestro caso vamos a seleccionar la disciplina que vamos a entrenar "
- L3 — 2026-11-13, owner decision on scope: "Toda la app (Recomendada)". Option description: "Igual que Duolingo con el idioma: Hoy, Entrenar, Progreso y Perfil muestran solo la disciplina elegida, con sus métricas, su racha y su plan. Así no se mezclan conceptos en ninguna pantalla."
- L4 — 2026-11-13, owner on writing the spec first: "Dale"
- L5 — 2026-11-13, audit evidence (read-only at 929cd5f, bounded reads of `app`, `lib`, `features/account`, `today`, `session`, `habit`, `progress`, `onboarding`, `sync`, and the API sync contract; no `.codegraph/` index used). Findings: the app has no "Entrenar" tab (D9); Natación has no plan, only the pool length; walks are check-ins, not sessions; the streak and votes are global while the weekly target is gym only and swim days spend no wildcard; `mergeConfig` drops unknown fields, so new Config fields are lost when an older build saves config (S1, S10); the API needs no change. Next step: relay D1-D11 to the owner one at a time, then rewrite only the affected specs.
- L6 — 2026-11-13, owner on D1-D11: "Aceptar las recomendadas". Option description: "Cierro D1–D11 con la opción recomendada de cada una, las registro en el spec y arranco la implementación."
- L7 — 2026-11-13, delivery and routing: integration branch plus one PR, reusing the owner's choices from the first delivery ("entrega rama de integración", "PR un solo PR"). Two writer waves (see Tasks). Models: opus for T1 (risk items 1/3), T3 (habit rules) and T7 (largest unit); sonnet for T2, T4, T5, T6 and the Settings part of T8.
- L8 — 2026-11-13, T1 result (`edf85f3` on `ds/t1-config`): 849/849 tests, typecheck clean, 0 differences against base in 16 merge cases once the new keys are stripped. The writer found a defect: every write path stores `mergeConfig`'s output, so "field absent" is lost after the first write. Applying D2-A on every read therefore meant a user with swim sessions could never hide Natación. Parent decision (technical, it keeps D2-A's intent): apply D2-A once, as a local migration where the raw body still lacks `disciplines` (boot completion, backup import, a pull with no local list), with no outbox entry. After that, the stored list is returned as is. A correction was sent to the T1 writer. Wave 2 (T2, T4, T5, T6, T7, T8 Settings) launched from `b0d06b4` (integration: T1 + T3).
- L9 — 2026-11-13, integration on `integration/discipline-switcher` (tip `d4ee0fb`): merged T1 (with its correction), T2-T8 and the parent wiring. The correction removed `sessions` from `disciplineActions` deps, so seven unit tests were fixed at the seam; typecheck is clean. The T1 writer widened the pull rule: a pulled body without `disciplines` keeps the local list, and D2-A runs only when the local config has none either. The parent accepts this, because an older device would otherwise reset the list for good, the same rule as the queued merge. Accepted advisories: on first sign-in, a locally migrated list makes `bootstrap` take its safety backup once; Hoy under Natación hides QuickWeight and the rest hint; WeekReview under Natación has no Caminatas line (D4-A). Seam check (full suite and both builds) and the feature-end independent verifier (T9, items 1/3) are running.
- L10 — 2026-11-13, feature-end verification. First run of the independent verifier at `d4ee0fb`: S2-S9 PASS, with a headless Chromium smoke (the chip on four tabs and not on Ajustes, the Natación switch on Hoy and Perfil, the gear and "Volver"). S1 and S10 failed on two blockers on the older-client pull path. B1: a queued local config edit plus a body from an older client dropped `disciplines` everywhere, because `mergePendingConfig` bypassed `applyRemote`. B2: `swimWeeklyTarget` reset to 2 on any older-client pull. One correction batch, `afc3fa0`, added `withLocalNewFields` on all three pull points and changed the drop-queued check to compare against the server body. The recheck at `80e0141` passed: B1 fixed, B2 fixed, and a queued "add Natación" is still pushed. Seam check: 972/972 tests, typecheck clean, `pnpm build` and `VITE_BASE=/fitapp/ pnpm build` OK. Advisories accepted: a hidden Natación can reappear on a newly signed-in device when the server body comes from an older client (S1 accepts this); Hoy under Natación shows no rest-wildcard line; the selected discipline stays in memory after an erase that does not reload. Native review of the T1 slice (assessed high through escalation item 1) was offered; the owner chose "Omitir esta vez", and the decline was recorded for that candidate.
