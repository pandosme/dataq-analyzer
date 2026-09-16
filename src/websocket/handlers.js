/**
 * WebSocket message handlers
 * Handles incoming messages from WebSocket clients (subscribe, unsubscribe, ping)
 */

import { getConnection, updateSubscriptions } from './manager.js';
import { Camera } from '../models/index.js';
import logger from '../utils/logger.js';

/**
 * Handle incoming WebSocket message
 * @param {WebSocket} ws - WebSocket instance
 * @param {Buffer} data - Message data
 * @param {string} connectionId - Connection ID
 */
export async function handleMessage(ws, data, connectionId) {
  try {
    const message = JSON.parse(data.toString());

    logger.debug('WebSocket message received', {
      type: message.type,
      connectionId,
    });

    switch (message.type) {
      case 'subscribe':
        await handleSubscribe(ws, message, connectionId);
        break;
      case 'unsubscribe':
        await handleUnsubscribe(ws, message, connectionId);
        break;
      case 'ping':
        handlePing(ws);
        break;
      default:
        sendError(ws, 'Unknown message type', 'INVALID_REQUEST');
    }
  } catch (error) {
    logger.error('Error handling WebSocket message', {
      error: error.message,
      connectionId,
    });
    sendError(ws, 'Invalid JSON', 'INVALID_REQUEST');
  }
}

/**
 * Handle subscribe message with authorization
 * @param {WebSocket} ws - WebSocket instance
 * @param {Object} message - Subscribe message
 * @param {string} connectionId - Connection ID
 */
async function handleSubscribe(ws, message, connectionId) {
  const connection = getConnection(connectionId);
  if (!connection) {
    sendError(ws, 'Connection not found', 'INTERNAL_ERROR');
    return;
  }

  const { user } = connection;
  const requestedCameras = message.cameras || [];
  const filters = message.filters || {};

  let availableCameras = [];

  try {
    // No requested serials means all enabled devices.
    if (requestedCameras.length === 0) {
      const devices = await Camera.find({ enabled: true }).select('serialNumber').lean();
      availableCameras = devices.map((device) => device.serialNumber);
    } else {
      const devices = await Camera.find({
        serialNumber: { $in: requestedCameras },
        enabled: true,
      }).select('serialNumber').lean();
      availableCameras = devices.map((device) => device.serialNumber);
    }

    // Update subscriptions
    updateSubscriptions(connectionId, availableCameras, filters);

    // Send confirmation
    ws.send(
      JSON.stringify({
        type: 'subscribed',
        cameras: availableCameras,
        timestamp: new Date().toISOString(),
      })
    );

    if (requestedCameras.length > 0 && availableCameras.length < requestedCameras.length) {
      const unavailableCameras = requestedCameras.filter(
        (camera) => !availableCameras.includes(camera)
      );
      sendError(
        ws,
        `Some devices are unavailable: ${unavailableCameras.join(', ')}`,
        'NOT_FOUND'
      );
    }

    logger.info('Client subscribed', {
      connectionId,
      userId: user._id,
      username: user.username,
      role: user.role,
      cameraCount: availableCameras.length,
      requestedCount: requestedCameras.length,
      filterCount: Object.keys(filters).length,
    });
  } catch (error) {
    logger.error('Error handling subscribe', {
      error: error.message,
      connectionId,
      userId: user._id,
    });
    sendError(ws, 'Failed to process subscription', 'INTERNAL_ERROR');
  }
}

/**
 * Handle unsubscribe message
 * @param {WebSocket} ws - WebSocket instance
 * @param {Object} message - Unsubscribe message
 * @param {string} connectionId - Connection ID
 */
async function handleUnsubscribe(ws, message, connectionId) {
  const connection = getConnection(connectionId);
  if (!connection) {
    sendError(ws, 'Connection not found', 'INTERNAL_ERROR');
    return;
  }

  const camerasToRemove = message.cameras || [];
  const currentSubs = connection.subscriptions.cameras;

  // Remove specified cameras from subscription
  const newCameras = currentSubs.filter((c) => !camerasToRemove.includes(c));

  updateSubscriptions(connectionId, newCameras, connection.subscriptions.filters);

  ws.send(
    JSON.stringify({
      type: 'unsubscribed',
      cameras: camerasToRemove,
      timestamp: new Date().toISOString(),
    })
  );

  logger.info('Client unsubscribed', {
    connectionId,
    userId: connection.user._id,
    removedCount: camerasToRemove.length,
    remainingCount: newCameras.length,
  });
}

/**
 * Handle ping message
 * @param {WebSocket} ws - WebSocket instance
 */
function handlePing(ws) {
  ws.send(
    JSON.stringify({
      type: 'pong',
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * Send error message to client
 * @param {WebSocket} ws - WebSocket instance
 * @param {string} error - Error message
 * @param {string} code - Error code
 */
function sendError(ws, error, code) {
  ws.send(
    JSON.stringify({
      type: 'error',
      error,
      code,
      timestamp: new Date().toISOString(),
    })
  );
}

export default {
  handleMessage,
};
