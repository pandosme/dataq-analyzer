# DataQ Analyzer Backend - API Documentation

This document describes the REST API for integrating client applications with the DataQ Analyzer backend server.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [REST API Endpoints](#api-endpoints)
  - [Authentication Endpoints](#authentication-endpoints)
  - [Camera Endpoints](#camera-endpoints)
  - [Path Events Endpoints](#path-events-endpoints)
  - [Occupancy Endpoints](#occupancy-endpoints)
  - [Counter Sets Endpoints](#counter-sets-endpoints)
- [WebSocket API](#websocket-api)
  - [WebSocket Authentication](#websocket-authentication)
  - [Client Messages](#client-messages)
  - [Server Messages](#server-messages)
  - [Connection Lifecycle](#connection-lifecycle)
  - [Authorization](#websocket-authorization)
- [Data Models](#data-models)
- [MongoDB Query Format](#mongodb-query-format)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Overview

**Base URL:** `http://<server-address>:<port>/api`

Default port: `3000`

**Response Format:** All responses are in JSON format with the following structure:

```json
{
  "success": true|false,
  "data": { ... },       // Present on success
  "error": "message"     // Present on failure
}
```

## Authentication

The API uses **JWT (JSON Web Token)** based authentication.

### Authentication Flow

1. **Login** to obtain a JWT token
2. **Include the token** in the `Authorization` header for all subsequent requests
3. Token expires based on server configuration (default: 7 days)

### Authorization Header Format

```
Authorization: Bearer <your-jwt-token>
```

### User Roles

- **admin**: Full access to all endpoints, can manage users and cameras
- **user**: Read-only access to cameras and path events (limited to authorized cameras)

---

## API Endpoints

### Authentication Endpoints

#### POST /api/auth/login

Login and obtain a JWT token.

**Authentication:** None required

**Request Body:**
```json
{
  "username": "admin",
  "password": "your-password"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "username": "admin",
      "email": "admin@example.com",
      "role": "admin",
      "enabled": true,
      "authorizedCameras": []
    }
  }
}
```

**Error Responses:**
- `400 Bad Request`: Missing username or password
- `401 Unauthorized`: Invalid credentials

---

#### GET /api/auth/me

Get current user profile.

**Authentication:** Required (any role)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin",
    "enabled": true,
    "authorizedCameras": []
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token

---

### Camera Endpoints

#### GET /api/cameras

Get all cameras. Regular users only see cameras they're authorized for; admins see all cameras.

**Authentication:** Required (any role)

**Query Parameters:**
- `enabled` (optional): Filter by enabled status (`true` or `false`)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Front Entrance",
      "serialNumber": "B8A44F3024BB",
      "description": "Main entrance camera",
      "location": "Building A - Front Door",
      "cameraType": "remote",
      "ipAddress": "192.0.2.10",
      "rotation": 0,
      "resolution": "1920x1080",
      "aspectRatio": "16:9",
      "mqttTopic": "dataq/path/B8A44F3024BB",
      "enabled": true,
      "deviceStatus": {
        "connected": true,
        "address": "192.0.2.10",
        "networkKbps": 818,
        "cpuAverage": 133,
        "uptimeHours": 355,
        "lastSeen": "2026-01-01T19:43:00.746Z"
      },
      "filters": {
        "objectTypes": ["Human", "Car", "Truck", "Bus"],
        "minAge": 2,
        "minDistance": 20,
        "minDwell": 0
      },
      "snapshot": {
        "base64Image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
        "timestamp": "2026-01-01T19:43:00.746Z"
      },
      "createdAt": "2026-01-01T10:00:00.000Z",
      "updatedAt": "2026-01-01T19:43:00.746Z"
    }
  ]
}
```

---

#### GET /api/cameras/:serialNumber/snapshot

Get the latest snapshot for a camera.

**Authentication:** Required (any role)

**URL Parameters:**
- `serialNumber`: Camera serial number

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "base64Image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "timestamp": "2026-01-01T19:43:00.746Z",
    "rotation": 0,
    "aspectRatio": "16:9"
  }
}
```

---

### Configuration Endpoints

#### GET /api/config

Get system configuration including date format and playback settings.

**Authentication:** Required (admin only)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "dateFormat": "US",
    "playbackConfig": {
      "enabled": true,
      "type": "MediaMTX",
      "serverUrl": "http://dart.internal:9996",
      "hasCredentials": true,
      "preTime": 5,
      "postTime": 5
    },
    "appName": "DataQ Analyzer",
    "defaultPageSize": 100,
    "maxPageSize": 1000,
    "dataRetentionDays": 90,
    "defaultTimeRangeHours": 24
  }
}
```

---

#### PUT /api/config

Update system configuration.

**Authentication:** Required (admin only)

**Request Body:**
```json
{
  "dateFormat": "ISO",
  "playbackConfig": {
    "enabled": true,
    "type": "MediaMTX",
    "serverUrl": "http://dart.internal:9996",
    "preTime": 10,
    "postTime": 10
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "dateFormat": "ISO",
    "playbackConfig": {
      "enabled": true,
      "type": "MediaMTX",
      "serverUrl": "http://dart.internal:9996",
      "hasCredentials": true,
      "preTime": 10,
      "postTime": 10
    }
  }
}
```

**Notes:**
- `dateFormat`: "US", "ISO", or "EU" (changes date display format)
- `playbackConfig.type`: "MediaMTX" (recording server type)
- `playbackConfig.preTime`: Seconds of video before event
- `playbackConfig.postTime`: Seconds of video after event

---

#### GET /api/health

Health check endpoint.

**Authentication:** None required

**Response (200 OK):**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2026-01-01T20:00:00.000Z"
}
```

---

### Path Events Endpoints

Path events are stored exactly as-is from MQTT messages, preserving all original property names.

#### POST /api/paths/query

Query path events using MongoDB query syntax. This endpoint acts as a direct proxy to MongoDB.

**Authentication:** Required (any role)

**Request Body:**
```json
{
  "query": {
    "serial": "B8A44F3024BB",
    "class": "Human",
    "timestamp": {
      "$gte": { "$date": "2026-01-01T00:00:00Z" },
      "$lte": { "$date": "2026-01-02T00:00:00Z" }
    }
  },
  "options": {
    "sort": { "timestamp": -1 },
    "limit": 100,
    "skip": 0,
    "projection": { "path": 0 }
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "id": "1256939",
      "serial": "B8A44F3024BB",
      "name": "Front Entrance",
      "location": "Building A",
      "class": "Human",
      "timestamp": 1735764204,
      "birth": 1735764199,
      "age": 5.2,
      "dwell": 3.5,
      "idle": 0.5,
      "maxIdle": 1.2,
      "dx": 450,
      "dy": 320,
      "bx": 100,
      "by": 200,
      "speed": 125,
      "maxSpeed": 180,
      "confidence": 95,
      "color": "blue",
      "color2": "white",
      "anomaly": null,
      "path": [
        { "x": 100, "y": 200, "d": 0 },
        { "x": 150, "y": 220, "d": 1.2 },
        { "x": 200, "y": 240, "d": 2.4 }
      ],
      "lat": null,
      "lon": null,
      "createdAt": "2026-01-01T19:43:24.893Z",
      "updatedAt": "2026-01-01T19:43:24.893Z"
    }
  ]
}
```

---

#### POST /api/paths/count

Count path events matching a MongoDB query.

**Authentication:** Required (any role)

**Request Body:**
```json
{
  "query": {
    "serial": "B8A44F3024BB",
    "class": "Human",
    "age": { "$gte": 3 }
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "count": 1243
  }
}
```

---

#### POST /api/paths/aggregate

Run a MongoDB aggregation pipeline on path events.

**Authentication:** Required (any role)

**Request Body:**
```json
{
  "pipeline": [
    {
      "$match": {
        "serial": "B8A44F3024BB",
        "timestamp": { "$gte": 1735689600 }
      }
    },
    {
      "$group": {
        "_id": "$class",
        "count": { "$sum": 1 },
        "avgAge": { "$avg": "$age" },
        "avgSpeed": { "$avg": "$speed" }
      }
    },
    {
      "$sort": { "count": -1 }
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "Human",
      "count": 856,
      "avgAge": 4.8,
      "avgSpeed": 142.5
    },
    {
      "_id": "Car",
      "count": 287,
      "avgAge": 3.2,
      "avgSpeed": 215.3
    }
  ]
}
```

---

#### GET /api/paths/:id

Get a specific path event by ID.

**Authentication:** Required (any role)

**URL Parameters:**
- `id`: Path event ID (MongoDB ObjectId)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "id": "1256939",
    "serial": "B8A44F3024BB",
    "name": "Front Entrance",
    "class": "Human",
    "timestamp": 1735764204,
    "birth": 1735764199,
    "age": 5.2,
    "dx": 450,
    "dy": 320,
    "path": [ ... ],
    "createdAt": "2026-01-01T19:43:24.893Z"
  }
}
```

---

#### GET /api/paths

Simple query endpoint for basic use cases. Converts query parameters to MongoDB query.

**Authentication:** Required (any role)

**Query Parameters:**
- `serial`: Filter by camera serial number
- `class`: Filter by object class
- `limit`: Number of results (default: 100, max: 1000)
- `skip`: Number of results to skip
- `sort`: Sort field (default: `timestamp`)
- `order`: Sort order (`asc` or `desc`, default: `desc`)

**Example:**
```
GET /api/paths?serial=B8A44F3024BB&class=Human&limit=50
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [ ... ]
}
```

---

### Occupancy Endpoints

The backend subscribes to `dataq/occupancy/{serial}/{area}` and stores each occupancy snapshot when a label count changes or on the configured periodic interval. A camera can publish multiple areas, each representing its own camera-defined bounding box; snapshots and timelines are kept independent by serial and area. The topic serial and area are authoritative. Fractional epoch-millisecond payload timestamps are normalized to whole milliseconds. Each payload is a complete sparse snapshot: omitted labels have a count of zero, and an empty `occupancy` object means that the area is empty.

```json
{
  "area": "Area 1",
  "occupancy": {
    "Car": 5,
    "Truck": 1,
    "Bus": 0
  },
  "timestamp": 1789574520383.581,
  "name": "Beach Camera",
  "location": "Habo",
  "serial": "B8A44FD7DED1"
}
```

#### GET /api/occupancy/areas

List areas and all historically observed labels for a camera. Labels remain available when the latest sparse snapshot is empty.

**Authentication:** Required (any role)

**Query Parameters:**
- `serial` (required): Camera serial number

#### GET /api/occupancy/series

Return a bounded, bucketed occupancy timeline. Values are carried forward between snapshots and should be rendered as stepped series. Every point includes all historically observed labels; labels omitted from a snapshot are returned with a count of zero.

**Authentication:** Required (any role)

**Query Parameters:**
- `serial` (required): Camera serial number
- `area` (required): Occupancy area name
- `range` (optional): `15m`, `30m`, `1h`, `6h`, `12h`, `1d`, or `1w` (default: `1h`)
- `to` (optional): Timeline end as epoch milliseconds (default: current time)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "serial": "B8A44FD7DED1",
    "area": "Area 1",
    "range": "1h",
    "from": 1789570920000,
    "to": 1789574520000,
    "bucketMs": 120000,
    "labels": ["Bus", "Car", "Truck"],
    "points": [
      { "timestamp": 1789571040000, "Bus": 0, "Car": 5, "Truck": 1 }
    ]
  }
}
```

---

### Counter Sets Endpoints

Counter sets count directional flows between named zones drawn on a camera view. Each set is linked to one camera (by serial number), defines 2–6 rectangular zones, and automatically generates a counter for every directional pair (A→B, B→A, A→C, …). Counts are updated in real-time as path events arrive and can also be backfilled from historical data.

Counts are published periodically to an MQTT topic if `mqttTopic` and `mqttInterval` are configured.

#### GET /api/counters

List all counter sets.

**Authentication:** Required (any role)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Main Entrance",
      "serial": "B8A44F3024BB",
      "objectClasses": ["Human", "Car"],
      "zones": [
        { "label": "A", "name": "Outside", "rect": { "x1": 0, "y1": 0, "x2": 400, "y2": 1000 } },
        { "label": "B", "name": "Inside",  "rect": { "x1": 600, "y1": 0, "x2": 1000, "y2": 1000 } }
      ],
      "counters": [
        { "id": "A->B", "from": "A", "to": "B", "name": "A → B", "enabled": true, "total": 142, "byClass": { "Human": 130, "Car": 12 } },
        { "id": "B->A", "from": "B", "to": "A", "name": "B → A", "enabled": true, "total": 98,  "byClass": { "Human": 90,  "Car": 8  } }
      ],
      "mqttTopic": "dataq/counters/main-entrance",
      "mqttInterval": 60,
      "days": 7,
      "backfill": { "status": "complete", "totalPaths": 5200, "processedPaths": 5200 },
      "createdAt": "2026-01-01T10:00:00.000Z",
      "updatedAt": "2026-02-01T08:00:00.000Z"
    }
  ]
}
```

---

#### POST /api/counters

Create a new counter set. A backfill from historical path event data starts automatically.

**Authentication:** Required (admin only)

**Request Body:**
```json
{
  "name": "Main Entrance",
  "serial": "B8A44F3024BB",
  "objectClasses": ["Human", "Car"],
  "zones": [
    { "label": "A", "name": "Outside", "rect": { "x1": 0,   "y1": 0, "x2": 400,  "y2": 1000 } },
    { "label": "B", "name": "Inside",  "rect": { "x1": 600, "y1": 0, "x2": 1000, "y2": 1000 } }
  ],
  "mqttTopic": "dataq/counters/main-entrance",
  "mqttInterval": 60,
  "counters": [
    { "id": "A->B", "name": "Entries", "enabled": true },
    { "id": "B->A", "name": "Exits",   "enabled": true }
  ]
}
```

**Fields:**
- `name` (string, required): Unique display name
- `serial` (string, required): Camera serial number
- `objectClasses` (array of strings, required): Object classes to count (e.g. `["Human", "Car"]`)
- `zones` (array, required): 2–6 zone definitions
  - `label` (string): Short unique label (A, B, C …)
  - `name` (string, optional): Display name
  - `rect`: Bounding rectangle in 0–1000 coordinate space: `x1`, `y1`, `x2`, `y2`
- `mqttTopic` (string, optional): MQTT topic to publish counter totals to
- `mqttInterval` (number, optional): Publish interval in seconds (default: 60)
- `counters` (array, optional): Override generated counter names or enabled flags

Counters are auto-generated for every directional pair from the zones list. The `counters` field in the request is only used to set custom names or disable specific directions.

**Response (201 Created):** Returns the created counter set document.

**Error Responses:**
- `400 Bad Request`: Missing required fields or invalid zone count
- `409 Conflict`: A counter set with that name already exists

---

#### GET /api/counters/:id

Get a single counter set by ID.

**Authentication:** Required (any role)

**Response (200 OK):** Returns the counter set document.

---

#### PUT /api/counters/:id

Update a counter set. If zones change (labels or geometry), counters are reset and a new backfill is triggered automatically.

**Authentication:** Required (admin only)

**Request Body (all fields optional):**
```json
{
  "name": "Updated Name",
  "objectClasses": ["Human"],
  "mqttTopic": "dataq/counters/entrance",
  "mqttInterval": 30,
  "zones": [ ... ],
  "counters": [
    { "id": "A->B", "name": "Entries", "enabled": true }
  ],
  "recount": true
}
```

Set `recount: true` to force a full backfill recount without changing zones.

**Response (200 OK):** Returns the updated counter set document.

---

#### DELETE /api/counters/:id

Delete a counter set and stop its MQTT publish timer.

**Authentication:** Required (admin only)

**Response (200 OK):**
```json
{ "success": true, "data": { "deleted": true } }
```

---

#### GET /api/counters/:id/backfill

Get the current backfill status for a counter set.

**Authentication:** Required (any role)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "running",
    "totalPaths": 5200,
    "processedPaths": 3100,
    "startedAt": "2026-02-01T08:00:00.000Z",
    "completedAt": null,
    "error": null
  }
}
```

`status` values: `idle`, `running`, `complete`, `failed`

---

#### POST /api/counters/:id/backfill

Trigger a backfill recount. Resets all counter totals to zero and recounts from stored path events.

**Authentication:** Required (admin only)

**Response (200 OK):**
```json
{ "success": true, "data": { "status": "running", "message": "Backfill started" } }
```

---

#### POST /api/counters/:id/reset

Reset all counters in a set to zero (does not recount from history).

**Authentication:** Required (admin only)

**Response (200 OK):** Returns the updated counter set document.

---

#### POST /api/counters/:id/counters/:counterId/reset

Reset a single counter to zero. The `counterId` must be URL-encoded (e.g. `A-%3EB` for `A->B`).

**Authentication:** Required (admin only)

**Response (200 OK):** Returns the updated counter set document.

---

#### MQTT Publish Format

When `mqttTopic` is set, the backend publishes this payload every `mqttInterval` seconds:

```json
{
  "name": "Main Entrance",
  "serial": "B8A44F3024BB",
  "timestamp": 1740000000,
  "days": 7,
  "counters": [
    { "direction": "A->B", "name": "Entries", "total": 142, "Human": 130, "Car": 12 },
    { "direction": "B->A", "name": "Exits",   "total": 98,  "Human": 90,  "Car": 8  }
  ]
}
```

Per-class counts are flattened as top-level properties on each counter entry.

---

#### Telemetry / Analytics (legacy)

These endpoints provide aggregate statistics over raw path events directly, without requiring a counter set.

**GET /api/counters/cameras** — Total path event counts grouped by camera serial.

Query parameters: `since` (ISO date, optional) — only count events after this timestamp.

```json
{ "success": true, "data": [ { "serial": "B8A44F3024BB", "count": 4820 } ] }
```

**GET /api/counters/cameras/:serial/series** — Time-series counts for one camera.

Query parameters: `interval` (`hour` or `day`, default `day`), `rangeDays` (default `30`).

```json
{ "success": true, "data": [ { "bucketStart": "2026-01-01T00:00:00.000Z", "count": 312 } ] }
```

**POST /api/counters/cleanup** — Manually trigger the data retention cleanup job.

---

## WebSocket API

The WebSocket endpoint provides real-time streaming of path events from DataQ cameras to connected clients.

### WebSocket Endpoint

```
ws://<server-address>:<port>/ws/paths
```

**Examples:**
- Development: `ws://localhost:3000/ws/paths`
- Production: `wss://dataq.example.com/ws/paths`

### WebSocket Authentication

WebSocket connections require JWT authentication via query parameter.

**Connection URL Format:**
```
ws://localhost:3000/ws/paths?token=<jwt-token>
```

**Authentication Flow:**
1. Obtain JWT token via `/api/auth/login` endpoint
2. Establish WebSocket connection with token in query string
3. Server validates the JWT token
4. If valid, connection is established and `connected` message is sent
5. If invalid, connection is rejected with error code

**Error Codes:**
- `4001`: Authentication failed (invalid or missing token)
- `4003`: Forbidden (account disabled)

### Client Messages

All messages are JSON-encoded strings.

#### Subscribe to Cameras

Subscribe to path events from specific cameras with optional filters.

**Message Format:**
```json
{
  "type": "subscribe",
  "cameras": ["B8A44F3024BB", "A1B2C3D4E5F6"],
  "filters": {
    "classes": ["Human", "Car"],
    "minAge": 3,
    "minDistance": 20,
    "minDwell": 2
  }
}
```

**Fields:**
- `type` (string, required): Must be `"subscribe"`
- `cameras` (array of strings, optional): Camera serial numbers to subscribe to
  - If omitted or empty: subscribe to all authorized cameras
  - Admin users: can subscribe to any cameras
  - Regular users: only authorized cameras will be subscribed
- `filters` (object, optional): Filter criteria for events
  - `classes` (array of strings): Object classes to include (e.g., "Human", "Car", "Truck")
  - `minAge` (number): Minimum age in seconds
  - `minDistance` (number): Minimum distance traveled in pixels
  - `minDwell` (number): Minimum dwell time in seconds

**Server Response:**
```json
{
  "type": "subscribed",
  "cameras": ["B8A44F3024BB", "A1B2C3D4E5F6"],
  "timestamp": "2026-01-02T10:00:00.000Z"
}
```

If some cameras were not authorized, an additional error message is sent:
```json
{
  "type": "error",
  "error": "Some cameras were not authorized: A1B2C3D4E5F6",
  "code": "UNAUTHORIZED",
  "timestamp": "2026-01-02T10:00:00.000Z"
}
```

#### Unsubscribe from Cameras

Unsubscribe from specific cameras.

**Message Format:**
```json
{
  "type": "unsubscribe",
  "cameras": ["B8A44F3024BB"]
}
```

**Fields:**
- `type` (string, required): Must be `"unsubscribe"`
- `cameras` (array of strings, required): Camera serial numbers to unsubscribe from

**Server Response:**
```json
{
  "type": "unsubscribed",
  "cameras": ["B8A44F3024BB"],
  "timestamp": "2026-01-02T10:00:00.000Z"
}
```

#### Ping (Keep-Alive)

Send a ping to keep the connection alive and verify server responsiveness.

**Message Format:**
```json
{
  "type": "ping"
}
```

**Server Response:**
```json
{
  "type": "pong",
  "timestamp": "2026-01-02T10:00:00.000Z"
}
```

### Server Messages

#### Connected Confirmation

Sent immediately after successful connection.

```json
{
  "type": "connected",
  "message": "WebSocket connection established",
  "userId": "507f1f77bcf86cd799439011",
  "timestamp": "2026-01-02T10:00:00.000Z"
}
```

#### Path Event

Real-time path event from subscribed cameras.

```json
{
  "type": "path",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "id": "1256939",
    "serial": "B8A44F3024BB",
    "name": "Front Entrance",
    "location": "Building A",
    "class": "Human",
    "timestamp": 1735764204,
    "birth": 1735764199,
    "age": 5.2,
    "dwell": 3.5,
    "idle": 0.5,
    "maxIdle": 1.2,
    "dx": 450,
    "dy": 320,
    "bx": 100,
    "by": 200,
    "speed": 125,
    "maxSpeed": 180,
    "confidence": 95,
    "color": "blue",
    "color2": "white",
    "path": [
      { "x": 100, "y": 200, "d": 0 },
      { "x": 150, "y": 220, "d": 1.2 },
      { "x": 200, "y": 240, "d": 2.4 }
    ],
    "createdAt": "2026-01-02T10:00:00.000Z",
    "updatedAt": "2026-01-02T10:00:00.000Z"
  }
}
```

**Note:** The `data` object contains the complete path event with all fields from the MQTT message plus MongoDB metadata fields (`_id`, `createdAt`, `updatedAt`).

#### Error Message

Error notifications for invalid requests or authorization issues.

```json
{
  "type": "error",
  "error": "Invalid subscription request",
  "code": "INVALID_REQUEST",
  "timestamp": "2026-01-02T10:00:00.000Z"
}
```

**Error Codes:**
- `INVALID_REQUEST`: Malformed request message or invalid JSON
- `UNAUTHORIZED`: User not authorized for requested cameras
- `INTERNAL_ERROR`: Server-side error

### Connection Lifecycle

1. **Establish Connection**
   - Client connects to `ws://localhost:3000/ws/paths?token=<jwt>`
   - Server validates JWT token
   - Server sends `connected` message

2. **Subscribe to Events**
   - Client sends `subscribe` message with cameras and filters
   - Server validates authorization
   - Server sends `subscribed` confirmation
   - Server begins sending matching path events

3. **Receive Events**
   - Client receives `path` messages for matching events
   - Events are filtered server-side based on subscriptions

4. **Update Subscriptions**
   - Client can send additional `subscribe` messages to update filters
   - Client can send `unsubscribe` messages to remove cameras

5. **Disconnection**
   - Client or server closes WebSocket connection
   - Server automatically cleans up subscriptions

### WebSocket Authorization

Authorization is enforced based on user roles and camera access:

**Admin Users:**
- Can subscribe to all cameras
- No camera restrictions
- Empty `cameras` array = all cameras

**Regular Users:**
- Can only subscribe to cameras in their `authorizedCameras` list
- Attempting to subscribe to unauthorized cameras returns an error
- Only authorized cameras are included in `subscribed` response
- Empty `cameras` array = all authorized cameras for that user

**Authorization Check Flow:**
1. Server receives subscription request
2. For each requested camera:
   - If user is admin: allow
   - If user is regular: check if camera is in user's `authorizedCameras`
   - If not authorized: exclude camera from subscription
3. Send `subscribed` confirmation with only authorized cameras
4. If some cameras were excluded, send additional error message

### WebSocket Usage Examples

#### JavaScript/Node.js Client

```javascript
const WebSocket = require('ws');

// Obtain JWT token first via REST API
const token = 'your-jwt-token-here';

// Connect to WebSocket
const ws = new WebSocket(`ws://localhost:3000/ws/paths?token=${token}`);

ws.on('open', () => {
  console.log('Connected to WebSocket');

  // Subscribe to specific cameras with filters
  ws.send(JSON.stringify({
    type: 'subscribe',
    cameras: ['B8A44F3024BB'],
    filters: {
      classes: ['Human'],
      minAge: 3,
      minDistance: 20
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);

  switch (msg.type) {
    case 'connected':
      console.log('Connection established:', msg.userId);
      break;

    case 'subscribed':
      console.log('Subscribed to cameras:', msg.cameras);
      break;

    case 'path':
      console.log('Path event received:', {
        id: msg.data.id,
        serial: msg.data.serial,
        class: msg.data.class,
        age: msg.data.age
      });
      break;

    case 'error':
      console.error('Error:', msg.error, `(${msg.code})`);
      break;

    case 'pong':
      console.log('Pong received');
      break;
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('Disconnected from WebSocket');
});

// Send ping every 30 seconds
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);
```

#### Browser Client

```html
<!DOCTYPE html>
<html>
<head>
  <title>DataQ WebSocket Client</title>
</head>
<body>
  <h1>DataQ Path Events</h1>
  <div id="events"></div>

  <script>
    const token = 'your-jwt-token-here';
    const ws = new WebSocket(`ws://localhost:3000/ws/paths?token=${token}`);

    ws.onopen = () => {
      console.log('Connected');

      // Subscribe to all authorized cameras
      ws.send(JSON.stringify({
        type: 'subscribe',
        filters: { minAge: 2 }
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'path') {
        const div = document.createElement('div');
        div.textContent = `${msg.data.serial}: ${msg.data.class} (age: ${msg.data.age}s)`;
        document.getElementById('events').appendChild(div);
      }
    };
  </script>
</body>
</html>
```

#### Testing with wscat

```bash
# Install wscat
npm install -g wscat

# Get JWT token
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}' \
  | jq -r '.data.token')

# Connect to WebSocket
wscat -c "ws://localhost:3000/ws/paths?token=$TOKEN"

# Once connected, send messages:
# Subscribe to camera
{"type":"subscribe","cameras":["B8A44F3024BB"]}

# Subscribe with filters
{"type":"subscribe","cameras":["B8A44F3024BB"],"filters":{"classes":["Human"],"minAge":3}}

# Ping
{"type":"ping"}

# Unsubscribe
{"type":"unsubscribe","cameras":["B8A44F3024BB"]}
```

### Performance Considerations

1. **Server-Side Filtering**: All filters are applied server-side before sending events, reducing bandwidth usage
2. **Efficient Broadcasting**: Events are only sent to clients subscribed to the specific camera
3. **Connection Limits**: Consider implementing rate limiting for production deployments
4. **Heartbeat**: Use ping/pong messages to detect dead connections
5. **Compression**: WebSocket compression can be enabled for large event volumes

### Security Considerations

1. **Authentication**: Always validate JWT tokens before accepting connections
2. **Authorization**: Camera access controls are enforced based on user roles
3. **Input Validation**: All incoming messages are validated
4. **CORS**: WebSocket server accepts connections from any origin (CORS = *)
5. **Rate Limiting**: Consider implementing rate limiting in production

---

## WebSocket Video Streaming API

The video WebSocket endpoint provides on-demand retrieval of recorded clips from MediaMTX.

### Video WebSocket Endpoint

```
ws://<server-address>:<port>/ws/video
```

**Examples:**
- Development: `ws://localhost:3000/ws/video`
- Production: `wss://dataq.example.com/ws/video`

### Video WebSocket Authentication

Video WebSocket connections require JWT authentication via query parameter (same as path events).

**Connection URL Format:**
```
ws://localhost:3000/ws/video?token=<jwt-token>
```

**Authentication Flow:**
1. Obtain JWT token via `/api/auth/login` endpoint
2. Establish WebSocket connection with token in query string
3. Server validates the JWT token
4. If valid, connection is established and `connected` message is sent
5. If invalid, connection is rejected with error code

### Video Client Messages

All messages are JSON-encoded strings.

#### Request Video

Request a video clip from a specific camera at a specific timestamp.

**Message Format:**
```json
{
  "type": "request_video",
  "serial": "B8A44F3024BB",
  "timestamp": "2026-01-02T12:34:56.789Z",
  "preTime": 5,
  "postTime": 10,
  "format": "mp4"
}
```

**Fields:**
- `type` (string, required): Must be `"request_video"`
- `serial` (string, required): Camera serial number
- `timestamp` (string, required): Event timestamp (ISO 8601 format)
- `preTime` (number, optional): Seconds before timestamp to include (defaults to system config)
- `postTime` (number, optional): Seconds after timestamp to include (defaults to system config)
- `format` (string, optional): Video format (default: "mp4")

**Notes:**
- If `preTime` and `postTime` are not provided, backend uses values from system configuration
- Client applications never receive MediaMTX credentials or contact the media server directly
- Backend automatically queries the configured recording server
- **Playback Offset:** The frontend player automatically sets the initial playback position to `preTime` seconds into the clip. This means the video starts playing at the moment the event occurred, not at the beginning of the clip. Users can scrub backward to see the pre-event footage.

#### Close Video

Close the current video stream.

**Message Format:**
```json
{
  "type": "close_video"
}
```

#### Ping (Keep-Alive)

Send a ping to keep the connection alive.

**Message Format:**
```json
{
  "type": "ping"
}
```

**Server Response:**
```json
{
  "type": "pong"
}
```

### Video Server Messages

#### Connected Confirmation

Sent immediately after successful connection.

```json
{
  "type": "connected",
  "message": "Video WebSocket connection established",
  "userId": "507f1f77bcf86cd799439011",
  "timestamp": "2026-01-02T10:00:00.000Z"
}
```

#### Video Metadata

Sent first, before any video chunks.

```json
{
  "type": "video_metadata",
  "duration": 15.5,
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "codec": "h264",
  "mimeType": "video/mp4; codecs=\"avc1.640029\""
}
```

**Fields:**
- `duration` (number): Total video duration in seconds
- `width` (number): Video width in pixels
- `height` (number): Video height in pixels
- `fps` (number): Frames per second
- `codec` (string): Video codec (e.g., "h264", "h265")
- `mimeType` (string): MIME type for use with HTML5 MediaSource API (includes specific H.264 codec profile)

**Notes:**
- The backend automatically fragments regular MP4 files into fragmented MP4 (fMP4) format required by MediaSource API
- The MIME type includes the specific H.264 codec profile string (e.g., "avc1.640029" for High Profile Level 4.1)
- Original MP4 files from recording servers have the moov atom at the end; ffmpeg relocates it to the beginning

#### Video Chunk

Binary WebSocket message containing video data.

The server streams the video in chunks as binary messages. These should be collected and reassembled client-side.

**Format:** Binary WebSocket message (not JSON)

#### Video Complete

Sent after all video chunks have been transmitted.

```json
{
  "type": "video_complete"
}
```

#### Video Error

Error message during video streaming.

```json
{
  "type": "error",
  "message": "Video not found for requested time period",
  "code": "VIDEO_NOT_FOUND"
}
```

**Error Codes:**
- `VIDEO_NOT_FOUND`: No recording available for the requested time period
- `RECORDING_SERVER_ERROR`: MediaMTX recording server is unavailable
- `CAMERA_NOT_FOUND`: Camera serial number not found in system
- `PLAYBACK_DISABLED`: Video playback is disabled in system configuration
- `INVALID_REQUEST`: Missing or invalid required fields
- `STREAM_ERROR`: Error occurred during video streaming
- `UNKNOWN_ERROR`: Unexpected error occurred

### Video Connection Lifecycle

1. **Establish Connection**
   - Client connects to `ws://localhost:3000/ws/video?token=<jwt>`
   - Server validates JWT token
   - Server sends `connected` message

2. **Request Video**
   - Client sends `request_video` message with camera serial and timestamp
  - Backend queries the configured MediaMTX recording server
   - Server sends `video_metadata` message

3. **Receive Video**
   - Server streams video chunks as binary messages
   - Client collects and buffers chunks
   - Server sends `video_complete` when done

4. **Request Another Video**
   - Client can send another `request_video` message
   - Previous stream is automatically closed

5. **Disconnection**
   - Client sends `close_video` message (optional)
   - Client or server closes WebSocket connection
   - Server automatically cleans up any active streams

### Video WebSocket Usage Examples

#### JavaScript/Browser Client

```javascript
const token = 'your-jwt-token-here';
const ws = new WebSocket(`ws://localhost:3000/ws/video?token=${token}`);

let videoChunks = [];
let videoMetadata = null;

ws.onopen = () => {
  console.log('Connected to video WebSocket');

  // Request video clip
  ws.send(JSON.stringify({
    type: 'request_video',
    serial: 'B8A44F3024BB',
    timestamp: '2026-01-02T12:34:56.789Z'
    // preTime and postTime will use server defaults
  }));
};

ws.onmessage = (event) => {
  if (typeof event.data === 'string') {
    // JSON message
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case 'connected':
        console.log('Video connection established');
        break;

      case 'video_metadata':
        console.log('Video metadata received:', msg);
        videoMetadata = msg;
        videoChunks = [];
        break;

      case 'video_complete':
        console.log('Video complete, reassembling...');
        const videoBlob = new Blob(videoChunks, { type: videoMetadata.mimeType });
        const videoUrl = URL.createObjectURL(videoBlob);

        // Display video
        const videoElement = document.getElementById('video-player');
        videoElement.src = videoUrl;
        videoElement.play();
        break;

      case 'error':
        console.error('Video error:', msg.message, msg.code);
        break;
    }
  } else {
    // Binary chunk
    videoChunks.push(event.data);
    console.log(`Received chunk ${videoChunks.length}`);
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('WebSocket closed');
};
```

#### Node.js Client

```javascript
const WebSocket = require('ws');
const fs = require('fs');

const token = 'your-jwt-token-here';
const ws = new WebSocket(`ws://localhost:3000/ws/video?token=${token}`);

let videoChunks = [];
let videoMetadata = null;

ws.on('open', () => {
  console.log('Connected to video WebSocket');

  ws.send(JSON.stringify({
    type: 'request_video',
    serial: 'B8A44F3024BB',
    timestamp: '2026-01-02T12:34:56.789Z',
    preTime: 5,
    postTime: 10
  }));
});

ws.on('message', (data) => {
  if (typeof data === 'string') {
    const msg = JSON.parse(data);

    switch (msg.type) {
      case 'video_metadata':
        console.log('Metadata:', msg);
        videoMetadata = msg;
        videoChunks = [];
        break;

      case 'video_complete':
        console.log('Video complete, saving to file...');
        const videoBuffer = Buffer.concat(videoChunks);
        fs.writeFileSync('output.mp4', videoBuffer);
        console.log('Video saved to output.mp4');
        ws.close();
        break;

      case 'error':
        console.error('Error:', msg.message, msg.code);
        ws.close();
        break;
    }
  } else {
    // Binary chunk
    videoChunks.push(data);
    console.log(`Chunk ${videoChunks.length} received (${data.length} bytes)`);
  }
});
```

#### wscat Testing

```bash
# Connect to video WebSocket
wscat -c "ws://localhost:3000/ws/video?token=YOUR_JWT_TOKEN"

# Request video (send as JSON)
{"type":"request_video","serial":"B8A44F3024BB","timestamp":"2026-01-02T12:34:56.789Z"}

# Ping
{"type":"ping"}

# Close video
{"type":"close_video"}
```

**Note:** wscat will display binary chunks as raw data, which is not human-readable. Use a proper WebSocket client for testing video streaming.

### Video Playback Configuration

Video playback must be configured in the system settings before use.

**Configuration Fields:**
- `playback.enabled` (boolean): Enable/disable video playback feature
- `playback.type` (string): Recording server type ("MediaMTX")
- `playback.serverUrl` (string): Recording server URL
- `MEDIAMTX_USERNAME` / `MEDIAMTX_PASSWORD`: Server-side MediaMTX credentials
- `playback.preTime` (number): Default seconds before event timestamp (0-60)
- `playback.postTime` (number): Default seconds after event timestamp (0-60)

**Example Configuration:**
```json
{
  "playback": {
    "enabled": true,
    "type": "MediaMTX",
    "serverUrl": "http://dart.internal:9996",
    "preTime": 5,
    "postTime": 10
  }
}
```

**Security Note:** The backend proxies video from the recording server. Client applications never have direct access to recording server credentials or URLs.

### Video Performance Considerations

1. **Video Processing Pipeline:**
  - MediaMTX returns a time-bounded MP4 recording stream
  - Backend proxies the stream directly to the authenticated WebSocket client
  - No temporary files, buffering, or transcoding are required

2. **Chunked Streaming**: Videos are streamed in chunks to avoid memory issues on client

3. **Concurrent Streams**: Backend supports multiple concurrent video streams

4. **Timeout Handling**: Video requests have a 60-second timeout to accommodate large clips

5. **Resource Cleanup**: Video streams and temporary files are automatically cleaned up on connection close

6. **Bandwidth**: Video streaming uses significant bandwidth; consider network capacity

7. **Performance Metrics** (4-second clip example):
   - Download from recording server: ~390 KB
   - Temporary disk usage: ~390 KB (deleted after ~1-2 seconds)
   - Memory spike during buffering: ~390 KB
   - Output chunks: ~150-180 fragmented chunks
   - Network bandwidth: ~98 KB/second

8. **MediaSource API**: Frontend uses MediaSource API with sequential chunk processing for smooth playback

9. **Playback Offset**: Frontend automatically sets initial playback position to event timestamp (`preTime` offset)

### Video Security Considerations

1. **Authentication**: JWT token required for all connections
2. **Credential Isolation**: Recording server credentials never exposed to clients
3. **Authorization**: User must be authenticated (camera-level authorization may be added)
4. **Proxy Pattern**: Backend acts as secure proxy to recording servers
5. **Error Handling**: Errors are sanitized before sending to client

---

## Data Models

### Camera Object

```typescript
{
  _id: string;                    // MongoDB ObjectId
  name: string;                   // Camera display name
  serialNumber: string;           // Unique camera serial number
  description?: string;           // Optional description
  location?: string;              // Physical location
  cameraType: "local" | "remote"; // Camera type
  ipAddress?: string;             // IP address (for local cameras)
  rotation: number;               // Image rotation in degrees (0, 90, 180, 270)
  resolution: string;             // Resolution (e.g., "1920x1080")
  aspectRatio: string;            // Aspect ratio (e.g., "16:9")
  mqttTopic: string;              // MQTT topic for this camera
  enabled: boolean;               // Whether camera is active
  deviceStatus: {
    connected: boolean;           // Connection status
    address: string;              // Device IP address
    networkKbps: number;          // Network throughput
    cpuAverage: number;           // CPU usage percentage
    uptimeHours: number;          // Uptime in hours
    lastSeen: string;             // ISO 8601 timestamp
  };
  filters: {
    objectTypes: string[];        // Allowed object types
    minAge: number;               // Minimum age filter (seconds)
    minDistance: number;          // Minimum distance filter (percentage)
    minDwell: number;             // Minimum dwell filter (seconds)
  };
  snapshot?: {
    base64Image: string;          // Base64-encoded JPEG image
    timestamp: string;            // ISO 8601 timestamp
  };
  createdAt: string;              // ISO 8601 timestamp
  updatedAt: string;              // ISO 8601 timestamp
}
```

### Path Event Object (DataQ MQTT Message)

**IMPORTANT:** Path events are stored as-is from MQTT messages with original property names.

Common fields from DataQ devices:

```typescript
{
  _id: string;                    // MongoDB ObjectId (added by database)
  id: string;                     // Tracking ID from DataQ
  serial: string;                 // Camera serial number
  device?: string;                // Alternative serial field
  name?: string;                  // Camera name
  location?: string;              // Camera location
  class: string;                  // Object class (Human, Car, Truck, Bus, etc.)
  timestamp: number;              // Unix epoch timestamp (seconds)
  birth: number;                  // Object birth timestamp
  age: number;                    // Tracking age in seconds
  dwell: number;                  // Dwell time in seconds
  idle: number;                   // Idle time in seconds
  maxIdle: number;                // Maximum idle time
  dx: number;                     // X displacement
  dy: number;                     // Y displacement
  bx?: number;                    // Birth X coordinate
  by?: number;                    // Birth Y coordinate
  speed: number;                  // Average speed
  maxSpeed: number;               // Maximum speed
  confidence?: number;            // Detection confidence (0-100)
  color?: string;                 // Primary color
  color2?: string;                // Secondary color
  anomaly?: string;               // Anomaly detection result
  path: Array<{                   // Path trajectory points
    x: number;                    // X coordinate (0-1000)
    y: number;                    // Y coordinate (0-1000)
    d: number;                    // Dwell time at this point
    cx?: number;                  // Alternative X coordinate
    cy?: number;                  // Alternative Y coordinate
    lat?: number;                 // GPS latitude (if available)
    lon?: number;                 // GPS longitude (if available)
  }>;
  lat?: number;                   // GPS latitude (if geospace enabled)
  lon?: number;                   // GPS longitude (if geospace enabled)
  localTime?: string;             // Local time string
  createdAt: string;              // ISO 8601 timestamp (added by database)
  updatedAt: string;              // ISO 8601 timestamp (added by database)
}
```

---

## MongoDB Query Format

The path events API uses MongoDB query syntax directly. This allows for powerful and flexible queries.

### Query Operators

**Comparison:**
- `$eq`: Equal to
- `$ne`: Not equal to
- `$gt`: Greater than
- `$gte`: Greater than or equal to
- `$lt`: Less than
- `$lte`: Less than or equal to
- `$in`: In array
- `$nin`: Not in array

**Logical:**
- `$and`: AND condition
- `$or`: OR condition
- `$not`: NOT condition
- `$nor`: NOR condition

**Element:**
- `$exists`: Field exists
- `$type`: Field type

**Array:**
- `$size`: Array size
- `$elemMatch`: Array element match

### Query Examples

**Filter by serial and class:**
```json
{
  "serial": "B8A44F3024BB",
  "class": "Human"
}
```

**Filter by timestamp range:**
```json
{
  "timestamp": {
    "$gte": 1735689600,
    "$lte": 1735776000
  }
}
```

**Filter by age greater than 3 seconds:**
```json
{
  "age": { "$gte": 3 }
}
```

**Filter by multiple classes:**
```json
{
  "class": { "$in": ["Human", "Car", "Truck"] }
}
```

**Complex query with AND/OR:**
```json
{
  "$and": [
    { "serial": "B8A44F3024BB" },
    {
      "$or": [
        { "class": "Human", "age": { "$gte": 5 } },
        { "class": "Car", "speed": { "$gte": 100 } }
      ]
    }
  ]
}
```

**Filter paths with more than 5 points:**
```json
{
  "path": { "$size": { "$gt": 5 } }
}
```

### Sort Options

Sort by single field:
```json
{
  "sort": { "timestamp": -1 }
}
```

Sort by multiple fields:
```json
{
  "sort": { "serial": 1, "timestamp": -1 }
}
```

### Projection

Exclude fields from results:
```json
{
  "projection": { "path": 0, "rawPayload": 0 }
}
```

Include only specific fields:
```json
{
  "projection": { "id": 1, "serial": 1, "class": 1, "timestamp": 1 }
}
```

---

## Error Handling

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

### Common HTTP Status Codes

- `200 OK`: Successful request
- `201 Created`: Resource successfully created
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource already exists
- `500 Internal Server Error`: Server error

---

## Examples

### Example 1: Login and Get Cameras

```bash
# 1. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your-password"
  }'

# 2. Get all cameras (using the token)
curl http://localhost:3000/api/cameras \
  -H "Authorization: Bearer <your-token>"
```

### Example 2: Query Path Events with MongoDB Syntax

```bash
# Query human detections with age >= 3 seconds
curl -X POST http://localhost:3000/api/paths/query \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "class": "Human",
      "age": { "$gte": 3 }
    },
    "options": {
      "sort": { "timestamp": -1 },
      "limit": 50
    }
  }'

# Query events from specific camera in time range
curl -X POST http://localhost:3000/api/paths/query \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "serial": "B8A44F3024BB",
      "timestamp": {
        "$gte": 1735689600,
        "$lte": 1735776000
      }
    },
    "options": {
      "sort": { "timestamp": -1 },
      "limit": 100
    }
  }'
```

### Example 3: Count Events

```bash
curl -X POST http://localhost:3000/api/paths/count \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "serial": "B8A44F3024BB",
      "class": "Human"
    }
  }'
```

### Example 4: Aggregation Pipeline

```bash
# Get statistics by class for a camera
curl -X POST http://localhost:3000/api/paths/aggregate \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline": [
      {
        "$match": {
          "serial": "B8A44F3024BB",
          "timestamp": { "$gte": 1735689600 }
        }
      },
      {
        "$group": {
          "_id": "$class",
          "count": { "$sum": 1 },
          "avgAge": { "$avg": "$age" },
          "avgSpeed": { "$avg": "$speed" },
          "maxSpeed": { "$max": "$maxSpeed" }
        }
      },
      {
        "$sort": { "count": -1 }
      }
    ]
  }'
```

### Example 5: JavaScript Client

```javascript
async function queryPathEvents() {
  const token = localStorage.getItem('token');

  const response = await fetch('http://localhost:3000/api/paths/query', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: {
        serial: 'B8A44F3024BB',
        class: 'Human',
        age: { $gte: 3 }
      },
      options: {
        sort: { timestamp: -1 },
        limit: 100
      }
    })
  });

  const result = await response.json();
  return result.data;
}
```

### Example 6: Python Client

```python
import requests

class DataQClient:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url
        self.token = token

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

    def query_paths(self, query: dict, options: dict = None):
        """Query path events using MongoDB query syntax"""
        if options is None:
            options = {"sort": {"timestamp": -1}, "limit": 100}

        response = requests.post(
            f"{self.base_url}/api/paths/query",
            headers=self._headers(),
            json={"query": query, "options": options}
        )
        return response.json()

    def count_paths(self, query: dict):
        """Count path events matching query"""
        response = requests.post(
            f"{self.base_url}/api/paths/count",
            headers=self._headers(),
            json={"query": query}
        )
        return response.json()

    def aggregate_paths(self, pipeline: list):
        """Run aggregation pipeline"""
        response = requests.post(
            f"{self.base_url}/api/paths/aggregate",
            headers=self._headers(),
            json={"pipeline": pipeline}
        )
        return response.json()

# Usage
client = DataQClient("http://localhost:3000", "your-token")

# Query human detections
events = client.query_paths(
    query={
        "serial": "B8A44F3024BB",
        "class": "Human",
        "age": {"$gte": 3}
    },
    options={
        "sort": {"timestamp": -1},
        "limit": 50
    }
)

# Count events
count = client.count_paths(
    query={"serial": "B8A44F3024BB", "class": "Car"}
)

# Aggregate statistics
stats = client.aggregate_paths(
    pipeline=[
        {"$match": {"serial": "B8A44F3024BB"}},
        {
            "$group": {
                "_id": "$class",
                "count": {"$sum": 1},
                "avgAge": {"$avg": "$age"}
            }
        }
    ]
)
```

---

## Notes

1. **Path Event Storage**: Path events are stored exactly as received from MQTT messages, preserving all original property names and structure.

2. **MongoDB Queries**: The query API uses MongoDB query syntax directly, allowing for powerful queries including comparison operators, logical operators, and complex nested conditions.

3. **Timestamps**: DataQ devices use Unix epoch timestamps (seconds). The database adds `createdAt` and `updatedAt` fields in ISO 8601 format.

4. **Coordinate System**: Path coordinates use a 0-1000 normalized system where (0,0) is top-left and (1000,1000) is bottom-right.

5. **Aggregation**: The aggregate endpoint supports the full MongoDB aggregation pipeline for complex analytics and statistics.

6. **Performance**: Query limits are capped at 1000 results per request for performance. Use pagination (skip/limit) for larger datasets.

7. **Token Expiration**: JWT tokens expire after the configured period (default: 7 days). Handle `401 Unauthorized` responses by re-authenticating.

8. **Video Playback Implementation**:
   - Backend buffers complete video from recording server, writes to temporary file for ffmpeg processing
   - ffmpeg fragments MP4 files (relocates moov atom from end to beginning for MediaSource API compatibility)
   - Frontend uses MediaSource API to progressively load and play fragmented video chunks
   - Video playback automatically starts at the event timestamp (preTime offset), not at the beginning of the clip
   - Temporary files are automatically cleaned up after streaming completes

9. **Dwell Heatmap**:
   - Computed client-side using the `POST /api/paths/aggregate` endpoint
   - Aggregation pipeline unwinds each event's `path` array, groups by quantized `(x, y)` coordinate bucket, and sums the `d` (dwell) values at each point
   - The resulting grid is rendered on a canvas overlay on the camera snapshot image

---

## Support

For issues, questions, or feature requests, please contact your system administrator or refer to the project documentation.
