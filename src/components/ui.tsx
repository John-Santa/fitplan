import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fmt, fmtSigned, mmss } from '../lib/calc'

export function Tile({
  label, value, unit, delta, deltaGood, progress, goalText, dec = 1, accent = false, testId,
}: {
  label: string
  value: number | null
  unit?: string
  delta?: number | null
  deltaGood?: 'lower' | 'higher'
  progress?: number
  goalText?: string
  dec?: number
  accent?: boolean
  /** Solo para el arnes de UI: un tile se identifica por posicion salvo que
   *  una verificacion necesite atarse a un VALOR (p. ej. MIX-01, que debe
   *  leer el volumen de fuerza sin depender de cuantos tiles se rendericen
   *  antes). Opcional, no afecta el render ni el estilo. */
  testId?: string
}) {
  let cls = 'flat'
  if (delta != null && Math.abs(delta) >= 0.05 && deltaGood) {
    const good = deltaGood === 'lower' ? delta < 0 : delta > 0
    cls = good ? 'up' : 'down'
  }
  return (
    <div className={accent ? 'tile accent' : 'tile'} data-testid={testId}>
      <div className="label">{label}</div>
      <div className="value num">
        {fmt(value, dec)} {unit && <span>{unit}</span>}
      </div>
      {delta != null && (
        <div className={`delta ${cls} num`}>
          {fmtSigned(delta, dec)} {unit} vs inicio
        </div>
      )}
      {progress != null && (
        <div className="bar">
          <i style={{ width: `${Math.max(0, Math.min(100, Math.round(progress)))}%` }} />
        </div>
      )}
      {goalText && <div className="delta flat" style={{ fontWeight: 500 }}>{goalText}</div>}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p className="muted" style={{ maxWidth: '38ch', margin: '0 auto' }}>{children}</p>}
    </div>
  )
}

export function Check({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {on ? <polyline points="20 6 9 17 4 12" /> : <circle cx="12" cy="12" r="8" strokeWidth={2} />}
    </svg>
  )
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const t = useRef<number | undefined>(undefined)
  const show = (m: string) => {
    setMsg(m)
    window.clearTimeout(t.current)
    t.current = window.setTimeout(() => setMsg(null), 2600)
  }
  const node = msg ? <div className="toast">{msg}</div> : null
  return { show, node }
}

/** Cuenta regresiva de descanso. Vibra y suena al terminar. */
export function RestTimer({ seconds, onDone, onClose }: { seconds: number; onDone: () => void; onClose: () => void }) {
  const [left, setLeft] = useState(seconds)
  const fired = useRef(false)
  useEffect(() => {
    setLeft(seconds)
    fired.current = false
  }, [seconds])
  useEffect(() => {
    const id = window.setInterval(() => setLeft(v => v - 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    if (left <= 0 && !fired.current) {
      fired.current = true
      try {
        navigator.vibrate?.([180, 90, 180])
      } catch { /* el navegador puede no soportarlo */ }
      beep()
      onDone()
    }
  }, [left, onDone])
  return (
    <div className="timer" role="timer" aria-live="polite">
      <div>
        <div className="lbl">{left > 0 ? 'Descanso' : 'Listo, siguiente serie'}</div>
        <div className="t">{mmss(left)}</div>
      </div>
      <div className="spacer grow" />
      <button onClick={() => setLeft(v => v + 30)}>+30 s</button>
      <button onClick={onClose}>Saltar</button>
    </div>
  )
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.frequency.value = 880
    g.gain.setValueAtTime(0.001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    o.start()
    o.stop(ctx.currentTime + 0.5)
    setTimeout(() => ctx.close(), 800)
  } catch { /* audio bloqueado por el navegador */ }
}
