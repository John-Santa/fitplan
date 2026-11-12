# MagniFit API

Go HTTP service, hexagonal layout:

- `internal/domain`: sync record types, validation and the `Store` port (standard library only).
- `internal/sync`: application service (pull with cursor pagination, push with validation).
- `internal/store`: Postgres adapter (pgxpool + sqlc in `internal/store/sqlcgen`), embedded goose migrations (`db/migrations`, applied on boot).
- `internal/auth`: Clerk authenticator (Bearer session JWT; the token subject is the user id).
- `internal/http`: HTTP adapter (routing, middleware, JSON wire format).
- `internal/config`, `cmd/api`: env config and entrypoint.

## Run

```sh
cp .env.example .env   # then export the variables, or set them inline
make run
curl localhost:8080/health   # {"status":"ok"}
```

On boot the service connects to `DATABASE_URL`, applies pending migrations, and serves the `/v1` routes.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `8080` | Integer 1-65535 |
| `ALLOWED_ORIGINS` | empty | Comma-separated CORS origins; also the accepted Clerk `azp` (authorized party) values when set |
| `APP_ENV` | empty | `test` makes `DATABASE_URL` and `CLERK_SECRET_KEY` optional |
| `DATABASE_URL` | empty | Postgres URL. Required unless `APP_ENV=test`; without it the `/v1` routes are disabled |
| `CLERK_SECRET_KEY` | empty | Clerk backend secret key. Required unless `APP_ENV=test`; without it `/v1` answers 401 |

## Endpoints

`GET /health` is public. Every `/v1` route requires `Authorization: Bearer <Clerk session token>`; a missing or invalid token gets `401 {"error":"unauthorized"}`. Errors are always `{"error":"..."}`.

| Method | Path | Answer |
| --- | --- | --- |
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
- Rules: `kind` is `plan` or `config`; ids are 1-128 characters; dates are `YYYY-MM-DD`; `body` is a JSON object of at most 256 KB, required also on deletes; `updatedAt` is required. A session body must hold `kind` (`strength` or `swim`) and `date`; `finishedAt` (ms or null) is read from it too. When a body carries its own key (`id`, `date`, `exerciseId`) it must match the record key.
- Last write wins per record: an `updatedAt` older than the stored one is not written. Push answer:

```json
{"documents": [{"key": "plan", "status": "applied", "rev": 16}], "sessions": [], "measurements": [{"key": "2026-11-10", "status": "stale", "rev": 0}], "exerciseMeta": []}
```

## Test

```sh
make test   # go test ./... (Postgres integration tests skip without TEST_DATABASE_URL)
make vet
make build  # outputs bin/api
```

Postgres integration tests (`internal/store`) run when `TEST_DATABASE_URL` is set. They migrate the database and truncate all its data, so use a throwaway one:

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
