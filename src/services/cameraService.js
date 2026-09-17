import { Camera, OccupancyEvent, PathEvent } from '../models/index.js';
import * as configService from './configService.js';
import logger from '../utils/logger.js';
import { getVisibleDeviceFilter } from '../middleware/auth.js';
import { encryptSecret, isEncryptedSecret } from '../utils/secretEncryption.js';

function toSafeCamera(camera) {
  if (!camera) return null;
  const { username, password, ...safeCamera } = camera;
  return {
    ...safeCamera,
    hasCredentials: !!(username || password),
  };
}

/**
 * Get all cameras
 * @param {boolean} enabledOnly - Return only enabled cameras
 * @returns {Promise<Array>}
 */
export async function getAllCameras(enabledOnly = false, includeStats = false, user, includeArchived = false) {
  try {
    const query = {
      ...getVisibleDeviceFilter(user, { includeArchived }),
      ...(enabledOnly ? { enabled: true } : {}),
    };
    const cameras = await Camera.find(query)
      .select('-latestSnapshot -username -password')
      .sort({ name: 1 })
      .lean();

    if (!includeStats) return cameras.map(toSafeCamera);

    const pathSummary = await PathEvent.aggregate([
      { $match: { serial: { $in: cameras.map((camera) => camera.serialNumber) } } },
      {
        $project: {
          serial: 1,
          timestamp: {
            $convert: {
              input: '$timestamp',
              to: 'date',
              onError: '$createdAt',
              onNull: '$createdAt',
            },
          },
        },
      },
      {
        $group: {
          _id: {
            serial: '$serial',
            day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          },
          pathCount: { $sum: 1 },
          firstPathAt: { $min: '$timestamp' },
          lastPathAt: { $max: '$timestamp' },
        },
      },
      {
        $group: {
          _id: '$_id.serial',
          pathCount: { $sum: '$pathCount' },
          storedDays: { $sum: 1 },
          firstPathAt: { $min: '$firstPathAt' },
          lastPathAt: { $max: '$lastPathAt' },
        },
      },
    ]);
    const summaryBySerial = {};
    pathSummary.forEach((summary) => {
      summaryBySerial[summary._id] = summary;
    });

    // Get system default retention
    const systemConfig = await configService.getSystemConfig();
    const defaultRetention = systemConfig?.dataRetentionDays || 90;

    return cameras.map((camera) => {
      const summary = summaryBySerial[camera.serialNumber];
      return toSafeCamera({
        ...camera,
        pathCount: summary?.pathCount || 0,
        storedDays: summary?.storedDays || 0,
        firstPathAt: summary?.firstPathAt || null,
        lastPathAt: summary?.lastPathAt || null,
        effectiveRetentionDays: camera.retentionDays != null ? camera.retentionDays : defaultRetention,
      });
    });
  } catch (error) {
    logger.error('Failed to get cameras', { error: error.message });
    throw error;
  }
}

/**
 * Get a camera by ID
 * @param {string} id - Camera document ID
 * @returns {Promise<Object|null>}
 */
export async function getCameraById(id, user) {
  try {
    const camera = await Camera.findOne({ _id: id, ...getVisibleDeviceFilter(user) }).lean();
    return toSafeCamera(camera);
  } catch (error) {
    logger.error('Failed to get camera', { error: error.message, id });
    throw error;
  }
}

/**
 * Get a camera by serial number
 * @param {string} serialNumber - Camera serial number (unique identifier)
 * @returns {Promise<Object|null>}
 */
export async function getCameraBySerialNumber(serialNumber) {
  try {
    return await Camera.findOne({ serialNumber: serialNumber.toUpperCase() }).lean();
  } catch (error) {
    logger.error('Failed to get camera by serial number', {
      error: error.message,
      serialNumber,
    });
    throw error;
  }
}

/**
 * Create a new camera
 * @param {Object} cameraData - Camera data
 * @returns {Promise<Object>}
 */
export async function createCamera(cameraData) {
  try {
    const camera = new Camera({
      ...cameraData,
      username: encryptSecret(cameraData.username),
      password: encryptSecret(cameraData.password),
    });
    await camera.save();
    logger.info('Camera created', { serialNumber: camera.serialNumber, name: camera.name });
    return toSafeCamera(camera.toObject());
  } catch (error) {
    if (error.code === 11000) {
      throw new Error('Camera with this serial number already exists');
    }
    logger.error('Failed to create camera', { error: error.message });
    throw error;
  }
}

/**
 * Update a camera
 * @param {string} id - Camera document ID
 * @param {Object} updateData - Fields to update
 * @returns {Promise<Object|null>}
 */
export async function updateCamera(id, updateData) {
  try {
    const encryptedUpdate = { ...updateData };
    if (updateData.username !== undefined) {
      encryptedUpdate.username = encryptSecret(updateData.username);
    }
    if (updateData.password !== undefined) {
      encryptedUpdate.password = encryptSecret(updateData.password);
    }

    const camera = await Camera.findByIdAndUpdate(id, encryptedUpdate, {
      new: true,
      runValidators: true,
    });
    if (camera) {
      logger.info('Camera updated', { id, serialNumber: camera.serialNumber });
    }
    return camera ? toSafeCamera(camera.toObject()) : null;
  } catch (error) {
    if (error.code === 11000) {
      throw new Error('Camera with this serial number already exists');
    }
    logger.error('Failed to update camera', { error: error.message, id });
    throw error;
  }
}

export async function migrateCameraCredentials() {
  const cameras = await Camera.find({
    $or: [
      { username: { $nin: ['', null] } },
      { password: { $nin: ['', null] } },
    ],
  });
  let migrated = 0;

  for (const camera of cameras) {
    let changed = false;
    if (camera.username && !isEncryptedSecret(camera.username)) {
      camera.username = encryptSecret(camera.username);
      changed = true;
    }
    if (camera.password && !isEncryptedSecret(camera.password)) {
      camera.password = encryptSecret(camera.password);
      changed = true;
    }
    if (changed) {
      await camera.save();
      migrated += 1;
    }
  }

  if (migrated > 0) {
    logger.info('Encrypted stored device credentials', { migrated });
  }
  return migrated;
}

/**
 * Delete a camera
 * @param {string} id - Camera document ID
 * @returns {Promise<boolean>}
 */
export async function deleteCamera(id, archivedBy) {
  try {
    const result = await Camera.findByIdAndUpdate(
      id,
      { enabled: false, archivedAt: new Date(), archivedBy },
      { new: true }
    );
    if (result) {
      logger.info('Camera archived', { id, serialNumber: result.serialNumber });
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Failed to delete camera', { error: error.message, id });
    throw error;
  }
}

export async function purgeCamera(id) {
  return Camera.findByIdAndDelete(id);
}

/**
 * Permanently remove a device together with everything it has recorded.
 * Unlike deleteCamera(), which only archives, this cannot be undone.
 * @param {string} id - Camera document ID
 * @returns {Promise<Object|null>} Deletion summary, or null when not found
 */
export async function purgeCameraWithData(id) {
  const camera = await Camera.findById(id).lean();
  if (!camera) return null;

  const { serialNumber } = camera;
  const [paths, occupancy] = await Promise.all([
    PathEvent.deleteMany({ serial: serialNumber }),
    OccupancyEvent.deleteMany({ serial: serialNumber }),
  ]);
  await Camera.findByIdAndDelete(id);

  const summary = {
    serialNumber,
    name: camera.name,
    pathEventsDeleted: paths.deletedCount || 0,
    occupancyEventsDeleted: occupancy.deletedCount || 0,
  };

  logger.info('Device permanently removed', summary);
  return summary;
}

/**
 * Update camera snapshot from MQTT message (remote cameras)
 * @param {Object} data - Snapshot data
 * @param {string} data.serialNumber - Camera serial number
 * @param {string} data.base64Image - Base64 encoded image
 * @param {number} data.timestamp - Image timestamp
 * @param {number} data.rotation - Image rotation (optional)
 * @param {string} data.aspectRatio - Image aspect ratio (optional)
 * @returns {Promise<Object|null>}
 */
export async function updateCameraSnapshotFromMQTT(data) {
  try {
    const { serialNumber, base64Image, timestamp, rotation, aspectRatio, name, location } = data;
    const normalizedSerial = serialNumber.toUpperCase();

    const updateData = {
      latestSnapshot: base64Image,
      latestSnapshotTimestamp: new Date(timestamp),
      enabled: true,
      archivedAt: null,
      archivedBy: null,
    };

    // Update rotation and aspect ratio if provided
    if (rotation !== undefined) {
      updateData.rotation = rotation;
    }
    if (aspectRatio) {
      updateData.aspectRatio = aspectRatio;
    }
    if (name) {
      updateData.name = name;
    }
    if (location !== undefined) {
      updateData.location = location;
    }

    const insertDefaults = {
      cameraType: 'remote',
      mqttTopic: `dataq/path/${normalizedSerial}`,
      autoDiscovered: true,
    };
    if (!name) {
      insertDefaults.name = normalizedSerial;
    }

    const result = await Camera.findOneAndUpdate(
      { serialNumber: normalizedSerial },
      {
        $set: updateData,
        $setOnInsert: insertDefaults,
      },
      { upsert: true, new: true, includeResultMetadata: true }
    );
    const isNew = result.lastErrorObject?.upserted != null;
    const camera = result.value;

    if (camera) {
      logger.debug(isNew ? 'Device discovered from MQTT image' : 'Device snapshot updated from MQTT', {
        serialNumber,
        timestamp: new Date(timestamp),
      });
    }

    return {
      camera: camera ? (camera.toObject ? camera.toObject() : camera) : null,
      isNew,
    };
  } catch (error) {
    logger.error('Failed to update camera snapshot from MQTT', {
      error: error.message,
      serialNumber: data.serialNumber,
    });
    throw error;
  }
}

export async function upsertCameraFromStatus(status) {
  const serialNumber = (status.serial || '').toUpperCase();
  if (!serialNumber) throw new Error('serial is required in status');

  const result = await Camera.findOneAndUpdate(
    { serialNumber },
    {
      $set: {
        enabled: true,
        archivedAt: null,
        archivedBy: null,
        'deviceStatus.connected': true,
        'deviceStatus.networkKbps': status.networkKbps || 0,
        'deviceStatus.cpuAverage': status.cpuAverage || 0,
        'deviceStatus.uptimeHours': status.uptimeHours || 0,
        'deviceStatus.lastSeen': new Date(),
      },
      $setOnInsert: {
        name: serialNumber,
        cameraType: 'remote',
        mqttTopic: `dataq/path/${serialNumber}`,
        autoDiscovered: true,
      },
    },
    { upsert: true, new: true, includeResultMetadata: true }
  );

  const isNew = result.lastErrorObject?.upserted != null;
  const camera = result.value?.toObject ? result.value.toObject() : result.value;

  if (isNew) {
    logger.info('Device auto-discovered from MQTT status', { serialNumber });
  }

  return { camera, isNew };
}

/**
 * Get camera snapshot (latest image)
 * @param {string} serialNumber - Camera serial number
 * @returns {Promise<Object|null>} Object with base64 image and metadata
 */
export async function getCameraSnapshot(serialNumber) {
  try {
    const camera = await Camera.findOne(
      { serialNumber: serialNumber.toUpperCase() },
      { latestSnapshot: 1, latestSnapshotTimestamp: 1, rotation: 1, aspectRatio: 1 }
    ).lean();

    if (!camera || !camera.latestSnapshot) {
      return null;
    }

    return {
      image: camera.latestSnapshot,
      timestamp: camera.latestSnapshotTimestamp,
      rotation: camera.rotation,
      aspectRatio: camera.aspectRatio,
    };
  } catch (error) {
    logger.error('Failed to get camera snapshot', {
      error: error.message,
      serialNumber,
    });
    throw error;
  }
}

/**
 * Auto-create or update a camera from a dataq/connect announcement.
 * @param {Object} announcement - Parsed connect message payload
 * @param {string} announcement.serial - Device serial number
 * @param {boolean} announcement.connected - Current connection state
 * @param {string} announcement.name - Device name
 * @param {string} announcement.location - Device location
 * @param {string} announcement.model - Device model
 * @param {string} announcement.address - Device IP address
 * @param {Array}  announcement.labels - Detection label/class definitions
 * @returns {Promise<{camera: Object, isNew: boolean}>}
 */
export async function upsertCameraFromAnnouncement(announcement) {
  try {
    const serialNumber = (announcement.serial || '').toUpperCase();
    if (!serialNumber) throw new Error('serial is required in announcement');

    const labels = Array.isArray(announcement.labels) ? announcement.labels : [];

    const setOnInsert = {
      // Defaults only applied when the document is first created
      ...(!announcement.name ? { name: serialNumber } : {}),
      cameraType: 'remote',
      mqttTopic: `dataq/path/${serialNumber}`,
      autoDiscovered: true,
    };

    const setAlways = {
      enabled: true,
      archivedAt: null,
      archivedBy: null,
      'deviceStatus.connected': announcement.connected !== false,
      'deviceStatus.lastSeen': new Date(),
    };
    if (announcement.name) setAlways.name = announcement.name;
    if (announcement.location !== undefined) setAlways.location = announcement.location;
    if (announcement.model !== undefined) setAlways.model = announcement.model;
    if (announcement.address !== undefined) setAlways['deviceStatus.address'] = announcement.address;
    if (Array.isArray(announcement.labels)) setAlways.labels = labels;

    const result = await Camera.findOneAndUpdate(
      { serialNumber },
      {
        $set: setAlways,
        $setOnInsert: setOnInsert,
      },
      { upsert: true, new: true, includeResultMetadata: true }
    );

    const isNew = result.lastErrorObject?.upserted != null;
    const camera = result.value.toObject ? result.value.toObject() : result.value;

    logger.info(isNew ? 'Camera auto-discovered and created' : 'Camera updated from announcement', {
      serialNumber,
      name: camera.name,
      model: camera.model,
      isNew,
    });

    return { camera, isNew };
  } catch (error) {
    if (error.code === 11000) {
      // Race condition: camera was just inserted by another process - fetch it
      const camera = await Camera.findOne({
        serialNumber: (announcement.serial || '').toUpperCase(),
      }).lean();
      return { camera, isNew: false };
    }
    logger.error('Failed to upsert camera from announcement', { error: error.message });
    throw error;
  }
}

export default {
  getAllCameras,
  getCameraById,
  getCameraBySerialNumber,
  createCamera,
  updateCamera,
  deleteCamera,
  purgeCamera,
  migrateCameraCredentials,
  updateCameraSnapshotFromMQTT,
  upsertCameraFromStatus,
  getCameraSnapshot,
  upsertCameraFromAnnouncement,
};
