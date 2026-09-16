import axios from 'axios';
import DigestClient from 'digest-fetch';
import logger from '../utils/logger.js';
import { decryptSecret } from '../utils/secretEncryption.js';

/**
 * Fetch image from an Axis camera using VAPIX
 * @param {Object} params - Camera parameters
 * @param {string} params.ipAddress - Camera IP address
 * @param {string} params.username - Camera username
 * @param {string} params.password - Camera password
 * @param {string} params.resolution - Image resolution (e.g., "1280x720")
 * @returns {Promise<string>} Base64 encoded image
 */
export async function fetchCameraImage({ ipAddress, username, password, resolution = '1280x720' }) {
  try {
    const url = `http://${ipAddress}/axis-cgi/jpg/image.cgi?resolution=${resolution}`;

    const client = new DigestClient(username, password);
    const response = await client.fetch(url, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Get image data as buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert image buffer to base64
    const base64Image = buffer.toString('base64');
    return base64Image;
  } catch (error) {
    logger.error('Failed to fetch camera image via VAPIX', {
      ipAddress,
      error: error.message,
    });
    throw new Error(`Failed to fetch image from camera: ${error.message}`);
  }
}

/**
 * Test VAPIX connection to a camera
 * @param {Object} params - Camera parameters
 * @returns {Promise<Object>} Result with success status and message
 */
export async function testVapixConnection({ ipAddress, username, password }) {
  try {
    const url = `http://${ipAddress}/axis-cgi/jpg/image.cgi?resolution=640x360`;

    const client = new DigestClient(username, password);
    const response = await client.fetch(url, {
      method: 'GET',
    });

    if (response.ok) {
      return {
        success: true,
        message: 'Successfully connected to camera via VAPIX',
      };
    }

    return {
      success: false,
      message: response.status === 401
        ? 'Authentication failed - check username and password'
        : `Unexpected response: ${response.status}`,
    };
  } catch (error) {
    logger.error('VAPIX connection test failed', {
      ipAddress,
      error: error.message,
    });

    return {
      success: false,
      message: `Connection failed: ${error.message}`,
    };
  }
}

/**
 * Fetch device information from camera
 * @param {Object} params - Camera parameters
 * @param {string} params.ipAddress - Camera IP address
 * @param {string} params.username - Camera username
 * @param {string} params.password - Camera password
 * @returns {Promise<Object>} Device information including serial number
 */
export async function fetchDeviceInfo({ ipAddress, username, password }) {
  try {
    const url = `http://${ipAddress}/axis-cgi/basicdeviceinfo.cgi`;

    const client = new DigestClient(username, password);
    const response = await client.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiVersion: '1.0',
        context: 'fetch-device-info',
        method: 'getAllProperties',
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data && data.data && data.data.propertyList) {
      const props = data.data.propertyList;
      return {
        serialNumber: props.SerialNumber,
        productName: props.ProdFullName || props.ProdShortName,
        productNumber: props.ProdNbr,
        firmwareVersion: props.Version,
      };
    }

    throw new Error('Invalid response from device');
  } catch (error) {
    logger.error('Failed to fetch device info', {
      ipAddress,
      error: error.message,
    });
    throw new Error(`Failed to fetch device info: ${error.message}`);
  }
}

/**
 * Update camera snapshot by fetching from VAPIX
 * @param {Object} camera - Camera document
 * @returns {Promise<string>} Base64 encoded image
 */
export async function updateCameraSnapshot(camera) {
  if (camera.cameraType !== 'local') {
    throw new Error('Cannot fetch snapshot for non-local camera');
  }

  if (!camera.ipAddress || !camera.username || !camera.password) {
    throw new Error('Missing camera credentials');
  }

  const base64Image = await fetchCameraImage({
    ipAddress: camera.ipAddress,
    username: decryptSecret(camera.username),
    password: decryptSecret(camera.password),
    resolution: camera.resolution || '1280x720',
  });

  // Update camera document with new snapshot
  camera.latestSnapshot = base64Image;
  camera.latestSnapshotTimestamp = new Date();
  await camera.save();

  logger.info('Updated camera snapshot via VAPIX', {
    serialNumber: camera.serialNumber,
    timestamp: camera.latestSnapshotTimestamp,
  });

  return base64Image;
}

export default {
  fetchCameraImage,
  testVapixConnection,
  fetchDeviceInfo,
  updateCameraSnapshot,
};
