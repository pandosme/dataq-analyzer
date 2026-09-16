import express from 'express';
import { getOccupancyAreas, getOccupancySeries, OCCUPANCY_RANGES } from '../services/occupancyService.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.get('/areas', async (req, res) => {
  const serial = String(req.query.serial || '').trim();
  if (!serial) {
    return res.status(400).json({ success: false, error: 'serial is required' });
  }

  try {
    const areas = await getOccupancyAreas(serial);
    return res.json({ success: true, data: areas });
  } catch (error) {
    logger.error('Failed to list occupancy areas', { error: error.message, serial });
    return res.status(500).json({ success: false, error: 'Failed to list occupancy areas' });
  }
});

router.get('/series', async (req, res) => {
  const serial = String(req.query.serial || '').trim();
  const area = String(req.query.area || '').trim();
  const range = String(req.query.range || '1h');
  const to = req.query.to === undefined ? Date.now() : Number(req.query.to);

  if (!serial || !area) {
    return res.status(400).json({ success: false, error: 'serial and area are required' });
  }
  if (!OCCUPANCY_RANGES[range]) {
    return res.status(400).json({ success: false, error: 'Unsupported occupancy range' });
  }
  if (!Number.isFinite(to) || to <= 0) {
    return res.status(400).json({ success: false, error: 'to must be epoch milliseconds' });
  }

  try {
    const series = await getOccupancySeries({ serial, area, range, to });
    return res.json({ success: true, data: series });
  } catch (error) {
    logger.error('Failed to query occupancy series', {
      error: error.message,
      serial,
      area,
      range,
    });
    return res.status(500).json({ success: false, error: 'Failed to query occupancy series' });
  }
});

export default router;