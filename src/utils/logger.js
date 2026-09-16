/**
 * Simple logger utility for consistent logging across the application
 */

const levels = {
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DEBUG',
};

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] ${level}: ${message}${metaStr}`;
}

export const logger = {
  error: (message, meta) => console.error(formatMessage(levels.error, message, meta)),
  warn: (message, meta) => console.warn(formatMessage(levels.warn, message, meta)),
  info: (message, meta) => console.log(formatMessage(levels.info, message, meta)),
  debug: (message, meta) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(formatMessage(levels.debug, message, meta));
    }
  },
};

export default logger;
