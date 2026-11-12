.PHONY: run test test-integration lint fmt vet sqlc-check build check

PG_CONTAINER ?= magnifit-pg-test
PG_PORT      ?= 55432
PG_URL       := postgres://postgres:pg@localhost:$(PG_PORT)/postgres?sslmode=disable

run:
	go run ./cmd/magnifit-api

test:
	go test ./...

# Runs every test, Postgres integration included, against a throwaway
# postgres:17 container that is stopped afterwards.
test-integration:
	docker run -d --rm --name $(PG_CONTAINER) -e POSTGRES_PASSWORD=pg -p $(PG_PORT):5432 postgres:17
	until docker exec $(PG_CONTAINER) pg_isready -U postgres; do sleep 1; done
	TEST_DATABASE_URL="$(PG_URL)" go test ./... -count=1 || (docker stop $(PG_CONTAINER); exit 1)
	docker stop $(PG_CONTAINER)

lint:
	golangci-lint run

fmt:
	test -z "$$(gofmt -l .)" || (gofmt -l .; exit 1)

vet:
	go vet ./...

# Regenerates the sqlc code and fails when it differs from what is committed.
sqlc-check:
	sqlc generate
	git diff --exit-code -- internal/adapter/postgres/sqlcgen
	test -z "$$(git status --porcelain -- internal/adapter/postgres/sqlcgen)"

build:
	CGO_ENABLED=0 go build -trimpath -o bin/magnifit-api ./cmd/magnifit-api

check: fmt vet lint test
