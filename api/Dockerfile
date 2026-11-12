# syntax=docker/dockerfile:1

FROM golang:1.27 AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/magnifit-api ./cmd/magnifit-api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/magnifit-api /magnifit-api
ENV PORT=8080
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/magnifit-api"]
