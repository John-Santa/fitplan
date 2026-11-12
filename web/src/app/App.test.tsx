import { describe, expect, it } from 'vitest'
import { appScreen } from './App'

describe('which screen the app shows', () => {
  it('a new install (no stored config) shows the welcome', () => {
    expect(appScreen({ ready: true, dbError: null, needsOnboarding: true })).toBe('welcome')
  })

  it('an existing install never shows the welcome', () => {
    expect(appScreen({ ready: true, dbError: null, needsOnboarding: false })).toBe('app')
  })

  it('keeps loading and database errors ahead of everything', () => {
    expect(appScreen({ ready: false, dbError: null, needsOnboarding: false })).toBe('loading')
    expect(appScreen({ ready: false, dbError: 'blocked', needsOnboarding: true })).toBe('error')
  })
})
