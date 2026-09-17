#!/bin/sh
# Dispatches the "init" convenience command; anything else runs as given, so the
# default CMD (node src/server.js) is unaffected.
set -e

if [ "$1" = "init" ]; then
  shift
  exec node /app/scripts/init.js "$@"
fi

exec "$@"
