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

- S9 — Architecture follows icaro (user: "Que arquitectura estas llevando? Toma como ejemplo icaro, quiero algo.limpio y escalable desde el inicio"; approved: "Dale"): monorepo api/ (hermes layout), web/ (iris feature-sliced + PWA, no TanStack Query because IndexedDB is the device source of truth), deploy/ (atlas: Render + Neon + Clerk, env names only). Left out: Redis/outbox, RBAC, multi-env, coverage-policy engine. Kept goose instead of golang-migrate.

## Tasks
- [ ] R1 — S9: back restructure to the hermes layout (cmd/magnifit-api, internal/{domain,port,usecase,adapter/{httpapi,postgres,clerk},platform}), chi, problem+json, api/openapi.yaml + conformance test, golangci depguard domain purity, /readyz, make check. Route: delegated, parallel with R2/R3. Risk 3 (error wire format changes to problem+json).
- [ ] R2 — S9: front to web/ feature-sliced (app/, features/<x>/{api,schema,components,routes,lib}, components/ui, lib), OpenAPI type generation script. Route: delegated, parallel. Risk 6.
- [ ] R3 — S9: deploy/ (render.yaml for api + static web, env catalog names only, ADRs in docs/), workflows moved to web/ and api/. Route: delegated, parallel. Risk 5.
- [x] T1 — S2: Go module skeleton in `api/` (config, `/health`, CORS, graceful shutdown, Dockerfile, CI workflow). Risk 5 (CI). Route: delegated, parallel with T2. Done: go vet/test/build green; api/.env.example left untracked (parent cannot read .env* files by permission).
- [x] T2 — S4,S6: Postgres schema + goose migrations + sqlc queries (sync columns), validated against a throwaway Postgres container. Risk 1 (data). Route: delegated, parallel with T1. Done: sqlc compile/generate/vet ok; Up/Down + 6 smoke checks PASS on postgres:17.
- [x] T3 — S3: Clerk middleware (Go) + login in the front. Risk 2. Route: delegated + independent verifier. Front 8addf41 (343 tests, Clerk lazy-loaded only with VITE_CLERK_PUBLISHABLE_KEY); Go half in 701614b (WithHeaderAuthorization + JSON 401, since RequireHeaderAuthorization answers a bodyless 403 in SDK v2.8.0). Verified.
- [x] T4 — S2,S4: API endpoints (documents, sessions, measurements, exercise meta; push/pull sync) with Postgres integration tests. Risk 3. Commit 701614b: /v1/me, GET/POST /v1/sync; per-user advisory lock on push, REPEATABLE READ pull; 5 integration tests green. Verified.
- [x] T5 — S6: offline sync layer in the front. Risk 4. Independent verifier. Commit 90c7849 (365 tests); verified.
- [x] T6 — S7: first-login upload of local data. Risk 1. Independent verifier. Same commit 90c7849 (bootstrap in engine.ts); verified.
- [ ] T7 — S8: deploy (DNS, API host, DB, secrets). Risk 5. Parent, user confirms each external step.
- [x] T8 — rename the app to MagniFit (title, manifest, icon text). Route: inline. Commit 6b914cc; 333 tests green.

## Log
- L1 (2026-11-11) user: "Perfecto, ahora evalua cómo tener el api dividida, un back en go y un front en react, todo esto usando el flujo odd y tu rol como orquestador, debe contar con base de datos y un login en clerk"
- L2 (2026-11-11) name chosen by the user: MagniFit; domain bought: magnifit.co.
- L3 (2026-11-11) user: "Ya tengo dominio,  es magnifit.co  y me gusta la arquitectura que propones, cómo seguimos?" — architecture approved, including offline-first sync.
- L4 (2026-11-11) api/.env.example left untracked: the parent cannot read .env* files (permission settings); the user must review it (expected names: PORT, ALLOWED_ORIGINS, APP_ENV, DATABASE_URL, CLERK_SECRET_KEY, optional TEST_DATABASE_URL).
- L5 (2026-11-11) T4 verifier: PASS, no blockers, 5 advisories + future-skew pin; all fixed in cb372a9 (range/NUL validation, clamp updatedAt to now+10min, strict JSON decoding, azp required when a list is set, goose session locker).
- L6 (2026-11-11) T5/T6 end-to-end verifier (real Go API + Postgres probe): 3 blockers (B1 seeds overwrote real plan/config on first login; B2 stale push + clock skew diverged; B3 restore diverged) + A1 (one 400 blocked all sync). One correction batch d755af5; recheck limited to blockers: 7/7 probes PASS (C1–C7). 376 front tests, Go suite green.
- Next: T7 deploy needs the user (Clerk + Neon keys in local .env, Fly.io account, GoDaddy DNS for magnifit.co). api/.env.example still untracked pending user review.
- L7 (2026-11-11) user asked to follow icaro's architecture; explorer mapped ~/Dev/icaro-ink (hermes Go API, iris React SPA, atlas infra). Proposal approved: "Dale".
