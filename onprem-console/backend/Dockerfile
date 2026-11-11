# syntax=docker/dockerfile:1
FROM golang:1.26-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOFLAGS=-mod=readonly go build -trimpath -ldflags="-s -w" -o /out/onprem-api ./cmd/server

FROM alpine:3.22
# tzdata: ONPREM_TIMEZONE; ca-certificates: GitHub.com and public CAs.
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -u 10001 -S -h /app -s /sbin/nologin onprem
COPY --from=builder /out/onprem-api /app/onprem-api
USER onprem
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -qO- http://127.0.0.1:8090/healthz >/dev/null || exit 1
ENTRYPOINT ["/app/onprem-api"]
