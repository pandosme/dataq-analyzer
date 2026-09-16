/**
 * WebSocket module entry point
 * Main exports for WebSocket server setup and event broadcasting
 */

import { createWebSocketServer } from './server.js';
import { broadcastPathEvent as broadcast } from './broadcaster.js';
import { getConnectionStats } from './manager.js';
import logger from '../utils/logger.js';

let wss = null;

/**
 * Setup WebSocket server
 * @param {http.Server} httpServer - HTTP server instance
 * @returns {WebSocketServer|null} WebSocket server instance or null if setup fails
 */
export function setupWebSocketServer(httpServer) {
  try {
    wss = createWebSocketServer(httpServer);
    logger.info('WebSocket module initialized successfully');
    return wss;
  } catch (error) {
    logger.error('Failed to setup WebSocket server', {
      error: error.message,
      stack: error.stack,
    });
    // Don't crash the app if WebSocket fails to initialize
    // REST API will continue to work
    return null;
  }
}

/**
 * Broadcast path event to subscribed clients
 * @param {Object} pathEvent - Path event data
 */
export function broadcastPathEvent(pathEvent) {
  if (wss) {
    try {
      broadcast(pathEvent);
    } catch (error) {
      logger.error('Error broadcasting path event', {
        error: error.message,
        trackingId: pathEvent.id,
        serial: pathEvent.serial,
      });
    }
  }
}

/**
 * Get WebSocket connection statistics
 * @returns {Object} Connection statistics
 */
export function getWebSocketStats() {
  return getConnectionStats();
}

export default {
  setupWebSocketServer,
  broadcastPathEvent,
  getWebSocketStats,
};
