import mongoose from 'mongoose';

const cameraSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Optional MediaMTX recording path. When empty, the lowercase camera name is used.
    recordingName: {
      type: String,
      default: '',
      trim: true,
    },
    // Device serial number - primary unique identifier (e.g., B8A44FF11A35)
    // This matches the serial from DataQ MQTT messages
    serialNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      default: '',
    },
    // Camera model (e.g., "AXIS Q3517-LVE", "AXIS P1448-LE")
    model: {
      type: String,
      default: '',
    },
    location: {
      type: String,
      default: '',
    },
    // Camera type: 'local' (reachable by app) or 'remote' (MQTT only)
    cameraType: {
      type: String,
      enum: ['local', 'remote'],
      required: true,
      default: 'remote',
    },
    // IP address for local cameras (VAPIX access)
    ipAddress: {
      type: String,
      default: '',
    },
    // VAPIX credentials for local cameras (digest authentication)
    username: {
      type: String,
      default: '',
    },
    password: {
      type: String,
      default: '',
    },
    // Use TLS/HTTPS for camera connection (allows self-signed certificates)
    useTLS: {
      type: Boolean,
      default: false,
    },
    // Image rotation: 0, 90, 180, 270 degrees
    rotation: {
      type: Number,
      enum: [0, 90, 180, 270],
      default: 0,
    },
    // Image resolution (e.g., "1280x720", "640x360")
    resolution: {
      type: String,
      default: '1280x720',
    },
    // Aspect ratio (e.g., "16:9", "4:3")
    aspectRatio: {
      type: String,
      default: '16:9',
    },
    // MQTT topic for this camera's DataQ path messages (default: dataq/path/{SERIAL})
    mqttTopic: {
      type: String,
      required: true,
    },
    // Latest snapshot data (base64 encoded JPEG)
    latestSnapshot: {
      type: String,
      default: '',
    },
    // Timestamp of latest snapshot
    latestSnapshotTimestamp: {
      type: Date,
      default: null,
    },
    // Enabled/disabled status
    enabled: {
      type: Boolean,
      default: true,
    },
    archivedAt: {
      type: Date,
      default: null,
      index: true,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Device status from MQTT announcements
    deviceStatus: {
      // Connection status from dataq/connect/{SERIAL}
      connected: {
        type: Boolean,
        default: false,
      },
      // IP address from announcement message
      address: {
        type: String,
        default: '',
      },
      // Network throughput in Kbps from status messages
      networkKbps: {
        type: Number,
        default: 0,
      },
      // CPU average from status messages
      cpuAverage: {
        type: Number,
        default: 0,
      },
      // Uptime in hours from status messages
      uptimeHours: {
        type: Number,
        default: 0,
      },
      // Last seen timestamp (from connect or status message)
      lastSeen: {
        type: Date,
        default: null,
      },
    },
    // Detection filters - paths that don't meet these criteria will be ignored
    filters: {
      // Object types to include (e.g., ['Human', 'Car', 'Truck', 'Bus', 'Bike', 'LicensePlate', 'Head', 'Bag', 'Vehicle', 'Animal', 'Undefined', 'Other'])
      objectTypes: {
        type: [String],
        default: ['Human', 'Car', 'Truck', 'Bus', 'Bike', 'LicensePlate', 'Head', 'Bag', 'Vehicle', 'Animal', 'Undefined', 'Other'],
      },
      // Minimum distance as percentage of total view displacement (0-50)
      // Total displacement = sqrt(dx^2 + dy^2) as % of diagonal
      minDistance: {
        type: Number,
        min: 0,
        max: 50,
        default: 20,
      },
      // Minimum age in seconds (0-10)
      minAge: {
        type: Number,
        min: 0,
        max: 10,
        default: 2,
      },
    },
    // Optional per-camera data retention override (days). If not set, system default is used.
    retentionDays: {
      type: Number,
      min: 1,
      default: null,
    },
    // Labels/classes this device can detect (from dataq/connect announcement)
    labels: {
      type: [String],
      default: [],
    },
    // Whether this camera was auto-discovered via MQTT announcement
    autoDiscovered: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
cameraSchema.index({ enabled: 1 });

const Camera = mongoose.model('Camera', cameraSchema);

export default Camera;
