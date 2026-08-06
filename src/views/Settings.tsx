import { useEffect, useRef, useState } from 'react'
import { exportBackup, getLastBackupAt, importBackup, saveLastBackupAt, wipeAll } from '../lib/db'
import { useStore } from '../lib/store'
import { Tile, useToast } from '../components/ui'
import { daysSince, fmt, fmtDate } from '../lib/calc'

export default function Settings() {
  const { config, saveConfig, reload, sessions, measurements } = useStore()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [height, setHeight] = useState(String(config.heightCm))
  const [lastBackup, setLastBackup] = useState<number | null>(null)

  useEffect(() => {
    getLastBackupAt().then(v => setLastBackup(v ?? null))
  }, [])

  const doExport = async () => {
    const data = await exportBackup()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `fitplan-${data.exportedAt.slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    const now = Date.now()
    await saveLastBackupAt(now)
    setLastBackup(now)
    toast.show('Respaldo descargado')
  }

  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      await importBackup(data, 'replace')
      await reload()
      toast.show('Datos restaurados')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo leer el archivo')
    }
  }

  return (
    <>
      <div className="eyebrow">
        Bloque {fmtDate(config.blockStart)} – {fmtDate(config.blockEnd, true)}
      </div>
      <h1>Ajustes</h1>

      <div className="section-title">Tus datos</div>
      <div className="card">
        <p>
          Todo vive en <strong>este dispositivo</strong>, en la base de datos del navegador. No hay servidor, no hay
          cuenta y nadie más los ve. La contracara es que si borras los datos del navegador o cambias de teléfono, se
          van contigo solo si exportas.
        </p>
        <div className="tiles" style={{ marginTop: 12, marginBottom: 12 }}>
          <Tile label="Sesiones" value={sessions.length} dec={0} />
          <Tile label="Mediciones" value={measurements.length} dec={0} />
        </div>
        <div className="btnrow">
          <button className="primary" onClick={doExport}>Exportar respaldo</button>
          <button onClick={() => fileRef.current?.click()}>Restaurar</button>
          <input
            ref={fileRef} type="file" accept="application/json" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }}
          />
        </div>
        <p className="hint">
          {lastBackup != null && `La última fue hace ${daysSince(lastBackup)} días. `}
          Restaurar reemplaza todo lo que haya en este dispositivo.
        </p>
      </div>

      <div className="section-title">Configuración</div>
      <div className="card">
        <label htmlFor="h">Estatura (cm)</label>
        <input
          id="h" type="number" inputMode="decimal" step="0.5" value={height}
          onChange={e => setHeight(e.target.value)}
          onBlur={() => {
            const v = Number(height)
            if (!Number.isNaN(v) && v > 100) saveConfig({ ...config, heightCm: v })
          }}
        />
        <p className="hint">Se usa para el IMC, el FFMI y el índice cintura/estatura.</p>
        <div className="formgrid" style={{ marginTop: 12 }}>
          <div>
            <label>Inicio del bloque</label>
            <input type="date" value={config.blockStart} onChange={e => saveConfig({ ...config, blockStart: e.target.value })} />
          </div>
          <div>
            <label>Fin del bloque</label>
            <input type="date" value={config.blockEnd} onChange={e => saveConfig({ ...config, blockEnd: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="section-title">Metas de la semana 8</div>
      <div className="card">
        <div className="formgrid">
          {([
            ['weight', 'Peso (kg)'], ['fatPct', 'Grasa (%)'], ['fatMass', 'Masa grasa (kg)'],
            ['muscle', 'Músculo (kg)'], ['water', 'Agua (kg)'], ['waist', 'Cintura (cm)'],
            ['hip', 'Cadera (cm)'], ['chest', 'Pecho (cm)'], ['neck', 'Cuello (cm)'],
          ] as const).map(([k, label]) => (
            <div key={k}>
              <label htmlFor={`g-${k}`}>{label}</label>
              <input
                id={`g-${k}`} type="number" inputMode="decimal" step="0.1" defaultValue={fmt(config.goal[k]).replace(',', '.')}
                onBlur={e => {
                  const v = Number(e.target.value)
                  if (!Number.isNaN(v)) saveConfig({ ...config, goal: { ...config.goal, [k]: v } })
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="section-title alert">Zona de peligro</div>
      <div className="card">
        <button
          className="danger block"
          onClick={async () => {
            if (!confirm('Esto borra todas las sesiones y mediciones de este dispositivo. ¿Seguro?')) return
            if (!confirm('Última confirmación: no hay forma de deshacerlo sin un respaldo.')) return
            await wipeAll()
            location.reload()
          }}
        >
          Borrar todos los datos
        </button>
      </div>

      <p className="hint" style={{ textAlign: 'center', marginTop: 22 }}>
        FitPlan · bloque 4 ago – 28 sep 2026<br />
        Herramienta personal de seguimiento. No sustituye valoración médica ni nutricional.
      </p>
      {toast.node}
    </>
  )
}
