import express from 'express';
import * as pathEventService from '../services/pathEventService.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/paths/query
 * Query path events using MongoDB query format
 *
 * Request body:
 * {
 *   "query": { ... MongoDB query object ... },
 *   "options": {
 *     "sort": { "timestamp": -1 },
 *     "limit": 100,
 *     "skip": 0,
 *     "projection": {}
 *   }
 * }
 *
 * Note: Timestamps should be sent as EPOCH milliseconds (numbers) for efficient comparison
 */
router.post('/query', async (req, res) => {
  try {
    const { query = {}, options = {} } = req.body;

    const events = await pathEventService.queryPathEvents(query, options);
    res.json({ success: true, data: events });
  } catch (error) {
    logger.error('Error querying path events', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to query path events' });
  }
});

/**
 * POST /api/paths/count
 * Count path events matching a MongoDB query
 *
 * Request body:
 * {
 *   "query": { ... MongoDB query object ... }
 * }
 */
router.post('/count', async (req, res) => {
  try {
    const { query = {} } = req.body;

    const count = await pathEventService.countPathEvents(query);
    res.json({ success: true, data: { count } });
  } catch (error) {
    logger.error('Error counting path events', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to count path events' });
  }
});

/**
 * POST /api/paths/aggregate
 * Run MongoDB aggregation pipeline on path events
 *
 * Request body:
 * {
 *   "pipeline": [ ... MongoDB aggregation pipeline ... ]
 * }
 */
router.post('/aggregate', async (req, res) => {
  try {
    const { pipeline = [] } = req.body;

    if (!Array.isArray(pipeline)) {
      return res.status(400).json({
        success: false,
        error: 'Pipeline must be an array',
      });
    }

    const results = await pathEventService.aggregatePathEvents(pipeline);
    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Error aggregating path events', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to aggregate path events' });
  }
});

/**
 * GET /api/paths/:id
 * Get a single path event by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const pathEvent = await pathEventService.getPathEventById(req.params.id);
    if (!pathEvent) {
      return res.status(404).json({ success: false, error: 'Path event not found' });
    }
    res.json({ success: true, data: pathEvent });
  } catch (error) {
    logger.error('Error getting path event', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to retrieve path event' });
  }
});

/**
 * GET /api/paths
 * Simple query endpoint for basic use cases
 * Accepts query parameters and converts to MongoDB query
 *
 * Query parameters:
 * - serial: Filter by camera serial number
 * - class: Filter by object class
 * - limit: Number of results (default: 100, max: 10000)
 * - skip: Number of results to skip
 */
router.get('/', async (req, res) => {
  try {
    const { serial, class: objectClass, limit, skip, sort, order } = req.query;

    // Build MongoDB query from simple parameters
    const query = {};
    if (serial) query.serial = serial.toUpperCase();
    if (objectClass) query.class = objectClass;

    // Build options
    const options = {
      limit: limit ? Math.min(parseInt(limit, 10), 50000) : 100,
      skip: skip ? parseInt(skip, 10) : 0,
      sort: {},
    };

    // Handle sort
    const sortField = sort || 'timestamp';
    const sortOrder = order === 'asc' ? 1 : -1;
    options.sort[sortField] = sortOrder;

    const events = await pathEventService.queryPathEvents(query, options);
    res.json({ success: true, data: events });
  } catch (error) {
    logger.error('Error querying path events', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to query path events' });
  }
});

export default router;
