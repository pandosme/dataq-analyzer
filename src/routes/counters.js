import express from 'express';
import * as counterSetsService from '../services/counterSetsService.js';
import * as countersService from '../services/countersService.js';
import retentionService from '../services/retentionService.js';
import { getMQTTClient } from '../mqtt/client.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

const editorGuard = [authenticate, requireAdmin];

// Literal routes MUST come before dynamic /:id routes in Express

/** GET /api/counters — list all counter sets */
router.get('/', async (req, res) => {
  try {
    const sets = await counterSetsService.list();
    res.json({ success: true, data: sets });
  } catch (err) {
    logger.error('GET /counters error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve counter sets' });
  }
});

/** POST /api/counters — create counter set + async backfill */
router.post('/', ...editorGuard, async (req, res) => {
  try {
    const mqttClient = getMQTTClient();
    const doc = await counterSetsService.create(req.body, mqttClient);
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
    if (err.code === 11000) return res.status(409).json({ success: false, error: 'A counter set with that name already exists' });
    logger.error('POST /counters error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to create counter set' });
  }
});

// Legacy admin telemetry (literal paths — must be before /:id)
router.get('/cameras', async (req, res) => {
  try {
    const { since } = req.query;
    const options = {};
    if (since) options.since = new Date(since);
    const counts = await countersService.getCountsByCamera(options);
    res.json({ success: true, data: counts });
  } catch (error) {
    logger.error('Error getting counters', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve counters' });
  }
});

router.get('/cameras/:serial/series', async (req, res) => {
  try {
    const { serial } = req.params;
    const interval = req.query.interval || 'day';
    const rangeDays = parseInt(req.query.rangeDays || '30', 10);
    const series = await countersService.getSeriesForCamera(serial.toUpperCase(), interval, rangeDays);
    res.json({ success: true, data: series });
  } catch (error) {
    logger.error('Error getting series', { error: error.message, serial: req.params.serial });
    res.status(500).json({ success: false, error: 'Failed to retrieve series' });
  }
});

router.post('/cleanup', ...editorGuard, async (req, res) => {
  try {
    const result = await retentionService.runRetentionCleanup();
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Manual retention cleanup failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dynamic /:id routes (after all literals)

/** GET /api/counters/:id */
router.get('/:id', async (req, res) => {
  try {
    const doc = await counterSetsService.getById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Counter set not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    logger.error('GET /counters/:id error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve counter set' });
  }
});

/** PUT /api/counters/:id */
router.put('/:id', ...editorGuard, async (req, res) => {
  try {
    const mqttClient = getMQTTClient();
    const doc = await counterSetsService.update(req.params.id, req.body, mqttClient);
    if (!doc) return res.status(404).json({ success: false, error: 'Counter set not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    logger.error('PUT /counters/:id error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to update counter set' });
  }
});

/** DELETE /api/counters/:id */
router.delete('/:id', ...editorGuard, async (req, res) => {
  try {
    const mqttClient = getMQTTClient();
    const deleted = await counterSetsService.deleteById(req.params.id, mqttClient);
    if (!deleted) return res.status(404).json({ success: false, error: 'Counter set not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    logger.error('DELETE /counters/:id error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to delete counter set' });
  }
});

/** GET /api/counters/:id/backfill */
router.get('/:id/backfill', async (req, res) => {
  try {
    const status = await counterSetsService.getBackfillStatus(req.params.id);
    if (!status) return res.status(404).json({ success: false, error: 'Counter set not found' });
    res.json({ success: true, data: status });
  } catch (err) {
    logger.error('GET /counters/:id/backfill error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to get backfill status' });
  }
});

/** POST /api/counters/:id/backfill — trigger backfill (resets counters then recounts) */
router.post('/:id/backfill', ...editorGuard, async (req, res) => {
  try {
    const result = await counterSetsService.startBackfill(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('POST /counters/:id/backfill error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to start backfill' });
  }
});

/** POST /api/counters/:id/reset — reset all counters */
router.post('/:id/reset', ...editorGuard, async (req, res) => {
  try {
    const doc = await counterSetsService.resetAll(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Counter set not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    logger.error('POST /counters/:id/reset error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to reset counters' });
  }
});

/** POST /api/counters/:id/counters/:counterId/reset — reset one counter (counterId URL-encoded) */
router.post('/:id/counters/:counterId/reset', ...editorGuard, async (req, res) => {
  try {
    const counterId = decodeURIComponent(req.params.counterId);
    const doc = await counterSetsService.resetOne(req.params.id, counterId);
    if (!doc) return res.status(404).json({ success: false, error: 'Counter set or counter not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    logger.error('POST /counters/:id/counters/:counterId/reset error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to reset counter' });
  }
});

export default router;
