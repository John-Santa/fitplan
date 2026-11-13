// Build-time helper (used by vite.config.ts, never shipped to the page).
//
// Workbox's generateSW puts `importScripts("sw-reminders.js")` before the
// precache and the SKIP_WAITING listener. If that import throws (a 404 that
// Render's `/*` rewrite answers with index.html, or an error inside the
// reminders code), the rest of the worker never runs: no precache, no offline,
// no update prompt. Reminders are optional, so the import is wrapped in a
// try/catch expression that keeps the rest of the worker working.

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Returns `source` with the one `importScripts("<file>")` call guarded.
 *  Throws when the call is not found exactly once, so a change in the
 *  generated worker fails the build instead of shipping an unguarded import. */
export function guardImportScripts(source: string, file: string): string {
  const call = new RegExp(`importScripts\\((["'])${escape(file)}\\1\\)`, 'g')
  const found = source.match(call)?.length ?? 0
  if (found !== 1) throw new Error(`expected one importScripts("${file}") in the service worker, found ${found}`)
  return source.replace(
    call,
    `(function(){try{importScripts(${JSON.stringify(file)})}catch(e){console.warn("${file} not loaded",e)}})()`,
  )
}
