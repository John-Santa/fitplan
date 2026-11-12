# MagniFit API

Go HTTP service (hexagonal layout): `internal/domain` (business types), `internal/http` (HTTP adapter), `internal/config` (env config), `cmd/api` (entrypoint).

## Run

```sh
cp .env.example .env   # then export the variables, or set them inline
make run
curl localhost:8080/health   # {"status":"ok"}
```

## Test

```sh
make test   # go test ./...
make vet
make build  # outputs bin/api
```

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `8080` | Integer 1-65535 |
| `ALLOWED_ORIGINS` | empty | Comma-separated CORS origins |
| `DATABASE_URL` | empty | Optional for now |
| `CLERK_SECRET_KEY` | empty | Optional for now |

## Docker

```sh
docker build -t magnifit-api .
docker run --rm -p 8080:8080 -e ALLOWED_ORIGINS=http://localhost:5173 magnifit-api
```
