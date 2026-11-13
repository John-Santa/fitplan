import { describe, expect, it } from 'vitest'
import { guardImportScripts } from './swImportGuard'

// Shape of the worker Workbox's generateSW emits (minified, comma expression).
const generated =
  'define(["./workbox-abc"],function(e){"use strict";importScripts("sw-reminders.js"),' +
  'self.addEventListener("message",e=>{e.data&&"SKIP_WAITING"===e.data.type&&self.skipWaiting()}),' +
  'e.precacheAndRoute([{url:"index.html",revision:"1"}],{})});'

/** Runs a worker source with a failing importScripts and reports what the
 *  rest of the worker still registered. */
function run(source: string) {
  const listeners: string[] = []
  const precached: unknown[] = []
  const self = { addEventListener: (type: string) => void listeners.push(type), skipWaiting: () => {} }
  const workbox = { precacheAndRoute: (entries: unknown[]) => void precached.push(...entries) }
  const define = (_deps: string[], factory: (wb: typeof workbox) => void) => factory(workbox)
  const importScripts = () => {
    // What a 404 rewritten to index.html (wrong MIME type) does in a worker.
    throw new Error('NetworkError: Failed to execute importScripts')
  }
  new Function('self', 'define', 'importScripts', source)(self, define, importScripts)
  return { listeners, precached }
}

describe('guardImportScripts', () => {
  it('without the guard a failed reminders import drops the precache and the SKIP_WAITING listener', () => {
    expect(() => run(generated)).toThrow(/NetworkError/)
  })

  it('a failed reminders import keeps the precache and the SKIP_WAITING listener', () => {
    const { listeners, precached } = run(guardImportScripts(generated, 'sw-reminders.js'))
    expect(listeners).toEqual(['message'])
    expect(precached).toEqual([{ url: 'index.html', revision: '1' }])
  })

  it('still imports the reminders script when it loads', () => {
    let imported: string | null = null
    const source = guardImportScripts(generated, 'sw-reminders.js')
    new Function('self', 'define', 'importScripts', source)(
      { addEventListener: () => {} },
      (_d: string[], f: (wb: unknown) => void) => f({ precacheAndRoute: () => {} }),
      (url: string) => { imported = url },
    )
    expect(imported).toBe('sw-reminders.js')
  })

  it('fails the build when the import is not found exactly once', () => {
    expect(() => guardImportScripts('define([],function(){})', 'sw-reminders.js')).toThrow(/sw-reminders\.js/)
    expect(() => guardImportScripts(generated + generated, 'sw-reminders.js')).toThrow(/sw-reminders\.js/)
  })
})
