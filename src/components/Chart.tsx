import { useMemo, useState } from 'react'
import { fmt } from '../lib/calc'

export interface Series {
  key: string
  label: string
  color: string
  goal?: number | null
  points: { x: string; y: number }[]
}

interface Props {
  series: Series[]
  unit: string
  height?: number
  /** Formatea la etiqueta del eje x. */
  xLabel?: (x: string) => string
}

/**
 * Grafica de lineas en SVG. Un solo eje siempre; si hay dos o mas series
 * se dibuja leyenda, y la ultima marca de cada serie lleva etiqueta directa.
 */
export default function Chart({ series, unit, height = 240, xLabel = x => x }: Props) {
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null)
  const W = 700
  const H = height
  const M = { t: series.length > 1 ? 26 : 14, r: 46, b: 28, l: 42 }
  const iw = W - M.l - M.r
  const ih = H - M.t - M.b

  const xs = useMemo(() => {
    const set = new Set<string>()
    series.forEach(s => s.points.forEach(p => set.add(p.x)))
    return Array.from(set).sort()
  }, [series])

  const values = series.flatMap(s => s.points.map(p => p.y)).concat(
    series.flatMap(s => (s.goal != null ? [s.goal] : [])),
  )

  if (!xs.length || !values.length) {
    return (
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sin datos">
        <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={14} fill="var(--ink-3)" fontFamily="system-ui">
          Sin datos todavía
        </text>
      </svg>
    )
  }

  let lo = Math.min(...values)
  let hi = Math.max(...values)
  const pad = Math.max((hi - lo) * 0.18, Math.abs(hi) * 0.02, 1)
  lo -= pad
  hi += pad

  const xi = (x: string) => xs.indexOf(x)
  const X = (i: number) => M.l + (xs.length <= 1 ? iw / 2 : (i / (xs.length - 1)) * iw)
  const Y = (v: number) => M.t + ((hi - v) / (hi - lo)) * ih

  const ticks = [0, 1, 2, 3, 4].map(k => lo + ((hi - lo) * k) / 4)
  const maxXLabels = 6
  const step = Math.max(1, Math.ceil(xs.length / maxXLabels))

  return (
    <div style={{ position: 'relative' }}>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={series.map(s => s.label).join(' y ')}
        onMouseLeave={() => setTip(null)}
      >
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={M.l} x2={M.l + iw} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" strokeWidth={1} />
            <text x={M.l - 7} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)" fontFamily="system-ui">
              {fmt(v)}
            </text>
          </g>
        ))}
        <line x1={M.l} x2={M.l + iw} y1={M.t + ih} y2={M.t + ih} stroke="var(--axis)" strokeWidth={1} />

        {xs.map((x, i) =>
          i % step === 0 || i === xs.length - 1 ? (
            <text key={x} x={X(i)} y={M.t + ih + 17} textAnchor="middle" fontSize={11} fill="var(--ink-3)" fontFamily="system-ui">
              {xLabel(x)}
            </text>
          ) : null,
        )}

        {series.length > 1 &&
          series.map((s, i) => {
            const lx = M.l + i * 118
            return (
              <g key={s.key}>
                <rect x={lx} y={2} width={10} height={10} rx={2.5} fill={s.color} />
                <text x={lx + 15} y={11} fontSize={12} fill="var(--ink-2)" fontFamily="system-ui">
                  {s.label}
                </text>
              </g>
            )
          })}

        {series.map(s =>
          s.goal != null ? (
            <g key={s.key + '-goal'}>
              <line
                x1={M.l} x2={M.l + iw} y1={Y(s.goal)} y2={Y(s.goal)}
                stroke={s.color} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.6}
              />
              <text x={M.l + 6} y={Y(s.goal) - 5} fontSize={11} fontWeight={600} fill={s.color} fontFamily="system-ui">
                meta {fmt(s.goal)}
              </text>
            </g>
          ) : null,
        )}

        {series.map(s => {
          const pts = s.points.slice().sort((a, b) => (a.x < b.x ? -1 : 1))
          if (!pts.length) return null
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(xi(p.x))},${Y(p.y)}`).join('')
          const last = pts[pts.length - 1]
          return (
            <g key={s.key}>
              {pts.length > 1 && (
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              )}
              {pts.map(p => (
                <circle
                  key={p.x}
                  cx={X(xi(p.x))} cy={Y(p.y)} r={5}
                  fill={s.color} stroke="var(--surface-1)" strokeWidth={2}
                  onMouseEnter={e =>
                    setTip({
                      x: e.clientX,
                      y: e.clientY,
                      html: `${xLabel(p.x)} · ${s.label}: ${fmt(p.y)} ${unit}`,
                    })
                  }
                  onMouseLeave={() => setTip(null)}
                />
              ))}
              <text
                x={X(xi(last.x)) + 9} y={Y(last.y) + 4}
                fontSize={12.5} fontWeight={700} fill="var(--ink-1)" fontFamily="system-ui"
              >
                {fmt(last.y)}
              </text>
            </g>
          )
        })}
      </svg>
      {tip && (
        <div
          style={{
            position: 'fixed', left: Math.min(tip.x + 12, window.innerWidth - 190), top: tip.y - 46,
            background: 'var(--surface-1)', border: '1px solid var(--ring)', borderRadius: 8,
            padding: '6px 10px', fontSize: 13, pointerEvents: 'none', zIndex: 70,
            boxShadow: '0 4px 14px rgba(0,0,0,.18)', whiteSpace: 'nowrap',
          }}
        >
          {tip.html}
        </div>
      )}
    </div>
  )
}
