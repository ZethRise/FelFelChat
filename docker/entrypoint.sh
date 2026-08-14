#!/usr/bin/env bash
set -euo pipefail

export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3000}"
export APP_ORIGIN="${APP_ORIGIN:-http://127.0.0.1:${PORT}}"
export UPLOAD_DIR="${UPLOAD_DIR:-/data/uploads}"
export BACKUP_DIR="${BACKUP_DIR:-/data/backups}"
export AUDIT_LOG_DIR="${AUDIT_LOG_DIR:-/data/logs}"
export DATABASE_URL="${DATABASE_URL:-mongodb://mongo:27017/felfelchat?replicaSet=rs0}"

mkdir -p "$UPLOAD_DIR" "$BACKUP_DIR" "$AUDIT_LOG_DIR"

if [[ -z "${JWT_SECRET:-}" || "$JWT_SECRET" == "replace-with-a-long-random-secret" ]]; then
  JWT_SECRET="$(openssl rand -hex 32)"
  export JWT_SECRET
  echo "[felfel] generated ephemeral JWT_SECRET (set JWT_SECRET to persist sessions)"
fi

if [[ -z "${BACKUP_SIGNING_KEY:-}" || "$BACKUP_SIGNING_KEY" == "replace-with-a-long-random-signing-key" ]]; then
  BACKUP_SIGNING_KEY="$(openssl rand -hex 32)"
  export BACKUP_SIGNING_KEY
  echo "[felfel] generated ephemeral BACKUP_SIGNING_KEY"
fi

echo "[felfel] waiting for MongoDB"
ready=0
for _ in $(seq 1 60); do
  if node -e '
    const net = require("net");
    const url = new URL(process.env.DATABASE_URL.replace(/^mongodb(\+srv)?:\/\//, "http://"));
    const host = url.hostname;
    const port = Number(url.port || 27017);
    const s = net.connect(port, host, () => { s.end(); process.exit(0); });
    s.on("error", () => process.exit(1));
  ' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" != "1" ]]; then
  echo "[felfel] MongoDB is not reachable: ${DATABASE_URL}" >&2
  exit 1
fi

cd /app
echo "[felfel] syncing Prisma schema"
npx prisma db push --accept-data-loss --skip-generate

echo "[felfel] seeding superadmin if missing"
node /app/docker/seed-admin.mjs

echo "[felfel] starting app on :${PORT}"
exec node server.mjs
