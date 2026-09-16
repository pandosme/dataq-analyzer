/**
 * WebSocket connection and subscription management
 * Tracks active connections, their users, and subscriptions
 */

import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';

// Map of connectionId -> connection metadata
const connections = new Map();

/**
 * Add new WebSocket connection
 * @param {WebSocket} ws - WebSocket instance
 * @param {Object} user - User object
 * @returns {string} Connection ID
 */
export function addConnection(ws, user) {
  const connectionId = randomUUID();

  connections.set(connectionId, {
    id: connectionId,
    ws,
    user,
    subscriptions: {
      cameras: [], // Empty = all authorized cameras
      filters: {},
    },
    createdAt: new Date(),
  });

  logger.debug('Connection added', { connectionId, userId: user._id });
  return connectionId;
}

/**
 * Remove connection
 * @param {string} connectionId
 * @returns {boolean} True if connection was removed
 */
export function removeConnection(connectionId) {
  const removed = connections.delete(connectionId);
  if (removed) {
    logger.debug('Connection removed', { connectionId });
  }
  return removed;
}

/**
 * Get connection by ID
 * @param {string} connectionId
 * @returns {Object|undefined} Connection metadata
 */
export function getConnection(connectionId) {
  return connections.get(connectionId);
}

/**
 * Get all active connections
 * @returns {Array<Object>} Array of connection metadata objects
 */
export function getAllConnections() {
  return Array.from(connections.values());
}

/**
 * Update connection subscriptions
 * @param {string} connectionId
 * @param {Array<string>} cameras - Camera serial numbers
 * @param {Object} filters - Filter criteria
 * @returns {boolean} True if update was successful
 */
export function updateSubscriptions(connectionId, cameras, filters) {
  const connection = connections.get(connectionId);
  if (connection) {
    connection.subscriptions = { cameras, filters };
    logger.debug('Subscriptions updated', {
      connectionId,
      cameraCount: cameras.length,
      filterKeys: Object.keys(filters),
    });
    return true;
  }
  return false;
}

/**
 * Get connection subscriptions
 * @param {string} connectionId
 * @returns {Object|null} Subscriptions object or null if not found
 */
export function getSubscriptions(connectionId) {
  const connection = connections.get(connectionId);
  return connection?.subscriptions || null;
}

/**
 * Get statistics about current connections
 * @returns {Object} Connection statistics
 */
export function getConnectionStats() {
  return {
    totalConnections: connections.size,
    connections: Array.from(connections.values()).map((conn) => ({
      id: conn.id,
      userId: conn.user._id,
      username: conn.user.username,
      role: conn.user.role,
      cameraCount: conn.subscriptions.cameras.length,
      hasFilters: Object.keys(conn.subscriptions.filters).length > 0,
      connectedAt: conn.createdAt,
    })),
  };
}

export default {
  addConnection,
  removeConnection,
  getConnection,
  getAllConnections,
  updateSubscriptions,
  getSubscriptions,
  getConnectionStats,
};
