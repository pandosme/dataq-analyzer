/**
 * WebSocket Video Handlers
 * Handles video streaming requests via WebSocket
 */

import logger from '../utils/logger.js';
import { getVideoClip } from '../services/videoService.js';

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
    const { serial, timestamp, preTime, postTime, age, format = 'mp4', apiKey } = message;

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
      hasApiKeyOverride: !!apiKey,
      connectionId,
    });

    // Get video clip from recording server
    // apiKey override: frontend may supply a key (e.g. from .env during dev)
    // before the system config has been persisted to the DB.
    const { metadata, stream } = await getVideoClip(serial, new Date(timestamp), {
      preTime,
      postTime,
      age,
      apiKey,
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

    sendError(ws, error.message, errorCode);
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
function sendError(ws, message, code = 'ERROR') {
  if (ws.readyState === 1) {
    ws.send(
      JSON.stringify({
        type: 'error',
        message,
        code,
      })
    );
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
