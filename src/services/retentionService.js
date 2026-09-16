import logger from '../utils/logger.js';
import { Camera, PathEvent } from '../models/index.js';
import * as configService from './configService.js';

/**
 * Run cleanup for a single camera using its retentionDays or system default
 * @param {Object} camera
 */
async function cleanupCamera(camera, defaultRetentionDays) {
  try {
    const retentionDays = camera.retentionDays != null ? camera.retentionDays : defaultRetentionDays;
    if (!retentionDays || retentionDays <= 0) return 0;

    const nowMs = Date.now();
    const cutoffDate = new Date(nowMs - retentionDays * 24 * 60 * 60 * 1000);
    const cutoffEpoch = Math.floor(cutoffDate.getTime() / 1000);

    const result = await PathEvent.deleteMany({
      serial: camera.serialNumber,
      $or: [{ timestamp: { $lte: cutoffEpoch } }, { createdAt: { $lte: cutoffDate } }],
    });

    logger.info('Retention cleanup for camera', {
      serial: camera.serialNumber,
      retentionDays,
      deletedCount: result.deletedCount || 0,
    });

    return result.deletedCount || 0;
  } catch (error) {
    logger.error('Failed to cleanup camera retention', { serial: camera.serialNumber, error: error.message });
    return 0;
  }
}

/**
 * Run full cleanup across all cameras using per-camera overrides or system default
 */
export async function runRetentionCleanup() {
  try {
    const systemConfig = await configService.getSystemConfig();
    const defaultRetentionDays = systemConfig?.dataRetentionDays || 90;

    const cameras = await Camera.find({}).lean();
    let totalDeleted = 0;

    for (const cam of cameras) {
      // Skip disabled cameras?
      // We still cleanup data for disabled cameras to free space
      const deleted = await cleanupCamera(cam, defaultRetentionDays);
      totalDeleted += deleted;
    }

    logger.info('Retention cleanup completed', { totalDeleted, cameras: cameras.length });
    return { totalDeleted, camerasProcessed: cameras.length };
  } catch (error) {
    logger.error('Failed to run retention cleanup', { error: error.message });
    throw error;
  }
}

/**
 * Schedule daily cleanup at local midnight. Uses setTimeout to schedule first run,
 * then setInterval every 24h.
 */
export function scheduleDailyCleanup() {
  try {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0); // next local midnight
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    logger.info('Scheduling retention cleanup', { msUntilMidnight });

    // First run at next midnight
    setTimeout(() => {
      runRetentionCleanup().catch((err) => logger.error('Scheduled retention cleanup failed', { error: err.message }));

      // Subsequent runs every 24 hours
      setInterval(() => {
        runRetentionCleanup().catch((err) => logger.error('Scheduled retention cleanup failed', { error: err.message }));
      }, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  } catch (error) {
    logger.error('Failed to schedule retention cleanup', { error: error.message });
  }
}

export default {
  runRetentionCleanup,
  scheduleDailyCleanup,
};
