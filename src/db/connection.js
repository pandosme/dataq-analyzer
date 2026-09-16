import mongoose from 'mongoose';
import { dbConfig } from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Connect to MongoDB
 * @param {string} customUri - Optional custom MongoDB URI
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDB(customUri = null) {
  try {
    const uri = customUri || dbConfig.uri;
    const conn = await mongoose.connect(uri, dbConfig.options);
    logger.info('MongoDB connected', { host: conn.connection.host });
    return conn;
  } catch (error) {
    logger.error('MongoDB connection error', { error: error.message });
    throw error;
  }
}

/**
 * Check if MongoDB is connected
 * @returns {boolean}
 */
export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Get current connection status
 * @returns {Object}
 */
export function getDBStatus() {
  const state = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  return {
    connected: state === 1,
    state: states[state] || 'unknown',
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null,
  };
}

/**
 * Disconnect from MongoDB
 */
export async function disconnectDB() {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error('MongoDB disconnection error', { error: error.message });
    throw error;
  }
}

/**
 * Handle MongoDB connection events
 */
export function setupDBEventHandlers() {
  mongoose.connection.on('connected', () => {
    logger.info('Mongoose connected to MongoDB');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('Mongoose connection error', { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('Mongoose disconnected from MongoDB');
  });

  // Handle application termination
  process.on('SIGINT', async () => {
    await mongoose.connection.close();
    logger.info('Mongoose connection closed due to application termination');
    process.exit(0);
  });
}

export default {
  connectDB,
  disconnectDB,
  setupDBEventHandlers,
  isDBConnected,
  getDBStatus,
};
