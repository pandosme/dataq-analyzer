import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { authConfig } from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Generate JWT token for user
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
export function generateToken(user) {
  const payload = {
    id: user._id,
    username: user.username,
    role: user.role,
  };

  return jwt.sign(payload, authConfig.jwtSecret, {
    expiresIn: authConfig.jwtExpiresIn,
  });
}

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, authConfig.jwtSecret);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * Register a new user
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} Created user and token
 */
export async function register(userData) {
  try {
    const { username, password, role } = userData;

    const existingUser = await User.findOne({ username });

    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Create new user
    const user = new User({
      username,
      password,
      role: role || 'viewer',
    });

    await user.save();

    logger.info('User registered', { username, role: user.role });

    // Generate token
    const token = generateToken(user);

    return {
      user: user.toSafeObject(),
      token,
    };
  } catch (error) {
    logger.error('User registration failed', { error: error.message });
    throw error;
  }
}

/**
 * Login user
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<Object>} User and token
 */
export async function login(username, password) {
  try {
    const user = await User.findOne({ username });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (!user.enabled) {
      throw new Error('Account is disabled');
    }

    const isValid = await user.comparePassword(password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    user.lastLogin = new Date();
    await user.save();

    logger.info('User logged in', { username: user.username });

    const token = generateToken(user);
    return { user: user.toSafeObject(), token };
  } catch (error) {
    logger.error('Login failed', { error: error.message, username });
    throw error;
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId) {
  try {
    const user = await User.findById(userId).select('-password').lean();
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  } catch (error) {
    logger.error('Failed to get user', { error: error.message, userId });
    throw error;
  }
}

/**
 * Check if any users exist in the system
 */
export async function hasUsers() {
  try {
    const count = await User.countDocuments();
    return count > 0;
  } catch (error) {
    logger.error('Failed to check users', { error: error.message });
    throw error;
  }
}

/**
 * Check if any admin users exist
 */
export async function hasAdmins() {
  try {
    const count = await User.countDocuments({ role: 'admin' });
    return count > 0;
  } catch (error) {
    logger.error('Failed to check admins', { error: error.message });
    throw error;
  }
}

/**
 * Create initial admin user (only if no users exist)
 */
export async function createInitialAdmin(adminData) {
  try {
    const adminsExist = await hasAdmins();
    if (adminsExist) {
      throw new Error('An administrator already exists. Cannot create initial admin.');
    }

    const admin = await register({
      ...adminData,
      role: 'admin',
    });

    logger.info('Initial admin created', { username: admin.user.username });
    return admin;
  } catch (error) {
    logger.error('Failed to create initial admin', { error: error.message });
    throw error;
  }
}

export async function ensureBootstrapAdmin() {
  if (await hasAdmins()) {
    return null;
  }

  if (!authConfig.bootstrapAdminUsername || !authConfig.bootstrapAdminPassword) {
    throw new Error(
      'No administrator exists. Set BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD to create the first administrator.'
    );
  }

  const existingUser = await User.findOne({ username: authConfig.bootstrapAdminUsername });
  if (existingUser) {
    existingUser.role = 'admin';
    existingUser.password = authConfig.bootstrapAdminPassword;
    existingUser.enabled = true;
    await existingUser.save();
    logger.info('Promoted bootstrap user to administrator', { username: existingUser.username });
    return existingUser.toSafeObject();
  }

  const result = await register({
    username: authConfig.bootstrapAdminUsername,
    password: authConfig.bootstrapAdminPassword,
    role: 'admin',
  });
  logger.info('Created bootstrap administrator', { username: result.user.username });
  return result.user;
}

/**
 * Get all users (admin only)
 */
export async function getAllUsers(_actor) {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 }).lean();
    return users;
  } catch (error) {
    logger.error('Failed to get users', { error: error.message });
    throw error;
  }
}

export async function createManagedUser(actor, userData) {
  if (actor.role !== 'admin') {
    const error = new Error('Admin access required');
    error.status = 403;
    throw error;
  }

  const role = userData.role || 'viewer';
  if (!['admin', 'viewer'].includes(role)) {
    const error = new Error('Invalid role');
    error.status = 400;
    throw error;
  }

  return register({
    ...userData,
    role,
  });
}

/**
 * Update user
 */
export async function updateUser(userId, updateData, actor) {
  try {
    const target = await User.findById(userId);
    if (!target) {
      const error = new Error('User not found');
      error.status = 404;
      throw error;
    }
    if (actor.role !== 'admin') {
      const error = new Error('Admin access required');
      error.status = 403;
      throw error;
    }

    const allowedFields = ['enabled', 'role'];
    const updates = {};

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        updates[field] = updateData[field];
      }
    });

    if (updates.role && !['admin', 'viewer'].includes(updates.role)) {
      const error = new Error('Invalid role');
      error.status = 400;
      throw error;
    }

    if (target.role === 'admin' && (updates.role && updates.role !== 'admin' || updates.enabled === false)) {
      const enabledAdmins = await User.countDocuments({ role: 'admin', enabled: true });
      if (enabledAdmins <= 1) {
        const error = new Error('The final enabled administrator cannot be disabled or demoted');
        error.status = 400;
        throw error;
      }
    }

    if (updateData.password) {
      target.password = updateData.password;
      await target.save();
    }

    const user = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    }).select('-password');

    logger.info('User updated', { userId });
    return user.toObject();
  } catch (error) {
    logger.error('Failed to update user', { error: error.message, userId });
    throw error;
  }
}

/**
 * Delete user
 */
export async function deleteUser(userId, actor) {
  try {
    const target = await User.findById(userId);
    if (!target) return false;
    if (actor.role !== 'admin') {
      const error = new Error('Admin access required');
      error.status = 403;
      throw error;
    }
    if (target.role === 'admin') {
      const enabledAdmins = await User.countDocuments({ role: 'admin', enabled: true });
      if (target.enabled && enabledAdmins <= 1) {
        const error = new Error('The final enabled administrator cannot be deleted');
        error.status = 400;
        throw error;
      }
    }

    const user = await User.findByIdAndDelete(userId);
    if (user) {
      logger.info('User deleted', { userId, username: user.username });
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Failed to delete user', { error: error.message, userId });
    throw error;
  }
}

export default {
  generateToken,
  verifyToken,
  register,
  login,
  getUserById,
  hasUsers,
  hasAdmins,
  createInitialAdmin,
  ensureBootstrapAdmin,
  getAllUsers,
  createManagedUser,
  updateUser,
  deleteUser,
};
