# DataQ Analyzer Backend - API Documentation

This document describes the REST API for integrating client applications with the DataQ Analyzer backend server.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
  - [Authentication Endpoints](#authentication-endpoints)
  - [Camera Endpoints](#camera-endpoints)
  - [Path Events Endpoints](#path-events-endpoints)
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
      "type": "VideoX",
      "serverUrl": "http://localhost:3002",
      "apiKey": "your-api-key",
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
    "type": "VideoX",
    "serverUrl": "http://videox-server:3002",
    "apiKey": "new-api-key",
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
      "type": "VideoX",
      "serverUrl": "http://videox-server:3002",
      "apiKey": "new-api-key",
      "preTime": 10,
      "postTime": 10
    }
  }
}
```

**Notes:**
- `dateFormat`: "US", "ISO", or "EU" (changes date display format)
- `playbackConfig.type`: "VideoX", "ACS", or "Milestone" (VMS type)
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

---

## Support

For issues, questions, or feature requests, please contact your system administrator or refer to the project documentation.
