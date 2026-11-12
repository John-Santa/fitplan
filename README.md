# MagniFit

Training and body-composition log with an editable plan. Offline-first PWA, with optional Clerk login and a Go API that syncs the device data to Postgres.

## Layout

| Path | What it is | Docs |
| --- | --- | --- |
| `web/` | React 19 + Vite PWA, feature-sliced. IndexedDB is the device source of truth; works with no account and no network. | [web/README.md](web/README.md) |
| `api/` | Go API (hexagonal: domain, ports, use cases, adapters for HTTP, Postgres and Clerk). Contract in `api/openapi.yaml`. | [api/README.md](api/README.md) |
| `deploy/` | Deployment descriptors and the environment catalog (variable names only, no secrets). | [deploy/README.md](deploy/README.md) |
| `odd/` | Feature documents (specs, tasks, log). | — |

## Run

Front (from `web/`):

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm test && pnpm typecheck
pnpm build
```

Without `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_URL` the front is local-only. Set both (for example in `web/.env.local`) to enable login and sync.

API (from `api/`): see [api/README.md](api/README.md) for the required environment, database migrations and the `make` targets.

API types for the front: after changing `api/openapi.yaml`, run `pnpm gen:api` in `web/` to regenerate `web/src/features/sync/api/schema.d.ts`.
