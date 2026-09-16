/**
 * WebSocket authentication
 * Authenticates WebSocket connections using JWT tokens from query parameters
 */

import { URL } from 'url';
import { verifyToken } from '../services/authService.js';
import { User } from '../models/index.js';
import logger from '../utils/logger.js';

/**
 * Authenticate WebSocket connection from JWT query parameter
 * @param {http.IncomingMessage} request - HTTP upgrade request
 * @returns {Promise<Object>} User object
 * @throws {Error} If authentication fails
 */
export async function authenticateWebSocket(request) {
  try {
    // Parse token from query string
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      throw new Error('No token provided');
    }

    // Verify JWT token (reuses existing authService logic)
    const decoded = verifyToken(token);

    // Handle environment-based admin (same pattern as REST API)
    if (decoded.id === 'env-admin') {
      logger.debug('Environment admin authenticated via WebSocket');
      return {
        _id: 'env-admin',
        username: decoded.username,
        role: 'admin',
        enabled: true,
        isEnvAdmin: true,
      };
    }

    // Fetch user from database
    const user = await User.findById(decoded.id).select('-password').lean();

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.enabled) {
      throw new Error('Account is disabled');
    }

    logger.debug('User authenticated via WebSocket', {
      userId: user._id,
      username: user.username,
      role: user.role,
    });

    return user;
  } catch (error) {
    logger.error('WebSocket authentication failed', { error: error.message });
    throw error;
  }
}

export default {
  authenticateWebSocket,
};
