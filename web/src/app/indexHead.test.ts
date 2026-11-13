// Pins the installable-app metas in index.html: Chrome warns when only the
// Apple-prefixed one is present, and iOS still reads the Apple one.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8')

describe('index.html web-app metas', () => {
  it('declares the standard mobile-web-app-capable meta', () => {
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />')
  })

  it('keeps the Apple meta for iOS', () => {
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />')
  })
})
