# MagniFit API

Go HTTP service with a hexagonal, layer-first layout (same conventions as icaro's hermes). Dependencies point inward: adapters → use cases → ports → domain.

```
api/
├── cmd/magnifit-api/        composition root: manual dependency wiring
├── openapi.yaml             OpenAPI 3.1 contract (checked against the real handlers by a test)
├── migrations/              goose SQL migrations, embedded in the binary (testdata/ holds a smoke script)
├── internal/
│   ├── domain/sync/         sync records, validation, future-timestamp clamp (standard library only)
│   ├── domain/shared/       UserID, ValidationError
│   ├── port/                sentinel errors (ErrInvalid, ErrUnauthorized, ErrNotFound, ErrUnavailable), Authenticator, Clock, user id in context
│   ├── usecase/sync/        Service (Pull/Push) with Deps and consumer-side ChangeReader/ChangeApplier
│   ├── adapter/httpapi/     chi router, middleware, problem+json, handlers and wire DTOs
│   ├── adapter/postgres/    SyncStore (pgx + sqlc), queries/ → sqlcgen/, pgmap/ row↔domain, goose Migrate
│   ├── adapter/clerk/       Clerk SDK v2 Bearer verifier (azp list rule)
│   └── platform/            config (env, fails fast), logging (slog JSON + request_id), postgresdb (pool, WithTx), httpserver (graceful shutdown)
├── .golangci.yml            depguard keeps internal/domain on the standard library; sloglint requires context
└── Makefile
```

Middleware order, outermost first: RequestID → Logger → Recover → CORS → Auth. Auth sits inside CORS so 401 answers carry CORS headers and preflights never need a token; it runs before any handler, skips the public paths (`/health`, `/readyz`) and leaves unrouted requests to 404/405.

Architecture decisions: [docs/decisiones-tecnicas.md](docs/decisiones-tecnicas.md).

## Run

```sh
cp .env.example .env   # then export the variables, or set them inline
make run
curl localhost:8080/health   # {"status":"ok"}
```

On boot the service connects to `DATABASE_URL`, applies pending migrations (under a Postgres advisory lock, so concurrent boots serialize), and serves the `/v1` routes.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `8080` | Integer 1-65535 |
| `ALLOWED_ORIGINS` | empty | Comma-separated CORS origins; also the accepted Clerk `azp` (authorized party) values when set (then a token without `azp` is rejected too) |
| `APP_ENV` | empty | `test` makes `DATABASE_URL` and `CLERK_SECRET_KEY` optional |
| `DATABASE_URL` | empty | Postgres URL. Required unless `APP_ENV=test`; without it the `/v1` routes are disabled |
| `CLERK_SECRET_KEY` | empty | Clerk backend secret key. Required unless `APP_ENV=test`; without it `/v1` answers 401 |

## Endpoints

The contract is [openapi.yaml](openapi.yaml). `GET /health` (liveness) and `GET /readyz` (pings the database; `503` when it is down or not configured) are public. Every `/v1` route requires `Authorization: Bearer <Clerk session token>`; a missing or invalid token gets a `401` problem with `WWW-Authenticate: Bearer realm="magnifit"`.

Errors are RFC 7807 problems with `Content-Type: application/problem+json`:

```json
{"type": "about:blank", "title": "Bad Request", "status": 400, "detail": "sessions[0].body.date: must be a valid YYYY-MM-DD date"}
```

`title` is the HTTP status text and `detail` the reason (for validation errors, the failing field path and rule). Unexpected failures answer an opaque `500` with `detail: "internal server error"`.

| Method | Path | Answer |
| --- | --- | --- |
| `GET` | `/health` | `{"status":"ok"}` |
| `GET` | `/readyz` | `{"status":"ready"}` or `503` problem |
| `GET` | `/v1/me` | `{"userId":"user_..."}` |
| `GET` | `/v1/sync?since=<rev>&limit=<n>` | ChangeSet with records whose `rev > since` (`since` default 0, `limit` 1-500, default 200) |
| `POST` | `/v1/sync` | Push a ChangeSet (max 5 MB, else 413); answers one result per record |

ChangeSet (timestamps are epoch milliseconds, like the front):

```json
{
  "documents":    [{"kind": "plan", "body": {}, "updatedAt": 1700000000000, "deletedAt": null, "rev": 12}],
  "sessions":     [{"id": "s1", "body": {"id": "s1", "kind": "swim", "date": "2026-11-10", "finishedAt": null}, "updatedAt": 1700000000000, "deletedAt": null, "rev": 13}],
  "measurements": [{"date": "2026-11-10", "body": {"date": "2026-11-10", "weight": 80}, "updatedAt": 1700000000000, "deletedAt": null, "rev": 14}],
  "exerciseMeta": [{"exerciseId": "press", "body": {"exerciseId": "press", "seat": "3", "note": ""}, "updatedAt": 1700000000000, "deletedAt": null, "rev": 15}],
  "cursor": 15,
  "hasMore": false
}
```

- Pull: keep calling with `since=<cursor>` while `hasMore` is true. Tombstones (`deletedAt` set) are included.
- Push: `rev`, `cursor` and `hasMore` are ignored. The whole push is validated first (400 with the failing field, e.g. `sessions[0].body.date: must be a valid YYYY-MM-DD date`) and then written in one transaction.
- Strict decoding: unknown fields anywhere in the request and any data after the JSON object are rejected with 400.
- Rules: `kind` is `plan` or `config`; ids are 1-128 characters without NUL; dates are `YYYY-MM-DD` with year 1 or later; `body` is a JSON object of at most 256 KB without the `\u0000` escape, required also on deletes; `updatedAt` is required. `updatedAt`, `deletedAt` and a session body's `startedAt`/`finishedAt` must be integers between 0 and 253402300799999 (year 9999), else 400. A session body must hold `kind` (`strength` or `swim`) and `date`; `finishedAt` (ms or null) is read from it too. When a body carries its own key (`id`, `date`, `exerciseId`) it must match the record key.
- Last write wins per record: an `updatedAt` older than the stored one is not written. Future-skew guard: `updatedAt` and `deletedAt` later than the server clock plus 10 minutes are clamped to that limit before writing (not rejected, so offline clients with a wrong clock still sync), so one bad clock cannot pin a record forever. Push answer:

```json
{"documents": [{"key": "plan", "status": "applied", "rev": 16}], "sessions": [], "measurements": [{"key": "2026-11-10", "status": "stale", "rev": 0}], "exerciseMeta": []}
```

## Test

```sh
make check             # gofmt check + go vet + golangci-lint + go test ./...
make test              # go test ./... (Postgres integration tests skip without TEST_DATABASE_URL)
make test-integration  # same, against a throwaway postgres:17 container
make sqlc-check        # regenerates sqlc code and fails if it differs from the committed code
make build             # outputs bin/magnifit-api
```

`internal/adapter/httpapi/contract_conformance_test.go` validates real handler requests and responses (success and error) against `openapi.yaml` with libopenapi-validator, and checks that every router route is in the contract and vice versa.

Postgres integration tests (`internal/adapter/postgres`) run when `TEST_DATABASE_URL` is set. They migrate the database and truncate all its data, so use a throwaway one:

```sh
docker run -d --rm --name magnifit-pg -e POSTGRES_PASSWORD=pg -p 55433:5432 postgres:17
TEST_DATABASE_URL='postgres://postgres:pg@localhost:55433/postgres?sslmode=disable' go test ./... -count=1
docker stop magnifit-pg
```

## Docker

```sh
docker build -t magnifit-api .
docker run --rm -p 8080:8080 -e ALLOWED_ORIGINS=http://localhost:5173 \
  -e DATABASE_URL=postgres://... -e CLERK_SECRET_KEY=sk_... magnifit-api
```
