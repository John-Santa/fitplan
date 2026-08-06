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
 * seedConfig — write a Config directly into IndexedDB before the app boots
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

// Mirrors the *shape* of src/lib/plan.ts's DEFAULT_CONFIG (not necessarily
// its values) so seedConfig() can always write a structurally complete
// Config even when the caller only overrides one or two fields. If Config
// grows new required fields (e.g. the upcoming configurable weekly
// schedule), add matching baseline fields here.
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
}

/**
 * Write `partialConfig` (shallow-merged over a baseline Config, with `goal`
 * merged one level deep) into IndexedDB before the app has a chance to read
 * it — so a test can exercise a non-default configuration instead of
 * whatever a fresh context auto-seeds on first load.
 *
 * Race-free by construction: we navigate with `waitUntil: 'commit'` (the
 * origin exists, but the document's own scripts have not run yet), write
 * and fully await the IndexedDB transaction from Node, and only then do the
 * *real* navigation. By the time the app's bundle starts executing, the
 * config it will read has already been sitting in IndexedDB.
 *
 * Returns the full Config object that was written.
 */
export async function seedConfig(page, partialConfig = {}, base) {
  const target = base || process.env.BASE || 'https://john-santa.github.io/fitplan/'
  const config = {
    ...BASELINE_CONFIG,
    ...partialConfig,
    goal: { ...BASELINE_CONFIG.goal, ...(partialConfig.goal ?? {}) },
  }

  await page.goto(target, { waitUntil: 'commit' })
  await page.evaluate(writeConfigInPage, {
    dbName: DB_NAME,
    dbVersion: DB_VERSION,
    storeSessions: STORE_SESSIONS,
    storeMeasurements: STORE_MEASUREMENTS,
    storeExerciseMeta: STORE_EXERCISE_META,
    storeConfig: STORE_CONFIG,
    configKey: CONFIG_KEY,
    value: config,
  })
  await page.goto(target, { waitUntil: 'networkidle' })

  return config
}

// Runs inside the page. Kept as a standalone named function (rather than
// inline) purely so its body reads like normal code instead of a giant
// string passed to page.evaluate.
function writeConfigInPage({ dbName, dbVersion, storeSessions, storeMeasurements, storeExerciseMeta, storeConfig, configKey, value }) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, dbVersion)
    req.onupgradeneeded = () => {
      // Mirrors src/lib/db.ts openDb()'s onupgradeneeded exactly. On a
      // fresh context the database does not exist yet, so *we* are the
      // ones triggering its creation — every store the app expects must
      // be created here, or the app's later reads/writes to sessions,
      // measurements or exerciseMeta will throw "object store not found".
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
      const db = req.result
      const tx = db.transaction(storeConfig, 'readwrite')
      tx.objectStore(storeConfig).put(value, configKey)
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

/* ---------------------------------------------------------------------- *
 * seedMeasurements — write measurement rows directly into IndexedDB
 *
 * Same race-free pattern as seedConfig(): navigate with `waitUntil: 'commit'`,
 * write and fully await the IndexedDB transaction from Node, then do the
 * real navigation. Needed because on a fresh profile the app only ever
 * seeds one BASELINE measurement, so the measurements table's intrinsic
 * width is well under 947px and any breakout/scroll assertion against it
 * would pass vacuously.
 * ---------------------------------------------------------------------- */

/**
 * Write `rows` (an array of partial Measurement objects, each shallow-merged
 * over a baseline with every optional field populated) into IndexedDB before
 * the app has a chance to read it. Mirrors seedConfig()'s navigation and
 * transaction shape exactly.
 */
export async function seedMeasurements(page, rows, base) {
  const target = base || process.env.BASE || 'https://john-santa.github.io/fitplan/'

  await page.goto(target, { waitUntil: 'commit' })
  await page.evaluate(writeMeasurementsInPage, {
    dbName: DB_NAME,
    dbVersion: DB_VERSION,
    storeSessions: STORE_SESSIONS,
    storeMeasurements: STORE_MEASUREMENTS,
    storeExerciseMeta: STORE_EXERCISE_META,
    storeConfig: STORE_CONFIG,
    rows,
  })
  await page.goto(target, { waitUntil: 'networkidle' })

  return rows
}

function writeMeasurementsInPage({ dbName, dbVersion, storeSessions, storeMeasurements, storeExerciseMeta, storeConfig, rows }) {
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
      const db = req.result
      const tx = db.transaction(storeMeasurements, 'readwrite')
      const store = tx.objectStore(storeMeasurements)
      for (const row of rows) store.put(row)
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
