import { verifyToken } from '../services/authService.js';
import { User, Camera } from '../models/index.js';
import logger from '../utils/logger.js';

/**
 * Middleware to authenticate requests
 * Verifies JWT token and attaches user to request
 */
export async function authenticate(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = verifyToken(token);

    // Get user from database
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
      });
    }

    if (!user.enabled) {
      return res.status(403).json({
        success: false,
        error: 'Account is disabled',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication failed', { error: error.message });
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }
}

/**
 * Middleware to require admin role
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required',
    });
  }

  next();
}

export function getVisibleDeviceFilter(user, { includeArchived = false } = {}) {
  return includeArchived && user.role === 'admin' ? {} : { archivedAt: null };
}

export async function requireDeviceOwner(req, res, next) {
  try {
    const device = await Camera.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    req.device = device;
    next();
  } catch (error) {
    logger.error('Device ownership check failed', { error: error.message });
    return res.status(404).json({ success: false, error: 'Device not found' });
  }
}

export async function requireDeviceAccessBySerial(req, res, next) {
  try {
    const device = await Camera.findOne({
      serialNumber: req.params.serialNumber.toUpperCase(),
      ...getVisibleDeviceFilter(req.user),
    });
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    req.device = device;
    next();
  } catch (error) {
    logger.error('Device access check failed', { error: error.message });
    return res.status(404).json({ success: false, error: 'Device not found' });
  }
}

/**
 * Middleware to check camera authorization
 */
export async function checkCameraAccess(req, res, next) {
  return next();
}

/**
 * Optional authentication middleware
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);

      const user = await User.findById(decoded.id).select('-password');
      if (user && user.enabled) {
        req.user = user;
      }
    }
  } catch (error) {
    // Silently fail for optional auth
  }
  next();
}

export default {
  authenticate,
  requireAdmin,
  getVisibleDeviceFilter,
  requireDeviceOwner,
  requireDeviceAccessBySerial,
  checkCameraAccess,
  optionalAuth,
};
