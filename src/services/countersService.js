import { PathEvent } from '../models/index.js';
import logger from '../utils/logger.js';

/**
 * Get path event counts grouped by camera serial.
 * @param {Object} options  { since?: Date }
 * @returns {Promise<Array<{serial, count}>>}
 */
export async function getCountsByCamera(options = {}) {
  try {
    const match = {};
    if (options.since) {
      const sinceEpoch = Math.floor(new Date(options.since).getTime() / 1000);
      match.timestamp = { $gte: sinceEpoch };
    }

    const results = await PathEvent.aggregate([
      { $match: match },
      { $group: { _id: '$serial', count: { $sum: 1 } } },
      { $project: { _id: 0, serial: '$_id', count: 1 } },
      { $sort: { count: -1 } },
    ]);

    return results;
  } catch (error) {
    logger.error('Failed to getCountsByCamera', { error: error.message });
    throw error;
  }
}

/**
 * Get time-bucketed counts for a single camera.
 * Uses integer modulo arithmetic on the epoch-seconds `timestamp` field.
 * @param {string} serial      Camera serial number (uppercase)
 * @param {'hour'|'day'} interval  Bucket size
 * @param {number} rangeDays   How many days back to query
 * @returns {Promise<Array<{bucketStart: Date, count: number}>>}
 */
export async function getSeriesForCamera(serial, interval = 'day', rangeDays = 30) {
  try {
    const bucketSeconds = interval === 'hour' ? 3600 : 86400;
    const fromEpoch = Math.floor(Date.now() / 1000) - rangeDays * 86400;

    // Floor each timestamp to the nearest bucket edge:
    // bucketId = timestamp - (timestamp % bucketSeconds)
    const raw = await PathEvent.aggregate([
      { $match: { serial, timestamp: { $gte: fromEpoch } } },
      {
        $group: {
          _id: { $subtract: ['$timestamp', { $mod: ['$timestamp', bucketSeconds] }] },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return raw.map((r) => ({
      bucketStart: new Date(r._id * 1000),
      count: r.count,
    }));
  } catch (error) {
    logger.error('Failed to getSeriesForCamera', { error: error.message, serial });
    throw error;
  }
}
