#!/usr/bin/env bash
#
# Run the development instance against dart's PRODUCTION database.
#
#   npm run dev:dart     ->  UI on http://localhost:3303
#
# The web dev server takes 3303 (the port you browse to, with hot reload) and
# the API moves to 3304 behind Vite's proxy, so /api and /ws still work from a
# single origin.
#
# src/config/index.js reads process.env and lets dotenv fill only what is unset,
# so everything exported here wins over the committed .env. .env.dev supplies
# the values that must match dart — chiefly CREDENTIAL_ENCRYPTION_KEY, without
# which camera credentials already stored in the shared database cannot be
# decrypted.
#
# Safety comes from config.dev.yaml: MQTT ingest off (no duplicate events into
# live data) and retention effectively disabled (no overnight purge of real
# history). Read its header before changing either.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.dev ]; then
  echo "error: .env.dev is missing — it holds the values that must match dart" >&2
  echo "       (MONGODB_URI, CREDENTIAL_ENCRYPTION_KEY, JWT_SECRET, VIDEOX_API_KEY)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env.dev
set +a

export NODE_ENV=development
export CONFIG_PATH=config.dev.yaml
export PORT=3304
export DEV_API_PORT=3304
export DEV_WEB_PORT=3303
export CORS_ORIGIN=http://localhost:3303
# Never let a dev process delete from the production database. config.dev.yaml
# raises the global retention, but per-camera retentionDays overrides it — this
# is the only setting that actually stops the midnight purge.
export RETENTION_ENABLED=false

echo "dataq-analyzer dev  ->  http://localhost:3303   (API on :3304, database: dart)"

exec npx concurrently --kill-others --names server,web --prefix-colors cyan,magenta \
  "nodemon src/server.js" \
  "npm --prefix web run dev"
