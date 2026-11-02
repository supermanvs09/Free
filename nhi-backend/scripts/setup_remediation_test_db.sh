#!/usr/bin/env bash
# Starts a throwaway Postgres with the engine tables (ispm_*) for the
# integration tests. Usage: ENGINE_DIR=/path/to/NHI-ISPM scripts/setup_remediation_test_db.sh [port]
#   then: TEST_DB_PORT=<port> go test -tags integration -run TestOneClickFlow ./internal/integration
set -euo pipefail
PORT="${1:-57432}"
ENGINE_DIR="${ENGINE_DIR:?set ENGINE_DIR to the NHI-ISPM engine checkout}"
NAME=rem-pg
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=nhi -p "$PORT:5432" postgres:16-alpine >/dev/null
for _ in $(seq 1 60); do docker exec "$NAME" psql -U postgres -d nhi -qc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
psql() { docker exec -i "$NAME" psql -U postgres -d nhi -q -v ON_ERROR_STOP=1; }
echo 'create schema bimasugam; create schema nhi_global;' | psql
# 001-006 apply as they are. 007 needs the legacy nhi_scanner schema and 008 only
# changes tenant_id to uuid, so the fixture does the latter by hand below.
for f in 001 002 003 004 006 009 010; do psql < "$ENGINE_DIR"/migrations/${f}_*.up.sql; done
psql <<'SQL'
CREATE TABLE nhi_global.tenants (tenant_id uuid PRIMARY KEY, db_name text);
ALTER TABLE bimasugam.ispm_nhi_findings    ALTER COLUMN tenant_id TYPE uuid USING tenant_id::uuid;
ALTER TABLE bimasugam.ispm_identity_checks  ALTER COLUMN tenant_id TYPE uuid USING tenant_id::uuid;
ALTER TABLE bimasugam.ispm_identity_posture ALTER COLUMN tenant_id TYPE uuid USING tenant_id::uuid;
CREATE TABLE bimasugam.identities (id text, name text, identity_type text, arn text, parent_arn text, type_attributes jsonb, deleted_at timestamptz);
SQL
echo "ready: TEST_DB_PORT=$PORT"
