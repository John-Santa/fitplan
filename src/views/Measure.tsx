import { useState } from 'react'
import type { Measurement } from '../types'
import { derive, fmt, fmtDate, progressPct, todayISO } from '../lib/calc'
import { useDerivedMeasurements, useStore } from '../lib/store'
import Chart, { type Series } from '../components/Chart'
import { Tile, useToast } from '../components/ui'

const CAMPOS: { k: keyof Omit<Measurement, 'date'>; label: string; unit: string; step: string }[] = [
  { k: 'weight', label: 'Peso', unit: 'kg', step: '0.1' },
  { k: 'fatPct', label: 'Grasa', unit: '%', step: '0.1' },
  { k: 'fatMass', label: 'Masa grasa', unit: 'kg', step: '0.1' },
  { k: 'muscle', label: 'Músculo', unit: 'kg', step: '0.1' },
  { k: 'water', label: 'Agua', unit: 'kg', step: '0.1' },
  { k: 'waist', label: 'Cintura', unit: 'cm', step: '0.5' },
  { k: 'hip', label: 'Cadera', unit: 'cm', step: '0.5' },
  { k: 'chest', label: 'Pecho', unit: 'cm', step: '0.5' },
  { k: 'neck', label: 'Cuello', unit: 'cm', step: '0.5' },
]

export default function Measure() {
  const { config, saveMeasurement, deleteMeasurement } = useStore()
  const rows = useDerivedMeasurements()
  const toast = useToast()
  const [form, setForm] = useState<Record<string, string>>({ date: todayISO() })
  const [showForm, setShowForm] = useState(false)

  const base = rows[0]
  const last = rows[rows.length - 1]
  const goal = derive({ date: config.blockEnd, ...config.goal }, config.heightCm)

  const submit = async () => {
    const weight = Number(form.weight)
    if (!form.date || !form.weight || Number.isNaN(weight)) {
      toast.show('Faltan la fecha o el peso')
      return
    }
    const m: Measurement = { date: form.date, weight }
    CAMPOS.forEach(c => {
      if (c.k === 'weight') return
      const v = Number(form[c.k])
      if (form[c.k] !== '' && form[c.k] != null && !Number.isNaN(v)) (m as any)[c.k] = v
    })
    await saveMeasurement(m)
    setForm({ date: todayISO() })
    setShowForm(false)
    toast.show('Medición guardada')
  }

  const serie = (key: keyof typeof goal, label: string, color: string): Series => ({
    key: String(key),
    label,
    color,
    goal: (goal[key] as number | null) ?? null,
    points: rows
      .filter(r => r[key] != null)
      .map(r => ({ x: r.date, y: r[key] as number })),
  })

  return (
    <>
      {base && last && (
        <div className="tiles">
          <Tile label="Peso" value={last.weight} unit="kg" delta={last.weight - base.weight} deltaGood="lower"
            progress={progressPct(last.weight, base.weight, config.goal.weight)}
            goalText={`meta ${fmt(config.goal.weight)} kg`} />
          <Tile label="Masa grasa" value={last.fatMass ?? null} unit="kg"
            delta={last.fatMass != null && base.fatMass != null ? last.fatMass - base.fatMass : null} deltaGood="lower"
            progress={last.fatMass != null && base.fatMass != null ? progressPct(last.fatMass, base.fatMass, config.goal.fatMass) : undefined}
            goalText={`meta ${fmt(config.goal.fatMass)} kg`} />
          <Tile label="Músculo" value={last.muscle ?? null} unit="kg"
            delta={last.muscle != null && base.muscle != null ? last.muscle - base.muscle : null} deltaGood="higher"
            progress={last.muscle != null && base.muscle != null ? progressPct(last.muscle, base.muscle, config.goal.muscle) : undefined}
            goalText={`meta ${fmt(config.goal.muscle)} kg`} />
          <Tile label="Ratio músculo/grasa" value={last.ratio} dec={2}
            delta={last.ratio != null && base.ratio != null ? last.ratio - base.ratio : null} deltaGood="higher"
            progress={last.ratio != null && base.ratio != null && goal.ratio != null ? progressPct(last.ratio, base.ratio, goal.ratio) : undefined}
            goalText={`meta ${fmt(goal.ratio, 2)}`} />
          <Tile label="Cintura" value={last.waist ?? null} unit="cm"
            delta={last.waist != null && base.waist != null ? last.waist - base.waist : null} deltaGood="lower"
            progress={last.waist != null && base.waist != null ? progressPct(last.waist, base.waist, config.goal.waist) : undefined}
            goalText={`meta ${fmt(config.goal.waist)} cm`} />
          <Tile label="FFMI" value={last.ffmi} dec={1}
            delta={last.ffmi != null && base.ffmi != null ? last.ffmi - base.ffmi : null} deltaGood="higher" />
        </div>
      )}

      <div className="card warn tight" style={{ marginTop: 12 }}>
        <strong>Cómo medir</strong>
        <p style={{ margin: '2px 0 0', fontSize: 13.5 }}>
          En la mañana, en ayunas, después de ir al baño, antes de entrenar y antes de tomar agua. Nunca después de
          nadar: la bioimpedancia deduce la grasa a partir del agua, así que deshidratado te va a decir que subiste.
          Cada dos semanas, no cada día.
        </p>
      </div>

      {!showForm ? (
        <button className="primary big block" style={{ marginTop: 12 }} onClick={() => setShowForm(true)}>
          Nueva medición
        </button>
      ) : (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="formgrid">
            <div>
              <label htmlFor="f-date">Fecha</label>
              <input id="f-date" type="date" value={form.date ?? ''} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            {CAMPOS.map(c => (
              <div key={c.k}>
                <label htmlFor={`f-${c.k}`}>{c.label} ({c.unit})</label>
                <input
                  id={`f-${c.k}`} type="number" inputMode="decimal" step={c.step}
                  value={form[c.k] ?? ''} onChange={e => setForm({ ...form, [c.k]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="btnrow" style={{ marginTop: 12 }}>
            <button className="primary grow" onClick={submit}>Guardar</button>
            <button className="ghost" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
          <p className="hint">Si dejas un campo vacío, esa fila simplemente no lo grafica. Fecha y peso son obligatorios.</p>
        </div>
      )}

      <div className="section-title">Composición</div>
      <figure>
        <div className="chart-title">Masa grasa y masa muscular</div>
        <div className="chart-sub">Las dos líneas deberían separarse: la naranja baja, la azul se sostiene o sube</div>
        <Chart
          series={[serie('muscle', 'Músculo', 'var(--s1)'), serie('fatMass', 'Masa grasa', 'var(--s2)')]}
          unit="kg" height={240} xLabel={x => fmtDate(x)}
        />
      </figure>
      <figure>
        <div className="chart-title">Cintura</div>
        <div className="chart-sub">El número que más rápido responde y el que mejor refleja la grasa visceral</div>
        <Chart series={[serie('waist', 'Cintura', 'var(--s1)')]} unit="cm" height={200} xLabel={x => fmtDate(x)} />
      </figure>

      <div className="section-title">Historial</div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th><th>Peso</th><th>% grasa</th><th>M. grasa</th><th>Músculo</th>
              <th>M. magra</th><th>Ratio</th><th>FFMI</th><th>IMC</th><th>Agua</th>
              <th>Cintura</th><th>Cadera</th><th>Pecho</th><th>Cuello</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.date} className={i === 0 ? 'base' : undefined}>
                <td>{fmtDate(r.date, true)}{i === 0 ? ' · inicio' : ''}</td>
                <td className="num">{fmt(r.weight)}</td>
                <td className="num">{fmt(r.fatPct)}</td>
                <td className="num">{fmt(r.fatMass)}</td>
                <td className="num">{fmt(r.muscle)}</td>
                <td className="num">{fmt(r.leanMass)}</td>
                <td className="num">{fmt(r.ratio, 2)}</td>
                <td className="num">{fmt(r.ffmi)}</td>
                <td className="num">{fmt(r.bmi)}</td>
                <td className="num">{fmt(r.water)}</td>
                <td className="num">{fmt(r.waist)}</td>
                <td className="num">{fmt(r.hip)}</td>
                <td className="num">{fmt(r.chest)}</td>
                <td className="num">{fmt(r.neck)}</td>
                <td>
                  {i > 0 && (
                    <button
                      className="ghost" style={{ padding: '2px 8px', fontSize: 15, border: 'none' }}
                      aria-label={`Eliminar medición del ${r.date}`}
                      onClick={() => { if (confirm('¿Eliminar esta medición?')) deleteMeasurement(r.date) }}
                    >×</button>
                  )}
                </td>
              </tr>
            ))}
            <tr className="goal">
              <td>Meta sem 8</td>
              <td className="num">{fmt(goal.weight)}</td>
              <td className="num">{fmt(goal.fatPct)}</td>
              <td className="num">{fmt(goal.fatMass)}</td>
              <td className="num">{fmt(goal.muscle)}</td>
              <td className="num">{fmt(goal.leanMass)}</td>
              <td className="num">{fmt(goal.ratio, 2)}</td>
              <td className="num">{fmt(goal.ffmi)}</td>
              <td className="num">{fmt(goal.bmi)}</td>
              <td className="num">{fmt(goal.water)}</td>
              <td className="num">{fmt(goal.waist)}</td>
              <td className="num">{fmt(goal.hip)}</td>
              <td className="num">{fmt(goal.chest)}</td>
              <td className="num">{fmt(goal.neck)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint">
        <strong>Ratio</strong> es kilos de músculo por kilo de grasa: el mejor resumen de si estás recomponiendo o solo
        adelgazando. <strong>FFMI</strong> es masa magra corregida por estatura: 18–20 es no entrenado, 22–24 entrenado natural.
      </p>
      {toast.node}
    </>
  )
}
