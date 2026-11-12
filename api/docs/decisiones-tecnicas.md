# Decisiones técnicas (API)

ADRs cortos. Formato: contexto, decisión, consecuencias.

## ADR-1: Monorepo en lugar de polyrepo

- **Contexto:** la API, el front (`web/`) y el despliegue (`deploy/`) cambian juntos: un cambio de contrato toca `api/openapi.yaml`, los tipos generados del front y a veces variables de entorno.
- **Decisión:** un solo repositorio con `api/`, `web/` y `deploy/`, cada uno con su propio toolchain y workflow de CI filtrado por ruta.
- **Consecuencias:** un PR puede cambiar contrato y cliente a la vez; el historial es único. A cambio, los workflows deben filtrar por ruta para no correr todo en cada cambio.

## ADR-2: Hexagonal, organizado por capa

- **Contexto:** el dominio es pequeño (un contexto, sync) pero debe crecer sin reescribir. Seguimos el layout de hermes (icaro).
- **Decisión:** `internal/{domain,port,usecase,adapter,platform}` con dependencias hacia adentro. `domain` solo usa la librería estándar (lo impone depguard en `.golangci.yml`); los casos de uso declaran interfaces estrechas del lado del consumidor (`ChangeReader`, `ChangeApplier`); el cableado es manual en `cmd/magnifit-api`.
- **Consecuencias:** cada adaptador se prueba con fakes y Postgres real solo en los tests de integración. Organizar por capa (no por feature) es más simple con un solo contexto; si aparecen varios, cada capa se subdivide por contexto (`domain/sync`, `usecase/sync`, ...), como ya se hace.

## ADR-3: goose en lugar de golang-migrate

- **Contexto:** las migraciones se aplican al arrancar, y en Render pueden arrancar varias instancias a la vez.
- **Decisión:** goose v3 con `Provider`, migraciones SQL embebidas (`migrations/`) y `PostgresSessionLocker` (advisory lock de sesión).
- **Consecuencias:** arranques concurrentes migran de a uno (lo prueba `TestConcurrentMigrateSerializes`); un solo binario sin archivos externos. golang-migrate se descartó para no cambiar una pieza ya verificada; no aporta nada que falte aquí.

## ADR-4: Errores como problem+json (RFC 7807)

- **Contexto:** antes los errores eran `{"error": "..."}`, un formato propio.
- **Decisión:** todo error responde `application/problem+json` con `type` (`about:blank`), `title` (texto del status HTTP), `status` y `detail`. Las validaciones conservan en `detail` el mensaje con la ruta del campo (`documents[0].kind: ...`). Los 500 son opacos.
- **Consecuencias:** formato estándar y descrito en `openapi.yaml`. Cambio de contrato: el front debe leer `detail` en lugar de `error`.

## ADR-5: Sync offline-first con cursor `rev`, LWW y clamp

- **Contexto:** IndexedDB es la fuente de verdad en el dispositivo; el servidor guarda y reparte cambios entre dispositivos.
- **Decisión:** cada escritura asigna un `rev` global monotónico; el pull devuelve `rev > since` paginado por `rev` (snapshot REPEATABLE READ). El push aplica last-write-wins por registro según `updatedAt`, con lápidas (`deletedAt`) y un advisory lock por usuario para que los `rev` de un usuario se confirmen en orden. Los `updatedAt`/`deletedAt` más allá de ahora + 10 minutos se recortan (clamp) en vez de rechazarse.
- **Consecuencias:** un cliente solo necesita guardar su cursor. Un reloj adelantado no puede fijar un registro para siempre. LWW puede perder una edición concurrente del mismo registro; es aceptable para datos de un solo usuario.

## ADR-6: Clerk solo con Bearer

- **Contexto:** el front y la API viven en subdominios distintos (`app.magnifit.co`, `api.magnifit.co`); el SDK de Go v2 de Clerk no autentica por cookie.
- **Decisión:** el front envía `Authorization: Bearer <token de sesión>`; la API lo verifica con `clerkhttp.WithHeaderAuthorization`, exige `azp` dentro de `ALLOWED_ORIGINS` cuando la lista está definida y usa el `sub` como id de usuario. Un token ausente o inválido responde 401 problem+json con `WWW-Authenticate`.
- **Consecuencias:** sin cookies no hay CSRF que mitigar y CORS no necesita credenciales. El front debe pedir el token (`getToken()`) en cada llamada y manejar `ClerkOfflineError` sin conexión.
