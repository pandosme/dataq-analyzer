# DataQ Analyzer Agent Context

## Architecture

- One Node.js 20 Express process serves the React SPA, REST API, and WebSockets.
- Backend source is in `src/`; React/Vite source is in `web/`.
- Production frontend output is `dist/web`; local frontend output is `web/dist`.
- MongoDB is required. MQTT and playback are optional integrations.
- Browser API and WebSocket traffic is same-origin.

## Configuration

- `config.yaml` contains non-secret installation policy.
- `.env` contains deployment values and secrets; never commit it.
- Configuration is validated at startup and changes require restart.
- Production requires `JWT_SECRET` and `CREDENTIAL_ENCRYPTION_KEY`, each at least 32 characters.
- Infrastructure configuration is read-only through the API.
- Device credentials are encrypted with AES-256-GCM before MongoDB persistence and decrypted only at the VAPIX boundary.

## Access Model

- Roles are `admin` and `viewer`.
- Administrators manage all users and application data.
- Viewers have read-only access to all active device data.
- MQTT messages on `dataq/connect/+`, `dataq/status/+`, and `dataq/image/+` create and enable devices immediately.
- Device removal archives the record and preserves historical analytics.
- Authorization must be enforced server-side in routes, services, REST query constraints, and WebSockets.

## Commands

```bash
npm run setup
npm run config:check
npm test
npm run lint
npm run build
docker compose -f docker-compose.build.yml build
```

Backend lint currently completes with inherited unused-variable warnings. Frontend lint completes with inherited React Compiler warnings. Do not suppress new errors.

## Migration Status

Implemented:

- Consolidated repository and image build
- Validated YAML/environment startup configuration
- Database-backed bootstrap administrator
- Administrator/viewer account management
- Device ownership filtering for camera CRUD and snapshots
- Generic device discovery and archival removal
- Device credential encryption and API redaction
- Read-only authenticated infrastructure configuration endpoints

Still required before production:

- Ownership constraints for paths, counters, video, and all WebSocket broadcasts
- HttpOnly cookie sessions and removal of query-string WebSocket tokens
- Unified management UI and removal of server selection
- Full migration scripts, dry-run reports, and authorization integration tests
- Production backup, rehearsal, cutover, and rollback procedures
