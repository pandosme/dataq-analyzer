/**
 * WebSocket server setup
 * Handles HTTP upgrade requests and WebSocket connection lifecycle
 */

import { WebSocketServer } from 'ws';
import { URL } from 'url';
import { randomUUID } from 'crypto';
import { authenticateWebSocket } from './auth.js';
import { handleMessage } from './handlers.js';
import { addConnection, removeConnection } from './manager.js';
import { handleVideoMessage, cleanupVideoConnection } from './videoHandlers.js';
import logger from '../utils/logger.js';

/**
 * Create and configure WebSocket server
 * @param {http.Server} httpServer - HTTP server instance
 * @returns {WebSocketServer} WebSocket server instance
 */
export function createWebSocketServer(httpServer) {
  // Create WebSocket server with noServer option
  // This allows us to handle HTTP upgrade manually
  const wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade requests
  httpServer.on('upgrade', async (request, socket, head) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);

      // Check if path is valid WebSocket endpoint
      if (url.pathname !== '/ws/paths' && url.pathname !== '/ws/video') {
        logger.warn('WebSocket upgrade request to invalid path', {
          path: url.pathname,
        });
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // Authenticate the connection
      const user = await authenticateWebSocket(request);

      // Attach user and endpoint type to request for connection handler
      request.user = user;
      request.endpoint = url.pathname;

      // Complete WebSocket upgrade
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch (error) {
      logger.error('WebSocket authentication failed', {
        error: error.message,
        url: request.url,
      });
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  // Handle new WebSocket connections
  wss.on('connection', (ws, request) => {
    const user = request.user;
    const endpoint = request.endpoint;

    // Route to appropriate handler based on endpoint
    if (endpoint === '/ws/paths') {
      handlePathConnection(ws, user);
    } else if (endpoint === '/ws/video') {
      handleVideoConnection(ws, user);
    }
  });

  logger.info('WebSocket server initialized at /ws/paths and /ws/video');
  return wss;
}

/**
 * Handle path events WebSocket connection
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} user - Authenticated user
 */
function handlePathConnection(ws, user) {
  const connectionId = addConnection(ws, user);

  logger.info('WebSocket client connected (paths)', {
    userId: user._id,
    username: user.username,
    role: user.role,
    connectionId,
  });

  // Send connection confirmation
  ws.send(
    JSON.stringify({
      type: 'connected',
      message: 'WebSocket connection established',
      userId: user._id,
      timestamp: new Date().toISOString(),
    })
  );

  // Handle incoming messages
  ws.on('message', (data) => {
    handleMessage(ws, data, connectionId);
  });

  // Handle connection close
  ws.on('close', () => {
    removeConnection(connectionId);
    logger.info('WebSocket client disconnected (paths)', {
      userId: user._id,
      username: user.username,
      connectionId,
    });
  });

  // Handle errors
  ws.on('error', (error) => {
    logger.error('WebSocket error (paths)', {
      error: error.message,
      connectionId,
      userId: user._id,
    });
  });
}

/**
 * Handle video streaming WebSocket connection
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} user - Authenticated user
 */
function handleVideoConnection(ws, user) {
  const connectionId = randomUUID();

  logger.info('WebSocket client connected (video)', {
    userId: user._id,
    username: user.username,
    role: user.role,
    connectionId,
  });

  // Send connection confirmation
  ws.send(
    JSON.stringify({
      type: 'connected',
      message: 'Video WebSocket connection established',
      userId: user._id,
      timestamp: new Date().toISOString(),
    })
  );

  // Handle incoming messages
  ws.on('message', (data) => {
    handleVideoMessage(ws, data, connectionId);
  });

  // Handle connection close
  ws.on('close', () => {
    cleanupVideoConnection(connectionId);
    logger.info('WebSocket client disconnected (video)', {
      userId: user._id,
      username: user.username,
      connectionId,
    });
  });

  // Handle errors
  ws.on('error', (error) => {
    logger.error('WebSocket error (video)', {
      error: error.message,
      connectionId,
      userId: user._id,
    });
    cleanupVideoConnection(connectionId);
  });
}

export default {
  createWebSocketServer,
};
