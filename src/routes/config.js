import express from 'express';
import * as configService from '../services/configService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.use(authenticate);
const adminGuard = [requireAdmin];

router.use((req, res, next) => {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Installation configuration is read-only and must be changed in config.yaml or .env, then restarted',
    });
  }
  next();
});

/**
 * GET /api/config
 * Get full configuration (system config including dateFormat and playbackConfig)
 */
router.get('/', async (req, res) => {
  try {
    const systemConfig = await configService.getSystemConfig();

    // Return in the format expected by clients
    res.json({
      success: true,
      data: {
        dateFormat: systemConfig.dateFormat || 'US',
        playbackConfig: {
          enabled: systemConfig.playback?.enabled || false,
          type: systemConfig.playback?.type || 'MediaMTX',
          serverUrl: systemConfig.playback?.serverUrl || '',
          hasCredentials: !!(systemConfig.playback?.username && systemConfig.playback?.password),
          preTime: systemConfig.playback?.preTime || 5,
          postTime: systemConfig.playback?.postTime || 5,
        },
        // Include other useful system settings
        appName: systemConfig.appName,
        defaultPageSize: systemConfig.defaultPageSize,
        maxPageSize: systemConfig.maxPageSize,
        dataRetentionDays: systemConfig.dataRetentionDays,
        defaultTimeRangeHours: systemConfig.defaultTimeRangeHours,
      },
    });
  } catch (error) {
    logger.error('Error getting config', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get configuration' });
  }
});

/**
 * PUT /api/config
 * Update full configuration
 */
router.put('/', ...adminGuard, async (req, res) => {
  try {
    const { dateFormat, playbackConfig, ...otherSettings } = req.body;

    // Build update object
    const updates = { ...otherSettings };

    if (dateFormat !== undefined) {
      updates.dateFormat = dateFormat;
    }

    if (playbackConfig !== undefined) {
      // The UI uses type="None" to mean disabled; map it to a valid enum value.
      const playbackType = playbackConfig.type === 'None' ? 'MediaMTX' : playbackConfig.type;
      const playbackEnabled = playbackConfig.type === 'None' ? false : playbackConfig.enabled;
      updates.playback = {
        enabled: playbackEnabled,
        type: playbackType,
        serverUrl: playbackConfig.serverUrl,
        username: playbackConfig.username,
        password: playbackConfig.password,
        preTime: playbackConfig.preTime,
        postTime: playbackConfig.postTime,
      };
    }

    const config = await configService.updateSystemConfig(updates);

    res.json({
      success: true,
      data: {
        dateFormat: config.dateFormat,
        playbackConfig: {
          enabled: config.playback?.enabled || false,
          type: config.playback?.type || 'MediaMTX',
          serverUrl: config.playback?.serverUrl || '',
          hasCredentials: !!(config.playback?.username && config.playback?.password),
          preTime: config.playback?.preTime || 5,
          postTime: config.playback?.postTime || 5,
        },
      },
    });
  } catch (error) {
    logger.error('Error updating config', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update configuration' });
  }
});

/**
 * GET /api/config/status
 * Get connection status for MongoDB and MQTT
 */
router.get('/status', ...adminGuard, (req, res) => {
  try {
    const status = {
      mongodb: configService.getMongoStatus(),
      mqtt: configService.getMqttStatus(),
    };
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('Error getting status', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

/**
 * GET /api/config/mqtt
 * Get MQTT configuration
 */
router.get('/mqtt', ...adminGuard, async (req, res) => {
  try {
    const config = await configService.getMqttConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('Error getting MQTT config', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve MQTT configuration' });
  }
});

/**
 * PUT /api/config/mqtt
 * Update MQTT configuration
 */
router.put('/mqtt', ...adminGuard, async (req, res) => {
  try {
    const config = await configService.updateMqttConfig(req.body);
    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('Error updating MQTT config', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update MQTT configuration' });
  }
});

/**
 * POST /api/config/mqtt/test
 * Test MQTT connection with provided settings
 */
router.post('/mqtt/test', ...adminGuard, async (req, res) => {
  try {
    const {
      brokerUrl: rawBrokerUrl,
      host,
      port,
      protocol,
      username,
      password,
      useTls,
      rejectUnauthorized,
      caCert,
      clientCert,
      clientKey,
    } = req.body;

    // Build broker URL from parts if not provided directly
    const proto = useTls ? 'mqtts' : (protocol || 'mqtt');
    const brokerUrl = rawBrokerUrl || (host ? `${proto}://${host}:${port || 1883}` : null);

    if (!brokerUrl) {
      return res.status(400).json({
        success: false,
        error: 'Broker host or URL is required',
      });
    }

    const result = await configService.testMqttConnection({
      brokerUrl,
      username,
      password,
      useTls,
      rejectUnauthorized,
      caCert,
      clientCert,
      clientKey,
    });

    res.json({ success: result.success, message: result.message });
  } catch (error) {
    logger.error('Error testing MQTT connection', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to test MQTT connection' });
  }
});

/**
 * POST /api/config/mqtt/reconnect
 * Reconnect MQTT with current database configuration
 */
router.post('/mqtt/reconnect', ...adminGuard, async (req, res) => {
  try {
    const result = await configService.reconnectMqtt();
    res.json(result);
  } catch (error) {
    logger.error('Error reconnecting MQTT', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to reconnect MQTT' });
  }
});

/**
 * GET /api/config/system
 * Get system configuration
 */
router.get('/system', async (req, res) => {
  try {
    const config = await configService.getSystemConfig();
    res.json({
      success: true,
      data: {
        ...config,
        playback: {
          ...config.playback,
          username: undefined,
          password: undefined,
          hasCredentials: !!(config.playback?.username && config.playback?.password),
        },
      },
    });
  } catch (error) {
    logger.error('Error getting system config', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve system configuration' });
  }
});

/**
 * PUT /api/config/system
 * Update system configuration
 */
router.put('/system', ...adminGuard, async (req, res) => {
  try {
    const body = { ...req.body };

    // Normalise playback: the UI uses type="None" to mean "disabled".
    // "None" is not a valid enum value in the model, so convert it here.
    if (body.playback && body.playback.type === 'None') {
      body.playback = {
        ...body.playback,
        enabled: false,
        type: 'MediaMTX', // keep a valid enum value as the stored type
      };
    }

    const config = await configService.updateSystemConfig(body);
    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('Error updating system config', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update system configuration' });
  }
});

/**
 * GET /api/config/mongodb
 * Get MongoDB configuration
 */
router.get('/mongodb', ...adminGuard, async (req, res) => {
  try {
    const config = await configService.getMongoConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('Error getting MongoDB config', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve MongoDB configuration' });
  }
});

/**
 * PUT /api/config/mongodb
 * Update MongoDB configuration
 */
router.put('/mongodb', ...adminGuard, async (req, res) => {
  try {
    const config = await configService.updateMongoConfig(req.body);
    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('Error updating MongoDB config', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update MongoDB configuration' });
  }
});

/**
 * POST /api/config/mongodb/test
 * Test MongoDB connection
 */
router.post('/mongodb/test', ...adminGuard, async (req, res) => {
  try {
    const { connectionString } = req.body;

    if (!connectionString) {
      return res.status(400).json({
        success: false,
        error: 'Connection string is required',
      });
    }

    const result = await configService.testMongoConnection(connectionString);
    res.json({ success: result.success, message: result.message });
  } catch (error) {
    logger.error('Error testing MongoDB connection', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to test MongoDB connection' });
  }
});

/**
 * POST /api/config/mongodb/test-config
 * Test MongoDB connection with configuration object
 */
router.post('/mongodb/test-config', ...adminGuard, async (req, res) => {
  try {
    const connectionString = configService.buildMongoConnectionString(req.body);
    const result = await configService.testMongoConnection(connectionString);
    res.json({ success: result.success, message: result.message });
  } catch (error) {
    logger.error('Error testing MongoDB config', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to test MongoDB configuration' });
  }
});

export default router;
