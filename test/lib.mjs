// Shared helpers for the UI verification harness (test/ui-harness.mjs,
// test/occlusion.mjs). Keep this file dependency-light: it is the only
// module both scripts import from.
import { existsSync, readdirSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

/* ---------------------------------------------------------------------- *
 * Chromium executable resolution
 *
 * playwright-core does not ship or auto-download a browser (that's the
 * whole point of using it instead of `playwright`/`@playwright/test`), so
 * we launch whatever Chromium build the machine already has cached, by
 * explicit executablePath. That path is machine-, version- and
 * arch-specific, so it must never be hardcoded. Resolution order:
 *
 *   1. CHROME_PATH (or PLAYWRIGHT_CHROMIUM_PATH) env var, if set.
 *   2. The newest `chromium_headless_shell-*` revision found under the
 *      Playwright browser cache (PLAYWRIGHT_BROWSERS_PATH, or the OS
 *      default location).
 *   3. A clear, actionable error — never a raw stack trace.
 * ---------------------------------------------------------------------- */

function playwrightCacheDirs() {
  const home = homedir()
  const dirs = []
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) dirs.push(process.env.PLAYWRIGHT_BROWSERS_PATH)
  if (platform() === 'win32') {
    dirs.push(join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'ms-playwright'))
  } else if (platform() === 'darwin') {
    dirs.push(join(home, 'Library', 'Caches', 'ms-playwright'))
  } else {
    dirs.push(join(process.env.XDG_CACHE_HOME || join(home, '.cache'), 'ms-playwright'))
  }
  return dirs.filter(existsSync)
}

// Small bounded recursive search for the headless-shell binary inside a
// revision folder — cheap because these folders are shallow and small, and
// it avoids hardcoding the platform/arch subfolder name (e.g.
// `chrome-headless-shell-mac-arm64`, `-linux`, `-win64`).
function findExecutable(dir, baseName, depth = 3) {
  if (depth < 0) return null
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isFile() && (entry.name === baseName || entry.name === `${baseName}.exe`)) return full
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findExecutable(join(dir, entry.name), baseName, depth - 1)
      if (found) return found
    }
  }
  return null
}

export function resolveChromiumPath() {
  const fromEnv = process.env.CHROME_PATH || process.env.PLAYWRIGHT_CHROMIUM_PATH
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      throw new Error(
        `CHROME_PATH is set to "${fromEnv}" but no file exists there.\n` +
          'Fix the path, or unset it to let the harness auto-discover a cached Chromium build.',
      )
    }
    return fromEnv
  }

  for (const cacheDir of playwrightCacheDirs()) {
    let entries
    try {
      entries = readdirSync(cacheDir, { withFileTypes: true })
    } catch {
      continue
    }
    const revisions = entries
      .filter(e => e.isDirectory() && e.name.startsWith('chromium_headless_shell-'))
      .map(e => ({ name: e.name, rev: Number.parseInt(e.name.split('-').pop(), 10) || 0 }))
      .sort((a, b) => b.rev - a.rev) // newest revision first

    for (const { name } of revisions) {
      const exe = findExecutable(join(cacheDir, name), 'chrome-headless-shell')
      if (exe) return exe
    }
  }

  throw new Error(
    'Could not find a Playwright Chromium headless-shell executable.\n\n' +
      'Fix by either:\n' +
      '  1. Installing it:      pnpm exec playwright install chromium\n' +
      '  2. Pointing at one:    CHROME_PATH=/path/to/chrome-headless-shell pnpm check:ui\n',
  )
}

/* ---------------------------------------------------------------------- *
 * seedConfig / seedMeasurements / seedSessions — write directly into
 * IndexedDB before the app boots
 *
 * Mirrors src/lib/db.ts exactly (database name, version, store names, and
 * the literal 'config' key). Do not change these constants without also
 * checking db.ts — they are not guessed, they are copied.
 * ---------------------------------------------------------------------- */

export const DB_NAME = 'fitplan'
export const DB_VERSION = 1
export const STORE_SESSIONS = 'sessions'
export const STORE_MEASUREMENTS = 'measurements'
export const STORE_EXERCISE_META = 'exerciseMeta'
export const STORE_CONFIG = 'config'
export const CONFIG_KEY = 'config'

const DEFAULT_BASE = 'https://john-santa.github.io/fitplan/'

// Mirrors the *shape* of src/lib/plan.ts's DEFAULT_CONFIG (not necessarily
// its values) so seedConfig() can always write a structurally complete
// Config even when the caller only overrides one or two fields. If Config
// grows new required fields, add matching baseline fields here — this one
// (`weeklyRoutine`) was itself missing for a while and nothing caught it,
// because mergeConfig() silently repairs an absent field with the app's own
// default. That repair is exactly why: without a `weeklyRoutine` here, no
// check could ever seed a non-default weekly schedule (e.g. "today is a
// swim day"), since seedConfig() would always hand the app back its own
// default regardless of what the test asked for.
const BASELINE_CONFIG = {
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
  // Mirrors src/lib/plan.ts's DEFAULT_WEEKLY_ROUTINE values exactly (not
  // just its shape) — this is what a check gets unless it overrides
  // `weeklyRoutine` wholesale in partialConfig.
  weeklyRoutine: [
    { kind: 'rest', title: '', note: 'Estiramiento y caminata liviana. Dedica dos horas a cocinar las cinco cenas de la semana: con cena a las 22:15, esta es la tarea más importante del domingo.' },
    { kind: 'training', routineId: 'dia1', title: '', note: '20:30 en el gimnasio' },
    { kind: 'swim', title: '', note: '20:00 a 21:00. Cierra el segundo trabajo a las 19:30 y come la fruta o el batido antes de salir. En casa a las 22:30, cena lista para calentar y a dormir a las 23:30.' },
    { kind: 'training', routineId: 'dia2', title: '', note: '20:30 en el gimnasio' },
    { kind: 'swim', title: '', note: '20:00 a 21:00. Cierra el segundo trabajo a las 19:30 y come la fruta o el batido antes de salir. En casa a las 22:30, cena lista para calentar y a dormir a las 23:30.' },
    { kind: 'training', routineId: 'dia3', title: '', note: '20:30 en el gimnasio' },
    { kind: 'walk', title: '', note: '60 a 75 minutos a la hora que quieras. Dormir 8 h 45.' },
  ],
  poolLengthM: 25,
}

/* ---------------------------------------------------------------------- *
 * Shared IndexedDB seeding plumbing
 *
 * openSeedDb()/seedStore() exist so a third seeder (seedSessions, below)
 * doesn't have to paste the onupgradeneeded block a third time — it was
 * already duplicated once between writeConfigInPage and
 * writeMeasurementsInPage, and that drift is exactly what this extraction
 * closes off. Both *InPage functions run inside the page via
 * page.evaluate(), which only ships a function's own source across (see the
 * geometry() comment in ui-harness.mjs for the same constraint) — that's
 * why they're plain standalone functions rather than methods that close
 * over each other.
 * ---------------------------------------------------------------------- */

// Ensures every object store the app expects exists, mirroring
// src/lib/db.ts's openDb() onupgradeneeded exactly. On a fresh context the
// database does not exist yet, so *we* are the ones triggering its
// creation — every store the app expects must be created here, or the
// app's later reads/writes to sessions, measurements or exerciseMeta will
// throw "object store not found".
function openSeedDbInPage({ dbName, dbVersion, storeSessions, storeMeasurements, storeExerciseMeta, storeConfig }) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, dbVersion)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(storeSessions)) {
        const s = db.createObjectStore(storeSessions, { keyPath: 'id' })
        s.createIndex('by-date', 'date')
        s.createIndex('by-routine', 'routineId')
      }
      if (!db.objectStoreNames.contains(storeMeasurements)) {
        db.createObjectStore(storeMeasurements, { keyPath: 'date' })
      }
      if (!db.objectStoreNames.contains(storeExerciseMeta)) {
        db.createObjectStore(storeExerciseMeta, { keyPath: 'exerciseId' })
      }
      if (!db.objectStoreNames.contains(storeConfig)) {
        db.createObjectStore(storeConfig)
      }
    }
    req.onsuccess = () => {
      req.result.close()
      resolve()
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('indexedDB open blocked by another connection to the same database'))
  })
}

// Writes into a single store. `key !== undefined` puts one `value` under
// that literal key (the config store's usage: it has no keyPath). Otherwise
// `value` is treated as an array of records and each is put individually
// (sessions/measurements, both keyPath stores, so `store.put(row)` alone
// resolves the key).
function seedStoreInPage({ dbName, dbVersion, storeName, value, key }) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, dbVersion)
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      if (key !== undefined) {
        store.put(value, key)
      } else {
        for (const row of value) store.put(row)
      }
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('indexedDB open blocked by another connection to the same database'))
  })
}

// Node-side half of the race-free pattern shared by every seed*() export
// below: navigate with `waitUntil: 'commit'` (the origin exists, but the
// document's own scripts have not run yet), then open the database from
// Node so every store exists before any write. The caller does its own
// write(s) with seedStore() and the *real* navigation afterwards — by the
// time the app's bundle starts executing, everything it will read has
// already been sitting in IndexedDB.
async function openSeedDb(page, target) {
  await page.goto(target, { waitUntil: 'commit' })
  await page.evaluate(openSeedDbInPage, {
    dbName: DB_NAME,
    dbVersion: DB_VERSION,
    storeSessions: STORE_SESSIONS,
    storeMeasurements: STORE_MEASUREMENTS,
    storeExerciseMeta: STORE_EXERCISE_META,
    storeConfig: STORE_CONFIG,
  })
}

async function seedStore(page, storeName, value, key) {
  await page.evaluate(seedStoreInPage, { dbName: DB_NAME, dbVersion: DB_VERSION, storeName, value, key })
}

/**
 * Write `partialConfig` (shallow-merged over a baseline Config, with `goal`
 * merged one level deep) into IndexedDB before the app has a chance to read
 * it — so a test can exercise a non-default configuration instead of
 * whatever a fresh context auto-seeds on first load.
 *
 * Race-free by construction: see openSeedDb() above.
 *
 * Returns the full Config object that was written.
 */
export async function seedConfig(page, partialConfig = {}, base) {
  const target = base || process.env.BASE || DEFAULT_BASE
  const config = {
    ...BASELINE_CONFIG,
    ...partialConfig,
    goal: { ...BASELINE_CONFIG.goal, ...(partialConfig.goal ?? {}) },
  }

  await openSeedDb(page, target)
  await seedStore(page, STORE_CONFIG, config, CONFIG_KEY)
  await page.goto(target, { waitUntil: 'networkidle' })

  return config
}

/**
 * Write `rows` (an array of partial Measurement objects, each shallow-merged
 * over a baseline with every optional field populated) into IndexedDB before
 * the app has a chance to read it. Mirrors seedConfig()'s navigation and
 * transaction shape exactly.
 */
export async function seedMeasurements(page, rows, base) {
  const target = base || process.env.BASE || DEFAULT_BASE

  await openSeedDb(page, target)
  await seedStore(page, STORE_MEASUREMENTS, rows)
  await page.goto(target, { waitUntil: 'networkidle' })

  return rows
}

/**
 * Write `rows` (an array of *raw* objects — not typed Sessions) directly
 * into the `sessions` store before the app has a chance to read them.
 * Deliberately untyped: the point is seeding byte shapes the app itself
 * never writes, including a legacy row with no `kind` property at all, or a
 * garbage row that normalizeSession() must drop. `sessions` has keyPath
 * `id`, so no explicit key is passed to seedStore() — each row supplies its
 * own. Mirrors seedConfig()'s navigation and transaction shape exactly.
 */
export async function seedSessions(page, rows, base) {
  const target = base || process.env.BASE || DEFAULT_BASE

  await openSeedDb(page, target)
  await seedStore(page, STORE_SESSIONS, rows)
  await page.goto(target, { waitUntil: 'networkidle' })

  return rows
}

/* ---------------------------------------------------------------------- *
 * Minimal pass/fail checklist shared by both scripts, so both report a
 * consistent RESUMEN and both exit(1) on failure (CI-friendly).
 * ---------------------------------------------------------------------- */

export function createChecklist() {
  const fails = []
  let total = 0
  const check = (cond, label, detail) => {
    total++
    if (!cond) fails.push(`${label} — ${detail}`)
    return cond ? 'ok' : 'FAIL'
  }
  const report = title => {
    console.log(`\n\x1b[1m===== ${title} =====\x1b[0m`)
    console.log(`checks: ${total} | fallos: ${fails.length}`)
    if (fails.length) {
      console.log('\x1b[31m')
      fails.forEach(f => console.log('  ✗ ' + f))
      console.log('\x1b[0m')
      return false
    }
    console.log('\x1b[32m  todo verde\x1b[0m')
    return true
  }
  return { check, report, get total() { return total }, get fails() { return fails } }
}
