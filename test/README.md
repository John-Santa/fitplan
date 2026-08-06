# UI verification harness

This is fitplan's only test infrastructure. There is no unit-test runner —
`pnpm typecheck` is the sole other check. These scripts drive the real app in
headless Chromium (via `playwright-core`, no bundled browser download) across
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
  `seedConfig()` IndexedDB helper, and a small pass/fail checklist used by
  both scripts.
- `ui-harness.mjs` — the main harness. 6 viewports × navigation tabs × all
  three routines, worst-case hero strings, light-theme color check, and a
  `seedConfig()` regression check. ~219 checks.
- `occlusion.mjs` — a focused probe for one failure mode: does a fixed
  overlay (rest timer, tab bar) cover the current-set block or its kg input,
  in portrait and landscape.

## Running

```sh
pnpm check:ui                                  # against production
pnpm check:occlusion                           # against production
BASE=http://localhost:5173/ pnpm check:ui      # against local dev
BASE=http://localhost:5173/ pnpm check:occlusion
```

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

Implementation notes (see `lib.mjs` for the full comments):

- The database name (`fitplan`), version (`1`), store name (`config`), and
  key (the literal string `'config'`) are copied from `src/lib/db.ts`, not
  guessed. If that file's schema changes, update the constants at the top of
  `lib.mjs` to match.
- It is race-free by construction: it navigates with `waitUntil: 'commit'`
  (the origin exists, but no page script has run yet), writes and fully
  awaits the IndexedDB transaction from Node, then does the *real*
  navigation. There is no window where the app could read a stale/default
  config.
- On a fresh context the IndexedDB database does not exist yet, so the
  helper's `onupgradeneeded` handler has to create every object store the
  app expects (`sessions`, `measurements`, `exerciseMeta`, `config`) — not
  just `config` — mirroring `db.ts`'s schema exactly. Skipping this would
  leave the app unable to read/write sessions or measurements at all.

`ui-harness.mjs` has a small `SEEDCONFIG` section near the end that seeds a
`blockStart`/`blockEnd` far from the default and asserts the Ajustes view's
date inputs reflect the seeded value — that's both the regression check and
the reference usage example.

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
  check. It now also includes `summary` and `[role="button"]`. Neither
  matches anything in the app today (no `<details>` or `role="button"`
  exists yet), so this changed 0 outcomes on the current build — it's pure
  forward coverage.
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
