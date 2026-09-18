import express from 'express';
import camerasRouter from './cameras.js';
import pathsRouter from './paths.js';
import configRouter from './config.js';
import authRouter from './auth.js';
import usersRouter from './users.js';
import countersRouter from './counters.js';
import occupancyRouter from './occupancy.js';
import { authenticate } from '../middleware/auth.js';
import { appConfig } from '../config/index.js';

const router = express.Router();

router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: { appName: appConfig.name },
  });
});

// Auth routes
router.use('/auth', authRouter);

// Application API routes
router.use('/cameras', camerasRouter);
router.use('/paths', authenticate, pathsRouter);
router.use('/config', configRouter);
router.use('/counters', authenticate, countersRouter);
router.use('/occupancy', authenticate, occupancyRouter);

// User routes (requires JWT authentication for client apps)
router.use('/users', authenticate, usersRouter);

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const { getSystemConfig } = await import('../services/configService.js');
    const config = await getSystemConfig();

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      playback: {
        enabled: config.playback?.enabled || false,
        type: config.playback?.type || 'None',
        serverUrl: config.playback?.serverUrl || null,
        configured: !!(config.playback?.enabled && config.playback?.serverUrl && config.playback?.username && config.playback?.password),
      },
    });
  } catch (error) {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      playback: {
        enabled: false,
        type: 'None',
        configured: false,
        error: error.message,
      },
    });
  }
});

export default router;
