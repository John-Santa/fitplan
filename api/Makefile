.PHONY: run test vet build

run:
	go run ./cmd/api

test:
	go test ./...

vet:
	go vet ./...

build:
	CGO_ENABLED=0 go build -trimpath -o bin/api ./cmd/api
