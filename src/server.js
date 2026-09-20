import http from 'http';
import { createApp } from './app.js';
import { connectDB, setupDBEventHandlers } from './db/connection.js';
import { connectMQTT, getMQTTClient } from './mqtt/client.js';
import { appConfig, serverConfig } from './config/index.js';
import logger from './utils/logger.js';
import { Camera, User } from './models/index.js';
import { setupWebSocketServer } from './websocket/index.js';
import retentionService from './services/retentionService.js';
import { initCounterSets } from './services/counterSetsService.js';
import { ensureBootstrapAdmin } from './services/authService.js';
import { migrateCameraCredentials } from './services/cameraService.js';

/**
 * Migrate existing cameras to add default filters if missing
 */
async function migrateExistingCameras() {
  try {
    const defaultFilters = {
      objectTypes: ['Human', 'Car', 'Truck', 'Bus', 'Bike', 'LicensePlate', 'Head', 'Bag', 'Vehicle', 'Animal', 'Undefined', 'Other'],
      minDistance: 20,
      minAge: 2,
    };

    // Find cameras without filters field or with incomplete filters
    const camerasWithoutFilters = await Camera.find({
      $or: [
        { filters: { $exists: false } },
        { 'filters.objectTypes': { $exists: false } },
        { 'filters.minDistance': { $exists: false } },
        { 'filters.minAge': { $exists: false } },
      ],
    });

    if (camerasWithoutFilters.length > 0) {
      logger.info(`Migrating ${camerasWithoutFilters.length} cameras to add default filters`);

      for (const camera of camerasWithoutFilters) {
        camera.filters = camera.filters || {};
        camera.filters.objectTypes = camera.filters.objectTypes || defaultFilters.objectTypes;
        camera.filters.minDistance = camera.filters.minDistance !== undefined ? camera.filters.minDistance : defaultFilters.minDistance;
        camera.filters.minAge = camera.filters.minAge !== undefined ? camera.filters.minAge : defaultFilters.minAge;
        await camera.save();
      }

      logger.info(`Successfully migrated ${camerasWithoutFilters.length} cameras`);
    }
  } catch (error) {
    logger.error('Failed to migrate cameras', { error: error.message });
  }
}

async function migrateLegacyUserIdentityFields() {
  try {
    await User.collection.dropIndex('email_1');
    logger.info('Removed legacy user email index');
  } catch (error) {
    // NamespaceNotFound: a first start against an empty database, where the
    // users collection does not exist yet. Neither case is an error.
    if (error.codeName !== 'IndexNotFound' && error.codeName !== 'NamespaceNotFound') {
      throw error;
    }
  }

  const result = await User.collection.updateMany(
    { $or: [{ email: { $exists: true } }, { fullName: { $exists: true } }] },
    { $unset: { email: '', fullName: '' } }
  );
  if (result.modifiedCount > 0) {
    logger.info('Removed legacy user profile fields', { count: result.modifiedCount });
  }
}

/**
 * Start the application server
 */
async function startServer() {
  try {
    logger.info(`Starting ${appConfig.name} application`);

    // Setup database event handlers
    setupDBEventHandlers();

    // MongoDB is required for authentication, authorization, and analytics.
    logger.info('Connecting to MongoDB');
    await connectDB();
    await migrateLegacyUserIdentityFields();
    await migrateExistingCameras();
    await User.collection.updateMany(
      { role: { $in: ['user', 'operator'] } },
      { $set: { role: 'viewer' } }
    );
    await User.collection.updateMany(
      { $or: [{ ownerOperator: { $exists: true } }, { authorizedDevices: { $exists: true } }, { authorizedCameras: { $exists: true } }] },
      { $unset: { ownerOperator: '', authorizedDevices: '', authorizedCameras: '' } }
    );
    await Camera.collection.updateMany(
      { $or: [{ ownerOperator: { $exists: true } }, { deviceType: { $exists: true } }] },
      { $unset: { ownerOperator: '', deviceType: '' } }
    );
    await migrateCameraCredentials();
    await ensureBootstrapAdmin();

    // Create Express app
    const app = createApp();

    // Create HTTP server
    const server = http.createServer(app);

    // Setup WebSocket server
    setupWebSocketServer(server);

    // Start HTTP server on all interfaces
    server.listen(serverConfig.port, '0.0.0.0', () => {
      logger.info(`Server running on port ${serverConfig.port} (all interfaces)`, {
        environment: serverConfig.nodeEnv,
        port: serverConfig.port,
      });
    });

    // Connect to MQTT broker
    logger.info('Connecting to MQTT broker');
    try {
      await connectMQTT(); // loads MQTT config from database
    } catch (error) {
      logger.warn('Failed to connect to MQTT broker (will continue without MQTT)', {
        error: error.message,
      });
    }

    // Initialize counter sets (restart MQTT publish timers)
    try {
      const mqttClient = getMQTTClient();
      await initCounterSets(mqttClient);
    } catch (err) {
      logger.warn('Failed to initialize counter sets', { error: err.message });
    }

    // Schedule daily retention cleanup at midnight.
    //
    // Opt out with RETENTION_ENABLED=false. Retention deletes path events
    // unattended at midnight, and per-camera retentionDays overrides whatever
    // the config file says — so a development instance pointed at a production
    // database will happily destroy real history while nobody is watching.
    // The flag is explicit rather than keyed on NODE_ENV, which is far too easy
    // to end up with by accident in a deployed environment.
    if (process.env.RETENTION_ENABLED === 'false') {
      logger.info('Retention cleanup disabled by RETENTION_ENABLED=false');
    } else {
      try {
        retentionService.scheduleDailyCleanup();
      } catch (err) {
        logger.warn('Failed to schedule retention cleanup', { error: err.message });
      }
    }

    // Graceful shutdown handler
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully`);

      server.close(() => {
        logger.info('HTTP server closed');
      });

      // Additional cleanup will be handled by DB event handlers
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    logger.info(`${appConfig.name} application started successfully`);
  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Start the server
startServer();
