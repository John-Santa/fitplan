import { afterEach, describe, expect, it, vi } from 'vitest'
import { INSTALL_SNOOZE_MS, installMode, isIos, isSnoozed } from './install'
import { showUpdatePrompt } from './updatePolicy'
import { loadActiveDraft, saveActiveDraft } from '../../session/lib/activeSession'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'

describe('installMode', () => {
  const base = { hasPromptEvent: false, ios: false, standalone: false, snoozed: false }

  it('Android y escritorio: con el evento beforeinstallprompt ofrece instalar', () => {
    expect(installMode({ ...base, hasPromptEvent: true })).toBe('prompt')
  })

  it('iOS no tiene el evento: muestra instrucciones', () => {
    expect(installMode({ ...base, ios: true })).toBe('ios')
  })

  it('ya instalada, o descartada hace poco, no muestra nada', () => {
    expect(installMode({ ...base, hasPromptEvent: true, standalone: true })).toBe('none')
    expect(installMode({ ...base, ios: true, standalone: true })).toBe('none')
    expect(installMode({ ...base, hasPromptEvent: true, snoozed: true })).toBe('none')
    expect(installMode({ ...base, ios: true, snoozed: true })).toBe('none')
  })

  it('un navegador sin evento ni iOS no muestra nada', () => {
    expect(installMode(base)).toBe('none')
  })
})

describe('isIos', () => {
  it('reconoce iPhone y el iPad que se anuncia como Mac táctil, no un Mac ni Android', () => {
    expect(isIos(IPHONE)).toBe(true)
    expect(isIos(MAC, 5)).toBe(true)
    expect(isIos(MAC, 0)).toBe(false)
    expect(isIos(ANDROID, 5)).toBe(false)
  })
})

describe('isSnoozed', () => {
  it('"Ahora no" silencia el aviso durante 14 días', () => {
    const now = 1_800_000_000_000
    expect(isSnoozed(null, now)).toBe(false)
    expect(isSnoozed('basura', now)).toBe(false)
    expect(isSnoozed(String(now - 60_000), now)).toBe(true)
    expect(isSnoozed(String(now - INSTALL_SNOOZE_MS - 1), now)).toBe(false)
  })
})

describe('aviso de versión nueva y entrenamiento en curso', () => {
  afterEach(() => vi.unstubAllGlobals())

  const draft = {
    id: 's1', kind: 'strength', routineId: 'dia1', date: '2026-11-12', startedAt: 1, finishedAt: null, notes: '',
    sets: [{ exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 10, done: false }],
  }

  function stubStorage() {
    const data = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    })
  }

  it('sin versión nueva nunca se muestra', () => {
    expect(showUpdatePrompt(false, false)).toBe(false)
    expect(showUpdatePrompt(false, true)).toBe(false)
  })

  it('con una sesión activa guardada no interrumpe; al terminarla, aparece', () => {
    stubStorage()
    saveActiveDraft(draft as never)
    expect(showUpdatePrompt(true, loadActiveDraft() != null)).toBe(false)

    saveActiveDraft(null)
    expect(showUpdatePrompt(true, loadActiveDraft() != null)).toBe(true)
  })
})
