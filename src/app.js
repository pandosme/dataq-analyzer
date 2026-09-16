import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/index.js';
import { serverConfig } from './config/index.js';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create and configure Express application
 */
export function createApp() {
  const app = express();

  // Middleware
  // CORS configuration - allow requests from any origin
  const corsOrigin = serverConfig.corsOrigin;
  const corsOptions = {
    origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map(o => o.trim()),
    credentials: corsOrigin !== '*', // credentials can't be used with wildcard origin
    optionsSuccessStatus: 200
  };
  app.use(cors(corsOptions));

  app.use(express.json()); // Parse JSON bodies
  app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

  // Request logging in development
  if (serverConfig.isDevelopment) {
    app.use(morgan('dev'));
  }

  // Serve static files from public directory (images, etc.)
  app.use('/public', express.static(path.join(__dirname, '..', 'public')));

  // API routes (must come before static file serving to avoid conflicts)
  app.use('/api', apiRoutes);

  // Prefer the Docker build output; fall back to the local Vite build.
  const distWebPath = path.join(__dirname, '..', 'dist', 'web');
  const devWebPath = path.join(__dirname, '..', 'web', 'dist');
  const webDistPath = existsSync(path.join(distWebPath, 'index.html'))
    ? distWebPath
    : devWebPath;
  app.use(express.static(webDistPath));

  // SPA fallback route (must come after API routes)
  // This handles client-side routing - any non-API route serves index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(webDistPath, 'index.html'));
  });

  // Error handler
  app.use((err, req, res, _next) => {
    logger.error('Express error handler', {
      error: err.message,
      stack: err.stack,
      path: req.path,
    });

    res.status(err.status || 500).json({
      success: false,
      error: serverConfig.isDevelopment ? err.message : 'Internal Server Error',
    });
  });

  return app;
}

export default createApp;
