import { useEffect, useRef, useState } from 'react'
import { downloadBackupFile, exportBackup, getLastBackupAt, importBackup, saveLastBackupAt, wipeAll } from '../lib/db'
import { useStore } from '../lib/store'
import { Tile, useToast } from '../components/ui'
import { daysSince, fmt, fmtDate } from '../lib/calc'
import { MEASUREMENT_KEYS, MEASUREMENT_LABELS, MEASUREMENT_UNITS } from '../lib/plan'

export default function Settings() {
  const { config, saveConfig, reload, sessions, droppedSessionCount, measurements } = useStore()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [height, setHeight] = useState(String(config.heightCm))
  const [lastBackup, setLastBackup] = useState<number | null>(null)

  useEffect(() => {
    getLastBackupAt().then(v => setLastBackup(v ?? null))
  }, [])

  const doExport = async () => {
    const data = await exportBackup()
    downloadBackupFile(data)
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

      <div className="col-a">
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
          {/* Nunca se borra nada del disco: normalizeSession solo descarta
             de memoria lo que no puede leer, y esto avisa en vez de hacer
             desaparecer historial en silencio. Oculto cuando no hay nada
             que reportar. */}
          {droppedSessionCount > 0 && (
            <p className="hint" style={{ color: 'var(--alert)' }}>
              {droppedSessionCount === 1
                ? '1 sesión no se pudo leer.'
                : `${droppedSessionCount} sesiones no se pudieron leer.`}
            </p>
          )}
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
          <label htmlFor="pool" style={{ marginTop: 12 }}>Largo de la piscina (m)</label>
          <input
            id="pool" type="number" inputMode="decimal" step="0.5" defaultValue={config.poolLengthM}
            onBlur={e => {
              const v = Number(e.target.value)
              if (!Number.isNaN(v) && v > 0) saveConfig({ ...config, poolLengthM: v })
            }}
          />
          <p className="hint">
            Convierte los largos que cargas en la pantalla de natación a metros. Cambiarlo no reescribe el
            historial ya guardado.
          </p>
        </div>
      </div>

      <div className="col-a">
        <div className="section-title">Metas del bloque</div>
        <div className="card">
          <div className="formgrid">
            {MEASUREMENT_KEYS.map(k => (
              <div key={k}>
                <label htmlFor={`g-${k}`}>{MEASUREMENT_LABELS[k]} ({MEASUREMENT_UNITS[k]})</label>
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
      </div>

      <div className="col-b">
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
      </div>

      <p className="hint" style={{ textAlign: 'center', marginTop: 22 }}>
        FitPlan · bloque {fmtDate(config.blockStart)} – {fmtDate(config.blockEnd, true)}<br />
        Herramienta personal de seguimiento. No sustituye valoración médica ni nutricional.
      </p>
      {toast.node}
    </>
  )
}
