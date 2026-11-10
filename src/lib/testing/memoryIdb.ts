// IndexedDB en memoria para probar db.ts en el entorno node de vitest.
// Cubre solo lo que usa db.ts: open con upgrade, get, getAll, put, clear y
// delete sobre almacenes con keyPath o con llaves externas. Es un doble de
// prueba, no una implementacion fiel: sin indices, sin versiones, sin
// transacciones reales.
type Row = unknown
interface Store {
  keyPath?: string
  rows: Map<unknown, Row>
}

export interface MemoryIdb {
  /** Contenido actual de un almacen (copia), para inspeccionar en pruebas. */
  dump(store: string): Map<unknown, Row>
  /** Hace fallar cada `put` para el que `predicate(almacen, llave)` sea true
   *  (simula cuota llena o escritura interrumpida). null = sin fallos. */
  failPuts(predicate: ((store: string, key: unknown) => boolean) | null): void
}

interface FakeRequest<T> {
  result?: T
  error?: unknown
  onsuccess?: () => void
  onerror?: () => void
}

/** Instala un `indexedDB` global vacio y devuelve su control. Llamarlo antes
 *  de importar db.ts (que guarda la conexion en una variable de modulo) y
 *  combinarlo con vi.resetModules() para empezar de cero en cada prueba. */
export function installMemoryIdb(): MemoryIdb {
  const stores: Record<string, Store> = {}
  let shouldFail: ((store: string, key: unknown) => boolean) | null = null

  // Resuelve en una microtarea diferida, como el IndexedDB real: el llamador
  // asigna onsuccess/onerror despues de recibir la peticion.
  function request<T>(run: () => T): FakeRequest<T> {
    const r: FakeRequest<T> = {}
    setTimeout(() => {
      try {
        r.result = run()
        r.onsuccess?.()
      } catch (e) {
        r.error = e
        r.onerror?.()
      }
    })
    return r
  }

  const database = {
    objectStoreNames: { contains: (name: string) => name in stores },
    createObjectStore(name: string, opts?: { keyPath?: string }) {
      stores[name] = { keyPath: opts?.keyPath, rows: new Map() }
      return { createIndex() {} }
    },
    onversionchange: null as null | (() => void),
    transaction(name: string) {
      return {
        objectStore() {
          const s = stores[name]
          return {
            get: (k: unknown) => request(() => structuredClone(s.rows.get(k))),
            getAll: () => request(() => [...s.rows.values()].map(v => structuredClone(v))),
            put: (v: unknown, k?: unknown) =>
              request(() => {
                const key = s.keyPath ? (v as Record<string, unknown>)[s.keyPath] : k
                if (shouldFail?.(name, key)) throw new Error('QuotaExceededError')
                s.rows.set(key, structuredClone(v))
                return key
              }),
            clear: () => request(() => void s.rows.clear()),
            delete: (k: unknown) => request(() => void s.rows.delete(k)),
          }
        },
      }
    },
  }

  ;(globalThis as Record<string, unknown>).indexedDB = {
    open() {
      const r: Record<string, unknown> = {}
      setTimeout(() => {
        r.result = database
        ;(r.onupgradeneeded as (() => void) | undefined)?.()
        ;(r.onsuccess as () => void)()
      })
      return r
    },
  }

  return {
    dump: name => new Map(stores[name]?.rows ?? []),
    failPuts: predicate => {
      shouldFail = predicate
    },
  }
}
