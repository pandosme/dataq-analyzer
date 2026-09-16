import logger from '../utils/logger.js';

/**
 * Parses a DataQ MQTT message payload
 * Stores the message as-is without transforming property names
 *
 * @param {string|Buffer} payload - Raw MQTT message payload
 * @param {string} topic - MQTT topic the message was received on
 * @returns {Object|null} - Parsed message object or null if invalid
 */
export function parseDataQMessage(payload, topic) {
  try {
    // Parse JSON payload
    const data = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString());

    // Validate that it's a valid JSON object
    if (!data || typeof data !== 'object') {
      logger.warn('DataQ message is not a valid object', { topic });
      return null;
    }

    // Return the data as-is without transformation
    // MongoDB will store it with original property names
    return data;
  } catch (error) {
    logger.error('Failed to parse DataQ message', {
      error: error.message,
      topic,
      payload: payload.toString().substring(0, 200),
    });
    return null;
  }
}

/**
 * Validates if a message is a DataQ path data message
 * @param {Object} data - Parsed JSON data
 * @returns {boolean}
 */
export function isPathDataMessage(data) {
  // Path data messages typically have a path array and complete object lifecycle info
  return data && typeof data === 'object' && Array.isArray(data.path) && data.path.length > 0;
}

/**
 * Extracts the camera serial number from an MQTT topic
 * Example: dataq/B8A44FF11A35/path -> B8A44FF11A35
 *
 * @param {string} topic - MQTT topic
 * @returns {string|null} - Extracted serial number or null
 */
export function extractSerialNumberFromTopic(topic) {
  if (!topic) return null;

  // Expected format: dataq/<serialNumber>/<dataType>
  const parts = topic.split('/');
  if (parts.length >= 2) {
    return parts[1].toUpperCase();
  }

  return null;
}

export default {
  parseDataQMessage,
  isPathDataMessage,
  extractSerialNumberFromTopic,
};
