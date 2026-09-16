import { PathEvent } from '../models/index.js';
import logger from '../utils/logger.js';

/**
 * Save a path event to the database
 * Stores the data as-is without transformation
 * @param {Object} pathEventData - Path event data from MQTT
 * @returns {Promise<Object>} - Saved path event document
 */
export async function savePathEvent(pathEventData) {
  try {
    const pathEvent = new PathEvent(pathEventData);
    await pathEvent.save();
    logger.debug('Path event saved', {
      trackingId: pathEvent.id,
      serial: pathEvent.serial,
    });
    return pathEvent;
  } catch (error) {
    logger.error('Failed to save path event', {
      error: error.message,
      trackingId: pathEventData.id,
    });
    throw error;
  }
}

/**
 * Query path events using MongoDB query format
 * Acts as a direct proxy to MongoDB
 * @param {Object} mongoQuery - MongoDB query object
 * @param {Object} options - Query options (sort, limit, skip, projection)
 * @returns {Promise<Array>} - Query results
 */
export async function queryPathEvents(mongoQuery = {}, options = {}) {
  try {
    const {
      sort = { timestamp: -1 },
      limit = 100,
      skip = 0,
      projection = {},
    } = options;

    // Execute MongoDB query as-is
    const events = await PathEvent.find(mongoQuery, projection)
      .sort(sort)
      .skip(skip)
      .limit(Math.min(limit, 50000)) // Max 50000 results — AOI/dwell-time filters can be highly selective
      .lean();

    return events;
  } catch (error) {
    logger.error('Failed to query path events', {
      error: error.message,
      query: mongoQuery,
    });
    throw error;
  }
}

/**
 * Count path events matching a MongoDB query
 * @param {Object} mongoQuery - MongoDB query object
 * @returns {Promise<number>} - Count of matching documents
 */
export async function countPathEvents(mongoQuery = {}) {
  try {
    return await PathEvent.countDocuments(mongoQuery);
  } catch (error) {
    logger.error('Failed to count path events', {
      error: error.message,
      query: mongoQuery,
    });
    throw error;
  }
}

/**
 * Get a single path event by ID
 * @param {string} id - Path event ID
 * @returns {Promise<Object|null>}
 */
export async function getPathEventById(id) {
  try {
    return await PathEvent.findById(id).lean();
  } catch (error) {
    logger.error('Failed to get path event', { error: error.message, id });
    throw error;
  }
}

/**
 * Aggregate path events using MongoDB aggregation pipeline
 * Acts as a direct proxy to MongoDB aggregation
 * @param {Array} pipeline - MongoDB aggregation pipeline
 * @returns {Promise<Array>} - Aggregation results
 */
export async function aggregatePathEvents(pipeline) {
  try {
    return await PathEvent.aggregate(pipeline);
  } catch (error) {
    logger.error('Failed to aggregate path events', {
      error: error.message,
      pipeline,
    });
    throw error;
  }
}

export default {
  savePathEvent,
  queryPathEvents,
  countPathEvents,
  getPathEventById,
  aggregatePathEvents,
};
