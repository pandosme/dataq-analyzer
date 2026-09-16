# DataQ Analyzer

DataQ Analyzer is a single Node.js application for collecting, storing, and analyzing Axis DataQ path events. Express serves the React analytics interface, REST API, and WebSocket endpoints from one origin.

The project is currently private and under migration from the former backend and frontend repositories.

## Features

- Flow and dwell heatmaps
- Forensic path search with video playback
- Live path events over WebSocket
- Directional counters with historical backfill
- MQTT ingestion and automatic device discovery
- One generic device model for camera and radar data
- Administrator and read-only viewer roles
- MongoDB persistence

## Architecture

```text
Browser
  -> Express :80
       -> React SPA /
       -> REST /api
       -> WebSocket /ws/paths and /ws/video
       -> MongoDB
       -> MQTT broker
       -> VideoX, ACS, or Milestone
```

MongoDB remains a separate service. The supplied Compose file starts MongoDB locally; an external MongoDB can be selected with `MONGODB_URI`.

## Configuration

Configuration is read at startup. Changes require an application restart.

- `config.yaml` contains non-secret installation policy and defaults.
- `.env` contains deployment endpoints, credentials, and cryptographic secrets.
- `.env.example` documents all supported deployment variables.
- User preferences and operational data remain in MongoDB.

Never commit `.env`, certificates, private keys, or production configuration backups.

Run the interactive setup assistant:

```bash
npm run configure
```

It guides you through MongoDB, MQTT, playback, administrator, retention, and
display settings. It generates cryptographic secrets locally, hides credential
input, backs up existing files, and validates the completed configuration.

You can also configure a deployment directory without changing this checkout:

```bash
./setup.sh --target /path/to/deployment
```

At minimum, the resulting configuration contains:

- `JWT_SECRET`: at least 32 random characters
- `CREDENTIAL_ENCRYPTION_KEY`: at least 32 random characters
- `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` for the first startup
- `MONGODB_URI` when MongoDB is not the Compose service

Bootstrap credentials create a database administrator only when no administrator exists. Remove them from the deployment environment after verifying the first login.

Validate configuration:

```bash
npm run config:check
```

## Container Deployment

Build the private image locally:

```bash
npm run docker:build
```

Start the application and bundled MongoDB:

```bash
npm run configure
docker compose up -d
docker compose logs -f app
```

The default URL is `http://localhost:3303`.

The setup assistant selects `docker-compose.mongodb.yml` when you choose the
bundled database. For an external MongoDB it uses only `docker-compose.yml`, so
no unused local database container is started.

Use immutable image tags for production:

```bash
DATAQ_VERSION=v0.1.0 docker compose up -d
```

## Host Development

Node.js 20 or newer is required.

```bash
npm run setup
npm run dev:db
npm run dev
```

`npm run dev:db` starts only the bundled MongoDB container and publishes it on
`127.0.0.1:27017`. `npm run dev` starts the Express server under nodemon and the
Vite development server together. The generated production values in `.env`
are overridden only for these local processes.

Open `http://localhost:3403`. Vite proxies API and WebSocket traffic to the
backend on port `3303`, and source changes reload continuously.

## Validation

```bash
npm run config:check
npm run lint
npm run build
docker compose -f docker-compose.build.yml build
```

The migrated frontend currently has non-blocking React Compiler lint warnings that will be resolved as its state management is simplified.

## Access Model

- **Administrator:** manages users and application data.
- **Viewer:** has read-only access to all active device data.

Devices observed on `dataq/connect/+`, `dataq/status/+`, or `dataq/image/+` are created and enabled immediately. Retained connect announcements are processed when the MQTT client subscribes. Removing a device archives it so historical events and counters remain attributable.

## Repository Layout

```text
src/                 Express, MongoDB, MQTT, WebSocket, and integration code
web/                 React/Vite application
public/              Server-owned static assets
config.yaml          Non-secret installation configuration
.env.example         Deployment and secret variable template
Dockerfile           Multi-stage web and server image
Docker-compose.yml   Application and optional MongoDB deployment
```

## Migration Safety

Before using this build with production data:

1. Create and verify a `mongodump` backup.
2. Rehearse schema and ownership migration against a restored copy.
3. Review discovered devices and user roles.
4. Keep the old application images and pre-migration dump through the rollback window.
5. Rotate credentials that appeared in legacy repository utility scripts.

See [API.md](API.md) for the inherited API reference. It is being updated as authorization and configuration endpoints are consolidated.

## License

MIT
