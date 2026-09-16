/**
 * WebSocket event broadcasting
 * Broadcasts path events to subscribed WebSocket clients with filtering
 */

import { getAllConnections } from './manager.js';
import { matchesFilters } from './filters.js';
import logger from '../utils/logger.js';

/**
 * Broadcast a path event to all subscribed WebSocket clients
 * @param {Object} pathEvent - Path event data from MQTT
 */
export function broadcastPathEvent(pathEvent) {
  const connections = getAllConnections();
  let sentCount = 0;
  let filteredCount = 0;

  for (const connection of connections) {
    const shouldSend = shouldSendToClient(connection, pathEvent);

    if (shouldSend) {
      try {
        // Send event to client
        connection.ws.send(
          JSON.stringify({
            type: 'path',
            data: pathEvent,
          })
        );
        sentCount++;
      } catch (error) {
        logger.error('Failed to send path event to client', {
          error: error.message,
          connectionId: connection.id,
          userId: connection.user._id,
        });
      }
    } else {
      filteredCount++;
    }
  }

  if (sentCount > 0) {
    logger.debug('Path event broadcasted', {
      trackingId: pathEvent.id,
      serial: pathEvent.serial,
      class: pathEvent.class,
      recipientCount: sentCount,
      filteredCount,
      totalConnections: connections.length,
    });
  }
}

/**
 * Check if a path event should be sent to a specific client
 * @param {Object} connection - Connection metadata
 * @param {Object} pathEvent - Path event data
 * @returns {boolean} True if event should be sent
 */
function shouldSendToClient(connection, pathEvent) {
  const { ws, subscriptions } = connection;

  // Check WebSocket readiness (1 = OPEN)
  if (ws.readyState !== 1) {
    return false;
  }

  const { cameras, filters } = subscriptions;

  // Check camera subscription
  if (cameras.length > 0) {
    // If cameras array is populated, check if this camera is subscribed
    if (!cameras.includes(pathEvent.serial)) {
      return false;
    }
  }

  // Apply client-side filters
  if (!matchesFilters(pathEvent, filters)) {
    return false;
  }

  return true;
}

/**
 * Broadcast a snapshot (image) update to all WebSocket clients subscribed to that camera
 * @param {Object} snapshot - Snapshot data
 * @param {string} snapshot.serial - Camera serial number
 * @param {string} snapshot.image - Base64 encoded image
 * @param {number} snapshot.timestamp - Image timestamp (ms)
 * @param {number} [snapshot.rotation] - Image rotation degrees
 * @param {string} [snapshot.aspect] - Aspect ratio string
 */
export function broadcastSnapshot(snapshot) {
  const connections = getAllConnections();
  let sentCount = 0;

  for (const connection of connections) {
    const { ws, subscriptions } = connection;

    if (ws.readyState !== 1) continue;

    const { cameras } = subscriptions;

    // Send if subscribed to this specific camera, or subscribed to all (empty array)
    const isSubscribed =
      cameras.length === 0 || cameras.includes(snapshot.serial?.toUpperCase());

    if (!isSubscribed) continue;

    try {
      ws.send(
        JSON.stringify({
          type: 'snapshot',
          serial: snapshot.serial,
          image: snapshot.image,
          timestamp: snapshot.timestamp,
          rotation: snapshot.rotation ?? 0,
          aspect: snapshot.aspect ?? '16:9',
        })
      );
      sentCount++;
    } catch (error) {
      logger.error('Failed to send snapshot to client', {
        error: error.message,
        connectionId: connection.id,
      });
    }
  }

  if (sentCount > 0) {
    logger.debug('Snapshot broadcasted', {
      serial: snapshot.serial,
      recipientCount: sentCount,
    });
  }
}

export default {
  broadcastPathEvent,
  broadcastSnapshot,
};
