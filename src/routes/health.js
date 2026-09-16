import express from 'express';
import { getSystemConfig } from '../services/configService.js';

const router = express.Router();

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/', async (req, res) => {
  try {
    const config = await getSystemConfig();

    res.json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        playback: {
          enabled: config.playback?.enabled || false,
          type: config.playback?.type || 'None',
          configured: !!(config.playback?.serverUrl && config.playback?.apiKey),
        },
      },
    });
  } catch (error) {
    res.json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        playback: {
          enabled: false,
          type: 'None',
          configured: false,
          error: error.message,
        },
      },
    });
  }
});

export default router;
