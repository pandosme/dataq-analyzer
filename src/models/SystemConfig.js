import mongoose from 'mongoose';

const systemConfigSchema = new mongoose.Schema(
  {
    // Singleton pattern - only one config document should exist
    _id: {
      type: String,
      default: 'system-config',
    },
    // Application settings
    appName: {
      type: String,
      default: 'DataQ-Management',
    },
    // Default query/display settings
    defaultPageSize: {
      type: Number,
      default: 100,
      min: 10,
      max: 1000,
    },
    maxPageSize: {
      type: Number,
      default: 1000,
      min: 100,
      max: 10000,
    },
    // Data retention settings
    dataRetentionDays: {
      type: Number,
      default: 90, // Keep path data for 90 days by default
      min: 1,
    },
    // Path visualization settings
    pathVisualization: {
      showStartPoints: {
        type: Boolean,
        default: true,
      },
      showEndPoints: {
        type: Boolean,
        default: true,
      },
      pathOpacity: {
        type: Number,
        default: 0.7,
        min: 0.1,
        max: 1.0,
      },
      pathLineWidth: {
        type: Number,
        default: 2,
        min: 1,
        max: 10,
      },
    },
    // Default time range for queries (in hours)
    defaultTimeRangeHours: {
      type: Number,
      default: 24,
      min: 1,
    },
    // Date/time format preference
    dateFormat: {
      type: String,
      enum: ['US', 'EU', 'ISO'],
      default: 'US',
    },
    // Playback/VMS integration settings
    playback: {
      enabled: {
        type: Boolean,
        default: false,
      },
      type: {
        type: String,
        enum: ['VideoX', 'ACS', 'Milestone'],
        default: 'VideoX',
      },
      serverUrl: {
        type: String,
        default: 'http://localhost:3002',
      },
      apiKey: {
        type: String,
        default: '',
      },
      preTime: {
        type: Number,
        default: 5,
        min: 0,
        max: 60,
      },
      postTime: {
        type: Number,
        default: 5,
        min: 0,
        max: 60,
      },
    },
  },
  {
    timestamps: true,
  }
);

const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);

export default SystemConfig;
