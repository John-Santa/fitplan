import { useState } from 'react'
import { downloadBackupFile, exportBackup } from '../lib/db'

/** Pantalla de error de pagina completa, sin depender de la tienda ni de
 *  ningun contexto de React: la usan tanto App.tsx (P0-1, cuando la base de
 *  datos no pudo abrirse) como ErrorBoundary (P0-2, cuando un render
 *  revento). En ambos casos la persona duena de los datos ve exactamente lo
 *  mismo que veria una perdida de datos si no fuera por el boton de acá:
 *  un mensaje real y una salida para exportar un respaldo. */
export function ErrorScreen({ title, message }: { title: string; message: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle')
  const [exportError, setExportError] = useState<string | null>(null)

  const doExport = async () => {
    setState('idle')
    setExportError(null)
    try {
      const data = await exportBackup()
      downloadBackupFile(data)
      setState('done')
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'No se pudo exportar el respaldo.')
      setState('error')
    }
  }

  return (
    <div className="app">
      <main className="main">
        <h1>{title}</h1>
        <div className="card warn">
          <p>{message}</p>
          <div className="btnrow">
            <button className="primary" onClick={doExport}>Exportar respaldo</button>
            <button onClick={() => location.reload()}>Recargar</button>
          </div>
          {state === 'done' && (
            <p className="hint">Respaldo descargado. Revisa la carpeta de descargas de tu navegador.</p>
          )}
          {state === 'error' && exportError && <p className="hint">{exportError}</p>}
        </div>
      </main>
    </div>
  )
}
