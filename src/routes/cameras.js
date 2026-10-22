import express from 'express';
import * as cameraService from '../services/cameraService.js';
import * as vapixService from '../services/vapixService.js';
import { Camera } from '../models/index.js';
import { resubscribeToCameras } from '../mqtt/client.js';
import logger from '../utils/logger.js';
import {
  authenticate,
  requireDeviceAccessBySerial,
  requireDeviceOwner,
  requireAdmin,
} from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);
const editorGuard = [requireAdmin];

/**
 * GET /api/cameras
 * Get all cameras
 */
router.get('/', async (req, res) => {
  try {
    const enabledOnly = req.query.enabled === 'true';
    const includeStats = req.query.stats === 'true';
    const includeArchived = req.user.role === 'admin' && req.query.archived === 'true';
    const cameras = await cameraService.getAllCameras(enabledOnly, includeStats, req.user, includeArchived);
    res.json({ success: true, data: cameras });
  } catch (error) {
    logger.error('Error getting cameras', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve cameras' });
  }
});

/**
 * GET /api/cameras/:id
 * Get a camera by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const camera = await cameraService.getCameraById(req.params.id, req.user);
    if (!camera) {
      return res.status(404).json({ success: false, error: 'Camera not found' });
    }
    res.json({ success: true, data: camera });
  } catch (error) {
    logger.error('Error getting camera', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to retrieve camera' });
  }
});

/**
 * POST /api/cameras
 * Create a new camera (admin only)
 */
router.post('/', ...editorGuard, async (req, res) => {
  try {
    const {
      name,
      recordingName,
      serialNumber,
      description,
      location,
      cameraType,
      ipAddress,
      username,
      password,
      rotation,
      resolution,
      aspectRatio,
      mqttTopic,
      enabled,
      retentionDays,
    } = req.body;

    // Validation
    if (!name || !serialNumber) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, serialNumber',
      });
    }

    // Set default MQTT topic if not provided: dataq/path/{SERIAL}
    const finalMqttTopic = mqttTopic || `dataq/path/${serialNumber.toUpperCase()}`;

    const cameraData = {
      name,
      recordingName,
      serialNumber,
      description,
      location,
      cameraType: cameraType || 'remote',
      ipAddress,
      username,
      password,
      rotation: rotation || 0,
      resolution: resolution || '1280x720',
      aspectRatio: aspectRatio || '16:9',
      mqttTopic: finalMqttTopic,
      enabled: enabled !== false,
      retentionDays: retentionDays !== undefined ? retentionDays : undefined,
    };

    // Validate local camera has required fields
    if (cameraData.cameraType === 'local' && (!ipAddress || !username || !password)) {
      return res.status(400).json({
        success: false,
        error: 'Local cameras require ipAddress, username, and password',
      });
    }

    const camera = await cameraService.createCamera(cameraData);

    // For local cameras, fetch initial snapshot
    if (camera.cameraType === 'local') {
      try {
        const updatedCamera = await Camera.findById(camera._id);
        await vapixService.updateCameraSnapshot(updatedCamera);
        logger.info('Initial snapshot captured for local camera', {
          serialNumber: camera.serialNumber,
        });
      } catch (snapshotError) {
        // Delete the camera if snapshot fails
        await cameraService.purgeCamera(camera._id);
        logger.error('Failed to capture initial snapshot, camera deleted', {
          error: snapshotError.message,
          serialNumber: camera.serialNumber,
        });
        return res.status(400).json({
          success: false,
          error: `Failed to capture camera snapshot: ${snapshotError.message}. Please verify camera IP, credentials, and network connectivity.`,
        });
      }
    }

    // Resubscribe to MQTT topics to include the new camera
    await resubscribeToCameras();

    res.status(201).json({ success: true, data: camera });
  } catch (error) {
    logger.error('Error creating camera', { error: error.message });
    if (error.message.includes('already exists')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to create camera' });
  }
});

/**
 * PUT /api/cameras/:id
 * Update a camera (admin or camera owner)
 */
router.put('/:id', ...editorGuard, requireDeviceOwner, async (req, res) => {
  try {
    if (req.body.retentionDays !== undefined && req.body.retentionDays !== null &&
        (!Number.isSafeInteger(req.body.retentionDays) || req.body.retentionDays < 1)) {
      return res.status(400).json({ success: false, error: 'Retention must be null or a positive whole number of days' });
    }
    const allowedFields = [
      'name',
      'recordingName',
      'description',
      'location',
      'cameraType',
      'ipAddress',
      'username',
      'password',
      'rotation',
      'resolution',
      'aspectRatio',
      'mqttTopic',
      'enabled',
      'filters',
      'retentionDays',
    ];

    const updateData = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        // Don't update password if it's empty (keeps existing password)
        if (field === 'password' && req.body[field] === '') {
          return;
        }
        updateData[field] = req.body[field];
      }
    });
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    // Validate local camera has required fields if changing to local
    if (updateData.cameraType === 'local') {
      const camera = await Camera.findById(req.params.id);
      const finalIpAddress = updateData.ipAddress || camera.ipAddress;
      const finalUsername = updateData.username || camera.username;
      const finalPassword = updateData.password || camera.password;

      if (!finalIpAddress || !finalUsername || !finalPassword) {
        return res.status(400).json({
          success: false,
          error: 'Local cameras require ipAddress, username, and password',
        });
      }
    }

    const camera = await cameraService.updateCamera(req.params.id, updateData);
    if (!camera) {
      return res.status(404).json({ success: false, error: 'Camera not found' });
    }

    // For local cameras, refresh snapshot if connection details were updated
    if (camera.cameraType === 'local' && (updateData.ipAddress || updateData.username || updateData.password)) {
      try {
        const updatedCamera = await Camera.findById(camera._id);
        await vapixService.updateCameraSnapshot(updatedCamera);
        logger.info('Snapshot refreshed after camera update', {
          serialNumber: camera.serialNumber,
        });
      } catch (snapshotError) {
        logger.warn('Failed to refresh snapshot after update', {
          error: snapshotError.message,
          serialNumber: camera.serialNumber,
        });
        // Don't fail the update, just warn
        return res.json({
          success: true,
          data: camera,
          warning: 'Camera updated but failed to refresh snapshot. Please verify connection details.',
        });
      }
    }

    res.json({ success: true, data: camera });
  } catch (error) {
    logger.error('Error updating camera', { error: error.message, id: req.params.id });
    if (error.message.includes('already exists')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to update camera' });
  }
});

/**
 * DELETE /api/cameras/:id
 * Delete a camera (admin only)
 */
router.delete('/:id', ...editorGuard, requireDeviceOwner, async (req, res) => {
  try {
    const deleted = await cameraService.deleteCamera(req.params.id, req.user._id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Camera not found' });
    }
    await resubscribeToCameras();
    res.json({ success: true, message: 'Device archived successfully' });
  } catch (error) {
    logger.error('Error deleting camera', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to delete camera' });
  }
});

/**
 * DELETE /api/cameras/:id/permanent
 * Permanently remove a device and all of its recorded data (admin only).
 * This cannot be undone. Use DELETE /api/cameras/:id to archive instead.
 */
router.delete('/:id/permanent', ...editorGuard, requireDeviceOwner, async (req, res) => {
  try {
    const summary = await cameraService.purgeCameraWithData(req.params.id);
    if (!summary) {
      return res.status(404).json({ success: false, error: 'Camera not found' });
    }
    await resubscribeToCameras();
    res.json({
      success: true,
      message: `Device ${summary.name || summary.serialNumber} removed permanently`,
      data: summary,
    });
  } catch (error) {
    logger.error('Error purging camera', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to remove device' });
  }
});

/**
 * GET /api/cameras/:serialNumber/snapshot
 * Get camera snapshot (latest image)
 */
router.get('/:serialNumber/snapshot', requireDeviceAccessBySerial, async (req, res) => {
  try {
    const snapshot = await cameraService.getCameraSnapshot(req.params.serialNumber);
    if (!snapshot) {
      return res.status(404).json({ success: false, error: 'No snapshot available' });
    }
    res.json({ success: true, data: snapshot });
  } catch (error) {
    logger.error('Error getting camera snapshot', {
      error: error.message,
      serialNumber: req.params.serialNumber,
    });
    res.status(500).json({ success: false, error: 'Failed to retrieve snapshot' });
  }
});

/**
 * POST /api/cameras/:id/refresh-snapshot
 * Refresh snapshot for local camera (admin only)
 */
router.post('/:id/refresh-snapshot', ...editorGuard, requireDeviceOwner, async (req, res) => {
  try {
    const camera = req.device;
    if (!camera) {
      return res.status(404).json({ success: false, error: 'Camera not found' });
    }

    if (camera.cameraType !== 'local') {
      return res.status(400).json({
        success: false,
        error: 'Can only refresh snapshots for local cameras',
      });
    }

    await vapixService.updateCameraSnapshot(camera);
    res.json({ success: true, message: 'Snapshot refreshed successfully' });
  } catch (error) {
    logger.error('Error refreshing camera snapshot', {
      error: error.message,
      id: req.params.id,
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cameras/test-vapix
 * Test VAPIX connection (admin only)
 */
router.post('/test-vapix', ...editorGuard, async (req, res) => {
  try {
    const { ipAddress, username, password } = req.body;

    if (!ipAddress || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: ipAddress, username, password',
      });
    }

    const result = await vapixService.testVapixConnection({
      ipAddress,
      username,
      password,
    });

    res.json(result);
  } catch (error) {
    logger.error('Error testing VAPIX connection', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to test VAPIX connection' });
  }
});

/**
 * POST /api/cameras/fetch-device-info
 * Fetch device info from local camera (admin only)
 */
router.post('/fetch-device-info', ...editorGuard, async (req, res) => {
  try {
    const { ipAddress, username, password } = req.body;

    if (!ipAddress || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: ipAddress, username, password',
      });
    }

    const deviceInfo = await vapixService.fetchDeviceInfo({
      ipAddress,
      username,
      password,
    });

    res.json({ success: true, data: deviceInfo });
  } catch (error) {
    logger.error('Error fetching device info', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
