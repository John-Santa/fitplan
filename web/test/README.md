# UI verification harness

This is fitplan's browser-level verification. Pure logic (`src/lib`: plan
queries, phases, pain verdicts, migration, persistence) is covered by the
vitest suite (`pnpm test`, node environment, no DOM) and `pnpm typecheck`
covers types; neither renders anything, so layout, focus, real IndexedDB
round-trips and the plan UI are verified only here. These scripts drive the
real app in headless Chromium (via `playwright-core`, no bundled browser download) across
a matrix of viewports and assert on real, computed layout: element sizes,
document overflow, and occlusion by fixed-position UI. They were built to
catch a class of bug that a type checker cannot see: things that only break
at 320px, or only when a fixed timer overlaps the content underneath it.

Three real production bugs were caught this way before this harness existed
anywhere but a session scratchpad:

- A 7-exercise rail whose cells dropped below the 44px tap-target floor at
  320–360px viewports.
- A hero headline that overflowed the document at 320px with a longer
  routine name.
- The current-set block hidden behind the rest timer in landscape.

## Files

- `lib.mjs` — shared helpers: Chromium executable discovery, the
  `seedConfig()`/`seedMeasurements()`/`seedSessions()`/`seedAll()` IndexedDB
  helpers, `readStoreValue()` (read back what the app persisted), and a small
  pass/fail checklist used by both scripts.
- `ui-harness.mjs` — the main harness. 8 viewports (6 mobile/tablet + 2
  desktop, 1200x800 and 1920x1080) × the 5 navigation tabs (Inicio, Entrenar,
  Plan, Medidas, Ajustes) × every routine of the active plan (Día 1–5, with an
  `ORD-01` guard that the start-button count matches the active routine count
  + the swim card, and that archived routines have none, and a `WARMUP-01`
  guard that the rail starts with the "Cal" warm-up step), the swim
  progression view (`SWIM-04`), worst-case hero strings, light-theme color
  check, a `seedConfig()` regression check, a `seedMeasurements()`-backed
  desktop table-breakout check, `seedSessions()`-backed legacy/mixed-discipline
  checks (`LEGACY-01`, `LEGACY-02`, `LEGACY-03`, `MIX-01`), the swim-logger
  checks (`SWIM-01`, `SWIM-02`), and the editable-plan scenarios described
  below (`MIG-01`, `PLAN-01`, `PLAN-02`, `SHEET-01`, `GUIDE-01`, `PAIN-01`,
  `LAYOUT-01`).
- `occlusion.mjs` — a focused probe for one failure mode: does a fixed
  overlay (rest timer, tab bar) cover the current-set/current-block and its
  first input, in portrait and landscape. Runs the probe twice: once against
  a strength routine (Día 2, first exercise — the warm-up step is skipped),
  once against the swim logger (`SWIM-03`, F1-5).

## Running

Run these from `web/` (the front package); `src/` and `test/` paths in this
document are relative to it.

```sh
pnpm check:ui                                  # against production
pnpm check:occlusion                           # against production
BASE=http://localhost:5173/ pnpm check:ui      # against local dev
BASE=http://localhost:5173/ pnpm check:occlusion
```

Local dev needs the server running first (`pnpm dev --port 5173 --strictPort`,
wait until it serves, stop it afterwards). The full `check:ui` run takes about
5 minutes (8 viewports × 5 routines, then the scenarios). If another
project already owns `127.0.0.1:5173`, `localhost` may resolve to it instead
of this app: pick a free port (`--port 5188`) and match `BASE`.

The scenarios are isolated: each opens its own browser context (empty
IndexedDB), and a scenario that throws (missing element, timeout) is reported
as a failed `<NAME>/excepcion` check instead of aborting the run.

`BASE` defaults to `https://john-santa.github.io/fitplan/`. Both scripts
exit non-zero on any failure, so they compose with CI or a pre-push hook the
same way any other check does — they are just not wired into CI yet.

Optional: set `OUT=/some/dir` to also save a screenshot per viewport (both
scripts).

Console output (the `[Inicio]`, `RESUMEN`, `✗ ...` lines) is intentionally
left in Spanish — it's operator-facing, matching the rest of this
Spanish-language app's runtime strings. Code and comments are English.

## Chromium resolution

Both scripts launch Chromium via an explicit `executablePath` — they never
let `playwright-core` download a browser. Resolution order
(`resolveChromiumPath()` in `lib.mjs`):

1. `CHROME_PATH` (or `PLAYWRIGHT_CHROMIUM_PATH`) env var, if set — used
   as-is.
2. The newest `chromium_headless_shell-*` revision found under the
   Playwright browser cache (`PLAYWRIGHT_BROWSERS_PATH`, or the OS default:
   `~/Library/Caches/ms-playwright` on macOS, `~/.cache/ms-playwright` on
   Linux, `%LOCALAPPDATA%\ms-playwright` on Windows).
3. If nothing is found, the script prints an actionable message and exits —
   never a raw stack trace:
   ```
   Could not find a Playwright Chromium headless-shell executable.

   Fix by either:
     1. Installing it:      pnpm exec playwright install chromium
     2. Pointing at one:    CHROME_PATH=/path/to/chrome-headless-shell pnpm check:ui
   ```

If you've never installed a Playwright browser on this machine, run
`pnpm exec playwright install chromium` once — that's the only setup step.

## seedConfig — testing non-default configuration

Every check used to only ever exercise `DEFAULT_CONFIG` (from
`src/lib/plan.ts`), because each viewport gets a fresh, isolated browser
context whose IndexedDB is empty — and on first load the app auto-seeds the
default config into it. There was no way to test any other configuration.

`seedConfig(page, partialConfig, base?)` (in `lib.mjs`) fixes that: it writes
a full `Config` object directly into IndexedDB *before* the app's own bundle
starts executing, so a test can assert on how the app renders a non-default
configuration (e.g. a custom `blockStart`/`blockEnd`, or — once it exists —
a custom weekly schedule).

```js
import { seedConfig } from './lib.mjs'

const config = await seedConfig(page, { blockStart: '2020-01-15', blockEnd: '2020-03-11' })
// `page` is now on `base` (defaults to BASE) with that config already
// in IndexedDB before the app read it. `config` is the full object written
// (your partial, shallow-merged over a baseline, `goal` merged one level
// deep).
```

The baseline is the app's **current** default (block 2026-11-16..2027-02-07,
Mon–Fri = Días 1–5, Sat/Sun "Descanso activo"), not the pre-plan config: the
boot migration rewrites the old week and block, so a baseline carrying them
would turn every `seedConfig()` check into a migration check. A scenario that
needs the old config passes it whole as its own fixture (`MIG-01`).

Implementation notes (see `lib.mjs` for the full comments):

- The database name (`fitplan`), version (`1`), store names, and the
  `config` store's literal key (`'config'`) are copied from `src/lib/db.ts`,
  not guessed. If that file's schema changes, update the constants at the
  top of `lib.mjs` to match. The editable plan lives in the same `config`
  store under the key `'plan'` (out-of-line keys, so no `DB_VERSION` bump).
- It is race-free by construction: it navigates with `waitUntil: 'commit'`
  (the origin exists, but no page script has run yet), writes and fully
  awaits the IndexedDB transaction from Node, then does the *real*
  navigation. There is no window where the app could read a stale/default
  config.
- On a fresh context the IndexedDB database does not exist yet, so a shared
  `openSeedDb()`/`seedStore()` pair (in `lib.mjs`) opens the database and
  creates every object store the app expects (`sessions`, `measurements`,
  `exerciseMeta`, `config`) — not just the one being written — mirroring
  `db.ts`'s schema exactly. `seedConfig()`, `seedMeasurements()` and
  `seedSessions()` all route through it instead of each repeating the
  `onupgradeneeded` block; that block was pasted twice before this was
  extracted, and a third copy for `seedSessions()` would have made it worse.
  Skipping it entirely would leave the app unable to read/write sessions or
  measurements at all.

`ui-harness.mjs` has a small `SEEDCONFIG` section near the end that seeds a
`blockStart`/`blockEnd` far from the default and asserts the Ajustes view's
date inputs reflect the seeded value — that's both the regression check and
the reference usage example.

## seedSessions — testing session shapes the app itself never writes

`seedSessions(page, rows, base?)` (in `lib.mjs`) writes raw objects — not
typed `Session`s — directly into the `sessions` store, before the app boots.
Same race-free navigation as `seedConfig()`/`seedMeasurements()`. It exists
to test shapes that no code path in this app produces, but that a real
device's IndexedDB can still contain:

- A **legacy row with no `kind` property at all** — the exact byte shape
  every session had before the multi-discipline engine. `normalizeSession()`
  must still read it as a strength session (`LEGACY-01`).
- A **corrupt row** (e.g. missing `routineId`) that `normalizeSession()`
  must drop without throwing, leaving every other row intact (`LEGACY-02`).
- A **mix of disciplines on the same day**, to prove per-discipline metrics
  don't sum incompatible units or double-count sessions (`MIX-01`, guarding
  R1 from the design doc).

```js
import { seedSessions } from './lib.mjs'

await seedSessions(page, [
  { id: 'dia1-1', routineId: 'dia1', date: '2026-08-06', startedAt: 1, finishedAt: 2,
    sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 12, done: true }], notes: '' },
  // no `kind` — normalizeSession() treats this as a pre-engine strength session
])
```

## seedAll / readStoreValue — first-boot and persistence scenarios

`seedConfig()` and `seedSessions()` each finish with the real navigation, so
calling both in a row boots the app after the first one. That is fatal for a
migration scenario, where the config **and** the sessions must already be on
disk (and no `plan` record yet) at the app's first boot.
`seedAll(page, { config, sessions, measurements }, base?)` writes every given
store, never writes the `plan` key, then navigates once.

`readStoreValue(page, key, storeName = 'config')` reads a persisted value back
from IndexedDB (`null` when absent) — used to assert on the `plan` and
`config` records the app wrote, not only on what the UI renders.

## data-testid — introduced narrowly, only where a check binds to a value

There is no `data-testid` in `src/` outside these places: the four `<Tile>`s
on Inicio (`Tile` in `src/components/ui.tsx` takes an optional `testId`
prop), the per-routine start button on Entrenar
(`data-testid={\`start-${r.id}\`}` in `Train.tsx`; with the default plan the
ids are `espalda-d1`..`espalda-d5`, and archived routines such as the legacy
`dia1`..`dia3` have no start button), and the swim start button
(`data-testid="start-swim"`, same file, F1-5). The plan editor, the exercise
sheet, the Guide and the session's pain control have no testids: their
scenarios select by role, accessible name and visible text (`getByRole`,
`getByLabel`), which is also what a user and a screen reader see.

The rule for adding another one: a check needs it when it must bind to a
**value** rather than a **position**. `MIX-01` needs the exact "Volumen"
tile regardless of how many tiles render before it — a testid, not an
ordinal `.nth()`. `ORD-01` (below) exists precisely because the *positional*
selector it replaced (`button.primary.nth(i)`) would silently repoint to the
wrong routine the moment another `button.primary` appears —
`ui-harness.mjs` and `occlusion.mjs` bind to
`[data-testid="start-espalda-d1"]`/`[data-testid="start-swim"]` etc. instead,
and `ORD-01` separately asserts the start-button *count*: one per **active**
routine (`PLAN_ROUTINES.length`, mirrored from `src/lib/defaultPlan.ts`) plus
the swim card, and none for the archived legacy routines. Since the routine
list comes from the persisted plan, the count moves whenever someone
archives, restores or adds a routine in the default plan — update
`PLAN_ROUTINES` together with `DEFAULT_PLAN`. The tap-target check still
selects by tag and role, so none of this perturbs it.

## SWIM-04 — the swim progression view (F1-6)

Every viewport context in `ui-harness.mjs`'s main loop now seeds
`SWIM_PROGRESS_SEED` (two finished swim sessions, one with an untimed block)
before its first navigation, instead of a bare `page.goto()` — each viewport
is its own isolated browser context, so this does not leak into any other
check. After the HARNESS-01 routine loop, the check discards whatever routine
session that loop left active (same `button.danger` pattern the routine loop
itself uses — skipping this makes the swim-card locator below hang on a 30s
timeout instead of failing cleanly, because `ActiveSession` would still be
mounted in place of the card list), opens the swim card's "Ver progresión",
and reuses `geometry()`'s `overflowX===0` and `tapsChicos.length===0`
assertions — the same ones already run per navigation tab — against this new
view, across all 8 `VIEWPORTS`.

This exists because `SwimProgress.tsx`'s two `Chart` components have a fixed
SVG `viewBox="0 0 700 H"` (`src/features/progress/components/Chart.tsx`): CSS scales that box
down to whatever the container measures, and the risk this check is built to
catch is a version of that scaling that stops fitting between 700px and
320px, which would show up as `overflowX !== 0` — exactly what a run against
the empty state could never exercise, since an empty chart is just centered
text. Reusing `seedSessions()` for real chart data, rather than adding a
purpose-built empty-state check, is what makes the assertion meaningful.

## SWIM-01 / SWIM-02 / SWIM-03 — the swim logger (F1-5)

- **`SWIM-01`** (in `ui-harness.mjs`) seeds a `weeklyRoutine` whose *today*
  slot (`new Date().getDay()`, computed in Node so the check is
  date-independent) is `{kind:'swim'}`, then asserts Inicio's `.card.accent`
  renders an `h2` reading "Natación" **and** contains a start button. This
  is the regression `SESSION_KIND_FOR_DAY` fixes in `Home.tsx`: before F1-5,
  the card gated its button on `routineForWeekday(...) !== null`, which is
  always `null` for a swim day (it only resolves `'training'` days) — a
  swim day rendered a title and note with no way to start anything.
- **`SWIM-02`** (in `ui-harness.mjs`, at 1440px) opens the swim logger from
  Entrenar and asserts `.session-head` exists **and**
  `getComputedStyle(document.querySelector('.main')).display === 'block'` —
  the ADR-06 assertion (`.main:has(.session-head)` in `styles.css`), which
  had no coverage for *any* screen before this check. It then fills a
  block's largos and tiempo, marks it, asserts "Terminar" goes from
  disabled to enabled, finishes the session, and asserts the history shows
  a "Natación" row.
- **`SWIM-03`** (a second, standalone loop in `occlusion.mjs`) reuses the
  exact same `.setnow` occlusion probe as the strength scenario, in
  landscape and portrait, against the swim logger instead. This was nearly
  free because `SwimBody` reuses `.setnow`/`.setrow` verbatim (see A4 in the
  plan) instead of introducing new markup the probe would need to learn.

## Editable-plan scenarios (`ui-harness.mjs`)

All run on a fresh context at 390x844 unless noted; none relies on another's
state.

- **`MIG-01`** (S5) seeds the *old shipped* config (inlined fixture, from
  `git show 4d0c2c0:src/lib/plan.ts`: Mon/Wed/Fri `dia1`..`dia3`, Tue/Thu swim,
  Sat walk, Sun rest, block 2026-08-04..2026-09-28), two legacy `dia1`
  sessions and **no** plan record, via `seedAll()`. After boot it asserts the
  `plan` record exists (Días 1–5 active, `dia1`..`dia3` archived), the stored
  and displayed week is Mon–Fri = Días 1–5, the block is
  2026-11-16..2027-02-07, the legacy sessions still show in Entrenar's
  history, and a second boot rewrites nothing.
- **`PLAN-01`** (S4, S11) Plan → "Día 1 – Tren inferior A" → picker: an
  exercise already in the routine is disabled with "En la rutina"; add "Dead
  bug"; reload; it is still there, in the UI and in the IndexedDB `plan`
  record.
- **`PLAN-02`** (S4, S11) archive "Día 5 – Tren superior B" → confirmation
  dialog → it leaves the active list and appears under "Archivadas (N+1)"
  (kept in storage with `archived: true`, not deleted) → "Deshacer" restores it.
- **`SHEET-01`** (S9, S12) from a session, the info button of "Prensa de
  piernas" opens a `role=dialog` (`aria-modal`); the MuscleWiki link has
  `target=_blank`, `rel` with `noopener` and the verified href
  `https://musclewiki.com/es-es/exercise/machine-leg-press`; the attribution
  line is present; "Cerrar" is ≥44px; Escape closes it and focus returns to
  the opener; the close button also works.
- **`GUIDE-01`** (S10) Plan → "Guía": the urgent red-flag line is visible, the
  "Ejercicios a evitar" table has 8 rows, no horizontal overflow, "Volver"
  returns to Plan; in a session, one tap on "Señales de alarma" opens the
  red-flags sheet with the urgent line.
- **`PAIN-01`** (S7) the pain select shows the verdict as text (1 → "Bien", 4
  → "Baja peso o rango", 7 → "Cambia el ejercicio"); with 4 selected, a
  finished session's detail shows "Dolor registrado" with 4/10.
- **`LAYOUT-01`** (S12) at 375x812, light **and** dark (`colorScheme`): no
  horizontal scroll and no visible interactive element under 44x44 on Inicio,
  Entrenar, Plan, the routine editor, the picker sheet, the Guide, and a Día 3
  session at the warm-up, the timed hold (plancha lateral), the carry (maleta)
  and the cardio block. Inline text links inside paragraphs are exempt. With a
  sheet open the audit is scoped to the dialog (what is behind a modal is not
  reachable). Offenders are printed as `tag#id.class "label" WxH`.
- **`LEGACY-03`** (S4) a session whose routine does not exist in the plan is
  kept and listed.

`LEGACY-01`/`LEGACY-02` also prove the legacy `dia1`..`dia3` sessions stay
visible after the migration (archived routine name in the history, exercise
names resolved in the detail, an "archivada" card in Entrenar).

## Adding a check

1. If it needs a new DOM query, add it to `geometry()` in `ui-harness.mjs`
   (or write a focused inline `page.evaluate()` like the hero-string or
   seedConfig sections do — `geometry()` doesn't need to grow for a one-off
   assertion).
2. Call `check(condition, label, detail)`. `label` should be
   `${viewport}/${context}` so a failure is locatable at a glance; `detail`
   should include the actual numbers, not just "failed".
3. That's it — `check()` accumulates into the shared checklist; the
   `RESUMEN` and exit code at the bottom of the script pick it up
   automatically.

For a new kind of probe entirely (not a `geometry()`-shaped check), follow
`occlusion.mjs`'s shape: import `createChecklist` and `resolveChromiumPath`
from `lib.mjs`, drive the page, `check()` the outcome, `report()` at the
end.

## Known gap addressed here, and what was deliberately left out

- **Fixed**: the tap-target selector in `geometry()` used to be
  `button,a,input,select,textarea` — a `<details>`/`<summary>` UI or a
  `role="button"` custom control would have been invisible to the 44px
  check. It now also includes `summary` and `[role="button"]`. At the time
  this was written neither matched anything in the app, so it changed 0
  outcomes — pure forward coverage. That has since changed: Settings' weekly
  editor (`fitplan-semana-configurable`) now renders one `<details
  className="dayrow">` per day, and `summary.list-item` (58px) passes the
  floor on its own.
- **Tried, then deliberately excluded: `label`**. `<label htmlFor>` is
  arguably a real tap target (WCAG 2.5.8 treats it as extending the hit area
  of its associated control), so it was tried too. It surfaced 6 new
  failures, one per viewport, all on the Ajustes (Settings) view:
  ```
  320x568 iPhone SE/Ajustes    — LABEL "Estatura (cm)"      254×15
  320x568 iPhone SE/Ajustes    — LABEL "Inicio del bloque"  122×30
  320x568 iPhone SE/Ajustes    — LABEL "Fin del bloque"     122×15
  360x800 / 390x844 / 844x390 LANDSCAPE / 768x1024 / 1440x900 — same three
  labels, scaled to viewport width, heights 15–30px
  ```
  In every case the label's own paired `<input>` — which `geometry()`
  selects separately — passes the 44px check on its own. These labels are
  caption text next to an input, not the tap target itself; failing them is
  a labeling technicality, not evidence of an unreachable control. A check
  that's permanently red for a non-issue trains people to ignore real
  failures next to it, so `label` was left out of the final selector. This
  was reported, not silently patched into the app — if the app's design
  changes so a label needs to be its own tap target, add `label` back to
  the selector in `ui-harness.mjs` and expect (and fix) these 6 to reappear.
