// IndexedDB en memoria para probar db.ts en el entorno node de vitest.
// Cubre solo lo que usa db.ts: open con upgrade, get, getAll, put, clear y
// delete sobre almacenes con keyPath o con llaves externas. Es un doble de
// prueba, no una implementacion fiel: sin indices, sin versiones. Las
// transacciones de un solo almacen (transaction('x')) no hacen rollback, pero
// las de un mismo almacen corren en fila, en orden de creacion, y avisan
// oncomplete al quedar sin peticiones pendientes; las
// de varios almacenes (transaction(['x', 'y'])) si: si una peticion falla se
// restauran los almacenes (rollback) y se dispara onabort; si todas terminan,
// oncomplete.
type Row = unknown
interface Store {
  keyPath?: string
  rows: Map<unknown, Row>
}

export interface MemoryIdb {
  /** Contenido actual de un almacen (copia), para inspeccionar en pruebas. */
  dump(store: string, dbName?: string): Map<unknown, Row>
  /** Hace fallar cada `put` para el que `predicate(almacen, llave)` sea true
   *  (simula cuota llena o escritura interrumpida). null = sin fallos. */
  failPuts(predicate: ((store: string, key: unknown) => boolean) | null): void
  /** Calls `hook(almacen, llave)` each time a `get` reads a row, before its
   *  result reaches the caller: lets a test issue another write (a remote
   *  apply) right between a read and the write that follows it. null = off. */
  onGet(hook: ((store: string, key: unknown) => void) | null): void
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
  // Una coleccion de almacenes por nombre de base: 'fitplan' y
  // 'magnifit-sync' no se pisan aunque compartan nombres de almacen.
  const databases: Record<string, Record<string, Store>> = {}
  let shouldFail: ((store: string, key: unknown) => boolean) | null = null
  let onGet: ((store: string, key: unknown) => void) | null = null

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

  // Transaccion sobre varios almacenes con rollback completo ante un fallo.
  function makeAtomicTransaction(stores: Record<string, Store>, names: string[]) {
    const snapshot = new Map(names.map(n => [n, new Map(stores[n].rows)]))
    let pending = 0
    let finished = false
    const t: {
      error?: unknown
      oncomplete?: () => void
      onabort?: () => void
      abort(): void
      objectStore(name: string): unknown
    } = {
      abort() {
        if (finished) throw new Error('InvalidStateError')
        finished = true
        for (const [n, rows] of snapshot) stores[n].rows = new Map(rows)
        setTimeout(() => t.onabort?.())
      },
      objectStore(name: string) {
        const s = stores[name]
        const op = <R>(run: () => R): FakeRequest<R> => {
          const r: FakeRequest<R> = {}
          pending++
          setTimeout(() => {
            pending--
            if (finished) {
              r.error = new Error('AbortError')
              r.onerror?.()
              return
            }
            try {
              r.result = run()
              r.onsuccess?.()
            } catch (e) {
              r.error = e
              t.error = e
              r.onerror?.()
              t.abort()
              return
            }
            setTimeout(() => {
              if (!finished && pending === 0) {
                finished = true
                t.oncomplete?.()
              }
            })
          })
          return r
        }
        return {
          put: (v: unknown, k?: unknown) =>
            op(() => {
              const key = s.keyPath ? (v as Record<string, unknown>)[s.keyPath] : k
              if (shouldFail?.(name, key)) throw new Error('QuotaExceededError')
              s.rows.set(key, structuredClone(v))
              return key
            }),
          clear: () => op(() => void s.rows.clear()),
          delete: (k: unknown) => op(() => void s.rows.delete(k)),
        }
      },
    }
    return t
  }

  // Single-store transactions on the same store run one after another, in
  // the order they were created, like IndexedDB does for overlapping scopes:
  // a write issued while another transaction is open waits until that one
  // completes. A transaction completes once it has no pending request left.
  const queues = new Map<Store, Promise<void>>()

  function makeSerialTransaction(name: string, s: Store) {
    const previous = queues.get(s) ?? Promise.resolve()
    let release!: () => void
    queues.set(s, new Promise<void>(r => (release = r)))
    let started = false
    let finished = false
    let pending = 0
    const waiting: (() => void)[] = []
    const t: { oncomplete?: () => void; objectStore(): unknown } = { objectStore: () => store }
    const finishIfIdle = () => {
      if (finished || pending > 0) return
      finished = true
      t.oncomplete?.()
      release()
    }
    void previous.then(() => {
      started = true
      waiting.splice(0).forEach(run => run())
      setTimeout(finishIfIdle)
    })
    const op = <R>(run: () => R): FakeRequest<R> => {
      // A request on a transaction that already completed runs on its own,
      // as before this queue existed (real IndexedDB would throw).
      if (finished) return request(run)
      const r: FakeRequest<R> = {}
      pending++
      const exec = () =>
        setTimeout(() => {
          try {
            r.result = run()
            r.onsuccess?.()
          } catch (e) {
            r.error = e
            r.onerror?.()
          }
          pending--
          setTimeout(finishIfIdle)
        })
      if (started) exec()
      else waiting.push(exec)
      return r
    }
    const store = {
      get: (k: unknown) =>
        op(() => {
          const v = structuredClone(s.rows.get(k))
          onGet?.(name, k)
          return v
        }),
      getAll: () => op(() => [...s.rows.values()].map(v => structuredClone(v))),
      put: (v: unknown, k?: unknown) =>
        op(() => {
          const key = s.keyPath ? (v as Record<string, unknown>)[s.keyPath] : k
          if (shouldFail?.(name, key)) throw new Error('QuotaExceededError')
          s.rows.set(key, structuredClone(v))
          return key
        }),
      clear: () => op(() => void s.rows.clear()),
      delete: (k: unknown) => op(() => void s.rows.delete(k)),
    }
    return t
  }

  const makeDatabase = (stores: Record<string, Store>) => ({
    objectStoreNames: { contains: (name: string) => name in stores },
    createObjectStore(name: string, opts?: { keyPath?: string }) {
      stores[name] = { keyPath: opts?.keyPath, rows: new Map() }
      return { createIndex() {} }
    },
    onversionchange: null as null | (() => void),
    transaction(name: string | string[]) {
      if (Array.isArray(name)) return makeAtomicTransaction(stores, name)
      return makeSerialTransaction(name, stores[name])
    },
  })

  ;(globalThis as Record<string, unknown>).indexedDB = {
    open(name: string) {
      const r: Record<string, unknown> = {}
      setTimeout(() => {
        r.result = makeDatabase((databases[name] ??= {}))
        ;(r.onupgradeneeded as (() => void) | undefined)?.()
        ;(r.onsuccess as () => void)()
      })
      return r
    },
  }

  return {
    dump: (name, dbName) => {
      const owner = dbName ? databases[dbName] : Object.values(databases).find(d => name in d)
      return new Map(owner?.[name]?.rows ?? [])
    },
    failPuts: predicate => {
      shouldFail = predicate
    },
    onGet: hook => {
      onGet = hook
    },
  }
}
