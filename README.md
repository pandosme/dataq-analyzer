# DataQ Analyzer

A working reference implementation for collecting, storing and analysing path
data from Axis devices. One Node.js process serves a React interface, a REST
API and WebSocket endpoints; MongoDB holds the data; MQTT carries it in.

**Treat this as a recipe, not a product.** It is a description of one way to
build a path-analytics system, published so that you can read it, run it, take
it apart and build your own version. Run it as-is if it fits, or use it as the
starting point for something customised. There is no roadmap, no support
commitment and no guarantee that the next change will be backwards compatible.

> This application is not endorsed, supported, or maintained by Axis
> Communications. It is an independent project. Axis is not responsible for it
> in any way, and no support should be expected from Axis for anything here.

## Concept

Axis devices do the detection. A device-side ACAP tracks objects and publishes
each finished path as an MQTT message. This application subscribes to those
messages, stores them, and gives you ways to look at them.

```text
Axis device (DataQ ACAP)
  -> MQTT broker
       -> DataQ Analyzer  --  MongoDB
            -> Browser: heatmaps, forensic search, counters, live view
```

The data model is deliberately simple. A *path* is one object's journey through
the scene: a class (Human, Car, ...), a list of coordinates in a 1000x1000
normalised space, a timestamp, a duration, and how far it travelled. Everything
the interface shows is derived from that one record type.

Devices are not configured here. They announce themselves over MQTT and appear
automatically, which means adding a camera to the system is a matter of pointing
its ACAP at the same broker.

### What you can do with the data

- **Flow** — heatmap of where objects move through a scene
- **Dwell** — heatmap weighted by how long objects idled
- **Occupancy** — how many objects were present in an area over time
- **Forensic** — search paths by class, time, duration, entry and exit areas,
  with optional video playback from a recording server
- **Live** — paths drawn as they arrive
- **Counters** — directional counts between zones you draw on the scene, with
  historical backfill

## Prerequisite: the DataQ ACAP

This application has no detection of its own. **It is useless without the DataQ
ACAP installed on your Axis devices** — that is what produces the path data.

Install it from **<https://pandosme.github.io/acap/2025/01/18/DataQ.html>**,
which also documents the device-side settings and the MQTT payloads.

On each device: install the ACAP, point it at your MQTT broker, and confirm it
publishes. The ACAP is the agent; this application is only the collector and the
analysis surface. If no devices are publishing, the interface comes up empty.

You also need an MQTT broker. Any broker works — Mosquitto is fine. Devices and
this application must reach the same one.

## Quick start

Nothing to clone. With Docker installed:

```bash
mkdir dataq && cd dataq
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/out" pandosme/dataq-analyzer:latest init
docker compose up -d
```

`init` writes `docker-compose.yml`, `docker-compose.mongodb.yml`, `config.yaml`
and `.env` into the current directory. It generates the cryptographic secrets
locally and prints a one-time administrator username and password. Nothing
leaves your machine.

Then open <http://localhost:3303> and log in with the credentials it printed.

If you already know your broker, hand it over and MQTT is enabled from the
start:

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/out" pandosme/dataq-analyzer:latest init --mqtt-broker-url=mqtt://broker.example.com:1883
```

Without it, MQTT is written **disabled** so the first start succeeds; set
`MQTT_BROKER_URL` in `.env` and `mqtt.enabled: true` in `config.yaml` when you
are ready, then `docker compose up -d`.

Other `init` options:

| Option | Effect |
| --- | --- |
| `--external-mongodb` | Skip the bundled MongoDB; set `MONGODB_URI` yourself |
| `--mqtt-broker-url=URL` | Enable MQTT immediately against this broker |
| `--force` | Overwrite files that already exist |
| `<directory>` | Write somewhere other than `/out` |

### After first login

The bootstrap administrator exists only to get you in. Once you have logged in,
blank these in `.env` and run `docker compose up -d`:

```bash
BOOTSTRAP_ADMIN_USERNAME=
BOOTSTRAP_ADMIN_PASSWORD=
```

They are read **only while no administrator exists in the database**, so leaving
them set does nothing on a system that already has one — but it does leave a
password sitting in a file. If you ever lose every administrator account, put
them back and restart to recover.

## Ways to deploy it

### 1. Run it as-is

The quick start above. Bundled MongoDB, one container each, data in a Docker
volume. Suitable for a single site, a demo, or a pilot.

The application is published on `127.0.0.1` only. To reach it from elsewhere,
put a reverse proxy in front that terminates TLS, and set `CORS_ORIGIN` in
`.env` to the URL the browser actually uses.

### 2. Run it against your own infrastructure

Use `init --external-mongodb` and point `MONGODB_URI` at an existing MongoDB —
a managed cluster, a replica set, whatever you already operate. Set
`MONGODB_AUTH_REQUIRED`, `MONGODB_USERNAME` and `MONGODB_PASSWORD` if it needs
credentials.

Pin an immutable tag rather than tracking `latest`:

```bash
DATAQ_VERSION=1.1.0 docker compose up -d
```

### 3. Build your own image

Clone the repository and build it:

```bash
npm run setup
npm run docker:build
```

`docker-compose.build.yml` builds and tags the image. Change the image name in
it to publish to your own registry. This is the path to take if you are
modifying the code — see [AGENTS.md](AGENTS.md).

### 4. Run it from source

Node.js 20 or newer:

```bash
npm run setup
./setup.sh
npm run dev:db
npm run dev
```

`npm run setup` installs server and web dependencies, `./setup.sh` is an
interactive configuration assistant, `npm run dev:db` starts the bundled MongoDB
on `127.0.0.1:27017`, and `npm run dev` runs Express on `:3303` and Vite on
`:3403` together.

Open <http://localhost:3403>. Vite proxies API and WebSocket traffic to the
backend and reloads on change.

`./setup.sh --target /path/to/deployment` configures a deployment directory
without touching your checkout.

## Configuration

Two files, read once at startup. File changes need a restart. Administrator-managed
retention overrides are stored in MongoDB and take effect without a restart.

**`config.yaml`** — installation policy, no secrets. Application name, retention
in days, page sizes, date format, which features are on (MQTT, playback), and
per-device defaults. Mounted read-only into the container.

**`.env`** — endpoints, credentials and secrets. Never commit it.

| Variable | Notes |
| --- | --- |
| `JWT_SECRET` | 32+ characters. Changing it logs everyone out. |
| `CREDENTIAL_ENCRYPTION_KEY` | 32+ characters. **Lose it and stored device credentials are unrecoverable.** |
| `MONGODB_URI` | Full connection string, or use the `MONGODB_*` parts |
| `MQTT_BROKER_URL` | Required when `mqtt.enabled: true`, otherwise startup fails |
| `CORS_ORIGIN` | The browser-facing origin |
| `BOOTSTRAP_ADMIN_*` | First-administrator recovery only; see above |
| `MEDIAMTX_USERNAME` | Required when MediaMTX playback is enabled |
| `MEDIAMTX_PASSWORD` | Required when MediaMTX playback is enabled; never exposed to browsers |

Validate before starting:

```bash
npm run config:check
```

### Data retention

As an administrator, open **Administration → Data retention** in settings.
Set the **Default retention (days)** and click **Save default**, or set an
individual camera's retention and save that camera. Leave a camera's value
blank to inherit the system default. Values must be positive whole days.
Disabled and archived cameras are included because their history is also
subject to cleanup.

The saved default is shared by all updated application instances using the
same database. Until an administrator saves a default, `app.dataRetentionDays`
in `config.yaml` supplies it (90 days by default). Camera overrides take
precedence. The explicit database default is stored as
`SystemConfig.retentionDefaultDays`; legacy `dataRetentionDays` values in that
document are not activated implicitly.

Saving does not delete anything immediately. Cleanup first runs at the next
server-local midnight and repeats every 24 hours, deleting paths whose event
timestamp or creation date is older than the retention cutoff. Lowering retention
can permanently delete history at the next cleanup; increasing it cannot restore
deleted data. `RETENTION_ENABLED=false` disables cleanup on that process only.
In particular, `npm run dev:dart` disables cleanup, but retention changes made
there still affect updated production instances sharing the database.
Older deployed versions must be upgraded to use the database-managed default.

The authenticated API exposes `GET /api/config/retention` and admin-only
`PUT /api/config/retention` with `{"dataRetentionDays": 30}`. Both endpoints
require an administrator. Camera overrides use admin-only
`PUT /api/cameras/:id` with `{"retentionDays": 14}` or
`{"retentionDays": null}` to inherit. Other installation settings remain
file-managed and read-only through the API.

### MediaMTX Playback

Forensic playback uses [MediaMTX](https://mediamtx.org/) recordings through the
analyzer's authenticated WebSocket; the browser never contacts MediaMTX or sees
its credentials. On the MediaMTX host, enable the playback server and configure
an internal-auth user permitted to read playback:

```yaml
playback: true
playbackAddress: :9996
authMethod: internal
authInternalUsers:
  - user: <analyzer-username>
    pass: <analyzer-password>
    permissions:
      - action: playback
```

Configure the same username and password in `.env`, then configure
`config.yaml` with the playback URL, for example:

```yaml
playback:
  enabled: true
  type: MediaMTX
  serverUrl: "http://dart.internal:9996"
  preTime: 5
  postTime: 5
```

By default, each DataQ device name is lowercased to find its MediaMTX recording
path, so `Front` maps to `front`. Set a camera's optional `recordingName` when
it needs a different mapping. Restart DataQ Analyzer after changing either
configuration file.

MediaMTX playback is requested as `/get?path=<recording>&start=<UTC timestamp>&duration=<seconds>&format=mp4` by the backend.

### Retention

`dataRetentionDays` in `config.yaml` is the default; a per-device override can
be set on each device. A cleanup runs at local midnight and deletes paths older
than the limit. **This deletes data permanently** — set it deliberately before
pointing this at a database you care about, and note that a per-device override
wins over the global default.

## Access model

Two roles. **Administrator** manages users, devices and data. **Viewer** reads
everything and changes nothing.

Devices announcing on `dataq/connect/+`, `dataq/status/+` or `dataq/image/+` are
created and enabled immediately, including retained announcements replayed when
the client subscribes. Removing a device deletes it and its recorded paths
permanently — and if the device is still publishing, it will be discovered again
within seconds.

Device credentials are encrypted with AES-256-GCM before being written to
MongoDB and decrypted only at the VAPIX boundary.

## Before you point this at data you care about

1. Take and **verify** a `mongodump` backup.
2. Check `dataRetentionDays` against the history you actually want to keep.
3. Rehearse the whole thing against a restored copy first.
4. Keep the previous images and the pre-change dump through your rollback window.

## Repository layout

```text
src/                 Express, MongoDB, MQTT, WebSocket, integrations
web/                 React/Vite application
scripts/init.js      Deployment initialiser, shipped inside the image
public/              Server-owned static assets
config.yaml          Non-secret installation configuration
.env.example         Deployment and secret variable template
Dockerfile           Multi-stage web and server image
docker-compose.yml   Application; docker-compose.mongodb.yml adds the database
```

## Further reading

- [AGENTS.md](AGENTS.md) — customising this codebase, with or without an LLM
- [API.md](API.md) — REST and WebSocket reference
- [DataQ ACAP](https://pandosme.github.io/acap/2025/01/18/DataQ.html) — the device-side agent

## License

MIT. Use it, fork it, rewrite it. No warranty of any kind.
