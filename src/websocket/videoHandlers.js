/**
 * WebSocket Video Handlers
 * Handles video streaming requests via WebSocket
 */

import logger from '../utils/logger.js';
import { getVideoClip } from '../services/videoService.js';
import { getCameraBySerialNumber } from '../services/cameraService.js';

// Track active video streams per connection
const activeStreams = new Map();

/**
 * Handle incoming video WebSocket messages
 * @param {WebSocket} ws - WebSocket connection
 * @param {Buffer} data - Message data
 * @param {string} connectionId - Connection identifier
 */
export async function handleVideoMessage(ws, data, connectionId) {
  try {
    const message = JSON.parse(data.toString());

    logger.debug('Video WebSocket message received', {
      type: message.type,
      connectionId,
    });

    switch (message.type) {
      case 'request_video':
        await handleRequestVideo(ws, message, connectionId);
        break;
      case 'close_video':
        handleCloseVideo(connectionId);
        break;
      case 'ping':
        handlePing(ws);
        break;
      default:
        sendError(ws, `Unknown message type: ${message.type}`, 'INVALID_MESSAGE_TYPE');
    }
  } catch (error) {
    logger.error('Error handling video WebSocket message', {
      error: error.message,
      connectionId,
    });
    sendError(ws, 'Invalid message format', 'INVALID_JSON');
  }
}

/**
 * Handle request_video message
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Request message
 * @param {string} connectionId - Connection identifier
 */
async function handleRequestVideo(ws, message, connectionId) {
  try {
    const { serial, timestamp, preTime, postTime, age, format = 'mp4' } = message;

    // Validate required fields
    if (!serial || !timestamp) {
      sendError(ws, 'Missing required fields: serial and timestamp', 'INVALID_REQUEST');
      return;
    }

    // Close any existing stream for this connection
    if (activeStreams.has(connectionId)) {
      handleCloseVideo(connectionId);
    }

    logger.info('Processing video request', {
      serial,
      timestamp,
      preTime,
      postTime,
      age,
      format,
      connectionId,
    });

    const { metadata, stream } = await getVideoClip(serial, new Date(timestamp), {
      preTime,
      postTime,
      age,
    });

    // Store stream reference for cleanup
    activeStreams.set(connectionId, { stream, serial, timestamp });

    // Send metadata first
    ws.send(
      JSON.stringify({
        type: 'video_metadata',
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        codec: metadata.codec,
        mimeType: metadata.mimeType,
      })
    );

    logger.debug('Sent video metadata', { connectionId, metadata });

    // Stream video chunks
    let chunkCount = 0;
    stream.on('data', (chunk) => {
      if (ws.readyState === 1) {
        // OPEN
        ws.send(chunk);
        chunkCount++;
      } else {
        // Connection closed, destroy stream
        stream.destroy();
        activeStreams.delete(connectionId);
      }
    });

    stream.on('end', () => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'video_complete' }));
        logger.info('Video streaming completed', { connectionId, chunkCount });
      }
      activeStreams.delete(connectionId);
    });

    stream.on('error', (error) => {
      logger.error('Video stream error', {
        error: error.message,
        connectionId,
      });
      sendError(ws, 'Video streaming error', 'STREAM_ERROR');
      activeStreams.delete(connectionId);
    });
  } catch (error) {
    logger.error('Failed to process video request', {
      error: error.message,
      serial: message.serial,
      connectionId,
    });

    // Map service errors to client error codes
    let errorCode = 'UNKNOWN_ERROR';
    if (error.message === 'VIDEO_NOT_FOUND') {
      errorCode = 'VIDEO_NOT_FOUND';
    } else if (error.message === 'RECORDING_SERVER_ERROR') {
      errorCode = 'RECORDING_SERVER_ERROR';
    } else if (error.message.includes('not found')) {
      errorCode = 'CAMERA_NOT_FOUND';
    } else if (error.message.includes('not enabled')) {
      errorCode = 'PLAYBACK_DISABLED';
    }

    // Only a genuinely missing recording gets the snapshot — a server error or
    // a misconfiguration must stay visible as a fault, not be papered over with
    // a still image that looks like a normal result.
    const extra = errorCode === 'VIDEO_NOT_FOUND'
      ? { snapshot: await snapshotFallback(message?.serial) }
      : {};

    sendError(ws, error.message, errorCode, extra);
  }
}

/**
 * Handle close_video message
 * @param {string} connectionId - Connection identifier
 */
function handleCloseVideo(connectionId) {
  const activeStream = activeStreams.get(connectionId);
  if (activeStream) {
    logger.debug('Closing video stream', { connectionId });
    activeStream.stream.destroy();
    activeStreams.delete(connectionId);
  }
}

/**
 * Handle ping message
 * @param {WebSocket} ws - WebSocket connection
 */
function handlePing(ws) {
  ws.send(JSON.stringify({ type: 'pong' }));
}

/**
 * Send error message to client
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} message - Error message
 * @param {string} code - Error code
 */
function sendError(ws, message, code = 'ERROR', extra = {}) {
  if (ws.readyState === 1) {
    ws.send(
      JSON.stringify({
        type: 'error',
        message,
        code,
        ...extra,
      })
    );
  }
}

/**
 * Last known view of a camera, used when a moment has no recorded footage.
 * Retention having passed or the recorder having been down is normal, and the
 * stored snapshot gives the event visual context that an error box does not.
 * @param {string} serial - Camera serial number
 * @returns {Promise<Object|null>} Snapshot payload, or null when unavailable
 */
async function snapshotFallback(serial) {
  if (!serial) return null;
  try {
    const camera = await getCameraBySerialNumber(serial);
    if (!camera || !camera.latestSnapshot) return null;
    return {
      image: camera.latestSnapshot,
      timestamp: camera.latestSnapshotTimestamp || null,
      cameraName: camera.name || '',
    };
  } catch (error) {
    // The fallback must never replace the real error with one of its own.
    logger.warn('Could not load snapshot fallback', { serial, error: error.message });
    return null;
  }
}

/**
 * Cleanup video stream on connection close
 * @param {string} connectionId - Connection identifier
 */
export function cleanupVideoConnection(connectionId) {
  handleCloseVideo(connectionId);
  logger.debug('Video connection cleaned up', { connectionId });
}

export default {
  handleVideoMessage,
  cleanupVideoConnection,
};
