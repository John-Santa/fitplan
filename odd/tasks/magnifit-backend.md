# MagniFit backend (Go API + Postgres + Clerk)
Objective: split the app into the existing React PWA (front) and a Go API with Postgres and Clerk login, keeping offline-first. Branch: feat/magnifit-backend. Delivery: chained PRs (ask-on-risk, > 400 lines). Runners: `pnpm test` / `pnpm typecheck` (front), `go test ./...` / `go vet ./...` in `api/` (back).

## Specs
- S1 — Request: "evalua cómo tener el api dividida, un back en go y un front en react, todo esto usando el flujo odd y tu rol como orquestador, debe contar con base de datos y un login en clerk". Approved: "Ya tengo dominio,  es magnifit.co  y me gusta la arquitectura que propones, cómo seguimos?"
- S2 — Back in Go, hexagonal: `domain` → ports → adapters (`http` net/http with Clerk middleware, `store` Postgres via pgx + sqlc, migrations with goose).
- S3 — Login with Clerk: front `@clerk/react` (`ClerkProvider`, `useAuth().getToken()`, `Authorization: Bearer <token>`); back `clerkhttp.RequireHeaderAuthorization()` + `clerk.SessionClaimsFromContext(...).Subject` as user id. Bearer only (SDK v2 has no cookie auth).
- S4 — Database Postgres: plan and config as one `jsonb` document per user; sessions and measurements in their own tables; every query scoped by `user_id` (Clerk id).
- S5 — Habit/week logic stays in the front (pure TS); the back stores and serves data.
- S6 — Offline-first: IndexedDB stays the local store plus an outbox of pending changes; push pending and pull new on reconnect; last write wins per record. `getToken()` throws `ClerkOfflineError` offline.
- S7 — First login uploads the existing local data reusing the backup v3 format (export/import with normalization); no history, streak or plan lost.
- S8 — Domain magnifit.co: `app.magnifit.co` (front), `api.magnifit.co` (Go API), Clerk production DNS records. Clerk production requires an owned domain.

Assumptions (parent): the front stays at the repo root for now (no move to `web/`) so the live GitHub Pages deploy is untouched; `api/` is added beside it. Sync uses a server-side monotonic change sequence per row (pull "changes since cursor") and tombstones (`deleted_at`). Accounts (Clerk, Neon, Fly) and secrets are created by the user.

## Tasks
- [ ] T1 — S2: Go module skeleton in `api/` (config, `/health`, CORS, graceful shutdown, Dockerfile, CI workflow). Risk 5 (CI). Route: delegated, parallel with T2.
- [ ] T2 — S4,S6: Postgres schema + goose migrations + sqlc queries (sync columns), validated against a throwaway Postgres container. Risk 1 (data). Route: delegated, parallel with T1.
- [ ] T3 — S3: Clerk middleware (Go) + login in the front. Risk 2. Route: delegated + independent verifier.
- [ ] T4 — S2,S4: API endpoints (documents, sessions, measurements, exercise meta; push/pull sync) with Postgres integration tests. Risk 3.
- [ ] T5 — S6: offline sync layer in the front. Risk 4. Independent verifier.
- [ ] T6 — S7: first-login upload of local data. Risk 1. Independent verifier.
- [ ] T7 — S8: deploy (DNS, API host, DB, secrets). Risk 5. Parent, user confirms each external step.
- [ ] T8 — rename the app to MagniFit (title, manifest, icon text). Route: inline.

## Log
- L1 (2026-11-11) user: "Perfecto, ahora evalua cómo tener el api dividida, un back en go y un front en react, todo esto usando el flujo odd y tu rol como orquestador, debe contar con base de datos y un login en clerk"
- L2 (2026-11-11) name chosen by the user: MagniFit; domain bought: magnifit.co.
- L3 (2026-11-11) user: "Ya tengo dominio,  es magnifit.co  y me gusta la arquitectura que propones, cómo seguimos?" — architecture approved, including offline-first sync.
