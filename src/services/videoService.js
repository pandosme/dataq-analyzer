/**
 * Video Service - Interface with recording servers (VideoX, Milestone, ACS)
 * Abstracts video retrieval from various VMS platforms
 */

import axios from 'axios';
import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import logger from '../utils/logger.js';
import { getSystemConfig } from './configService.js';
import { getCameraBySerialNumber } from './cameraService.js';

/**
 * Get video clip from recording server
 * @param {string} serialNumber - Camera serial number
 * @param {Date} timestamp - Event timestamp
 * @param {Object} options - Optional override for preTime/postTime
 * @returns {Promise<AsyncIterator<Buffer>>} Async iterator for video chunks
 */
export async function getVideoClip(serialNumber, timestamp, options = {}) {
  try {
    // Get system configuration
    const config = await getSystemConfig();

    logger.debug('Loaded playback configuration', {
      enabled: config.playback?.enabled,
      type: config.playback?.type,
      serverUrl: config.playback?.serverUrl,
      hasApiKey: !!config.playback?.apiKey,
      preTime: config.playback?.preTime,
      postTime: config.playback?.postTime,
    });

    if (!config.playback || !config.playback.enabled) {
      logger.error('Video playback is not enabled', {
        playbackExists: !!config.playback,
        playbackEnabled: config.playback?.enabled,
      });
      throw new Error('Video playback is not enabled in system configuration');
    }

    // Get camera details
    const camera = await getCameraBySerialNumber(serialNumber);
    if (!camera) {
      throw new Error(`Camera not found: ${serialNumber}`);
    }

    // Use provided pre/post time or defaults from config
    const preTime = options.preTime ?? config.playback.preTime;
    const postTime = options.postTime ?? config.playback.postTime;
    const age = options.age ?? 0; // Object age (how long it was in scene)

    // Allow caller to override the API key (e.g. from frontend .env during dev)
    if (options.apiKey) {
      config.playback.apiKey = options.apiKey;
    }

    // Calculate time range:
    // IMPORTANT: timestamp represents when the object FIRST APPEARED (entry time)
    // - Object entry time = timestamp
    // - Object exit time = timestamp + age
    // - startTime = timestamp - preTime
    // - endTime = timestamp + age + postTime
    // - duration = preTime + age + postTime
    const startTime = new Date(new Date(timestamp).getTime() - preTime * 1000);
    const endTime = new Date(new Date(timestamp).getTime() + (age + postTime) * 1000);

    logger.info('Fetching video clip', {
      serialNumber,
      timestamp,
      startTime,
      endTime,
      preTime,
      postTime,
      age,
      duration: (endTime - startTime) / 1000,
      serverType: config.playback.type,
    });

    // Route to appropriate recording server
    switch (config.playback.type) {
      case 'VideoX':
        return await getVideoFromVideoX(camera, startTime, endTime, config.playback);
      case 'Milestone':
        return await getVideoFromMilestone(camera, startTime, endTime, config.playback);
      case 'ACS':
        return await getVideoFromACS(camera, startTime, endTime, config.playback);
      default:
        throw new Error(`Unsupported playback server type: ${config.playback.type}`);
    }
  } catch (error) {
    logger.error('Failed to get video clip', {
      error: error.message,
      serialNumber,
      timestamp,
    });
    throw error;
  }
}

/**
 * Get video clip from VideoX server
 * @param {Object} camera - Camera document
 * @param {Date} startTime - Clip start time
 * @param {Date} endTime - Clip end time
 * @param {Object} playbackConfig - Playback configuration
 * @returns {Promise<Object>} Video metadata and stream
 */
async function getVideoFromVideoX(camera, startTime, endTime, playbackConfig) {
  try {
    // Calculate duration in seconds
    const duration = Math.floor((endTime - startTime) / 1000);

    // Convert startTime to epoch seconds
    const startTimeEpoch = Math.floor(startTime.getTime() / 1000);

    // VideoX API: GET /api/recordings/export-clip
    // Strip trailing slash from serverUrl to avoid double-slash in path
    const baseUrl = playbackConfig.serverUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/api/recordings/export-clip`;

    logger.debug('Requesting video from VideoX', {
      cameraId: camera.serialNumber,
      startTime: startTime.toISOString(),
      startTimeEpoch,
      duration,
      url,
    });

    const response = await axios({
      method: 'GET',
      url,
      headers: {
        'Authorization': `Bearer ${playbackConfig.apiKey}`,
      },
      params: {
        cameraId: camera.serialNumber,
        startTime: startTimeEpoch,
        duration: duration,
        token: playbackConfig.apiKey, // Also pass as query param for compatibility
      },
      responseType: 'stream',
      timeout: 60000, // Increased timeout for video processing
      maxContentLength: Infinity, // Allow unlimited content length
      maxBodyLength: Infinity,    // Allow unlimited body length
    });

    // VideoX returns video/mp4 directly
    // Metadata is estimated from request parameters
    const metadata = {
      duration: duration,
      width: 1920, // VideoX doesn't provide metadata in headers
      height: 1080,
      fps: 25,
      codec: 'h264',
      mimeType: 'video/mp4; codecs="avc1.640029"', // Fragmented MP4 with H.264 codec
    };

    logger.info('VideoX clip retrieved successfully', {
      serialNumber: camera.serialNumber,
      duration,
      contentType: response.headers['content-type'],
    });

    // Guard: VideoX must return video content. If it returns HTML/JSON
    // (e.g. because of a malformed URL or auth failure that still gives 200),
    // bail out early with a clear error rather than sending garbage to ffmpeg.
    const contentType = response.headers['content-type'] || '';
    if (!contentType.startsWith('video/')) {
      response.data.destroy();
      logger.error('VideoX returned non-video content type', {
        serialNumber: camera.serialNumber,
        contentType,
        url,
      });
      throw new Error(`VideoX returned unexpected content-type: ${contentType}. Check serverUrl and API key.`);
    }

    // Fragment the MP4 for MediaSource API compatibility
    // Regular MP4 from VideoX has moov atom at the end, which prevents
    // progressive playback in browsers. We need fragmented MP4 (fMP4).
    //
    // Strategy: Buffer the complete video, then fragment it with ffmpeg
    logger.debug('Buffering and fragmenting video for MediaSource API', {
      serialNumber: camera.serialNumber,
      duration,
    });

    // Collect all chunks into a buffer using event-based approach
    // This ensures we wait for the complete stream before processing
    const videoBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      let totalSize = 0;

      response.data.on('data', (chunk) => {
        chunks.push(chunk);
        totalSize += chunk.length;
        logger.debug('Received chunk from VideoX', {
          chunkSize: chunk.length,
          totalSize,
          serialNumber: camera.serialNumber,
        });
      });

      response.data.on('end', () => {
        logger.debug('VideoX stream ended', {
          totalChunks: chunks.length,
          totalSize,
          serialNumber: camera.serialNumber,
        });
        resolve(Buffer.concat(chunks));
      });

      response.data.on('error', (error) => {
        logger.error('VideoX stream error', {
          error: error.message,
          serialNumber: camera.serialNumber,
        });
        reject(error);
      });
    });

    logger.debug('Video buffered, starting ffmpeg fragmentation', {
      serialNumber: camera.serialNumber,
      bufferSize: videoBuffer.length,
    });

    // Write video to temporary file (ffmpeg needs to seek for moov atom at end)
    const tempInputFile = join(tmpdir(), `videox-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
    await writeFile(tempInputFile, videoBuffer);

    logger.debug('Video written to temp file, starting ffmpeg', {
      tempFile: tempInputFile,
      fileSize: videoBuffer.length,
    });

    // Fragment the buffered video with ffmpeg (reading from file)
    // Output to a second temp file to avoid the PassThrough race condition:
    // when ffmpeg pipes to pipe:1 it can finish before videoHandlers attaches
    // a 'data' listener, causing the stream end to be missed.
    const tempOutputFile = join(tmpdir(), `videox-frag-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);

    const ffmpeg = spawn('ffmpeg', [
      '-i', tempInputFile,          // Input from temp file (allows seeking)
      '-c', 'copy',                 // Copy codec (no re-encoding)
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof', // Fragment MP4
      '-f', 'mp4',                  // Output format
      '-y',                         // Overwrite output if exists
      tempOutputFile,               // Output to temp file (avoids streaming race)
    ]);

    // Wait for ffmpeg to finish completely before returning stream
    await new Promise((resolve, reject) => {
      ffmpeg.stderr.on('data', (data) => {
        logger.debug('ffmpeg stderr', { message: data.toString().trim() });
      });

      ffmpeg.on('error', (error) => {
        logger.error('ffmpeg process error', { error: error.message });
        unlink(tempInputFile).catch(() => {});
        reject(error);
      });

      ffmpeg.on('exit', (code, signal) => {
        unlink(tempInputFile).catch(() => {});
        if (code !== 0) {
          logger.warn('ffmpeg exited with non-zero code', { code, signal });
          reject(new Error(`ffmpeg exited with code ${code}`));
        } else {
          logger.debug('ffmpeg completed successfully');
          resolve();
        }
      });
    });

    // Read the fragmented file and return as a Readable stream.
    // Using Readable.from(buffer) ensures all data is ready the moment the
    // caller attaches a 'data' listener — no race condition possible.
    const { readFile } = await import('fs/promises');
    const { Readable } = await import('stream');
    const fragBuffer = await readFile(tempOutputFile);
    unlink(tempOutputFile).catch(() => {});

    logger.info('Fragmented video ready', {
      serialNumber: camera.serialNumber,
      inputSize: videoBuffer.length,
      outputSize: fragBuffer.length,
    });

    const outputStream = Readable.from(fragBuffer);

    // Return fragmented stream
    return {
      metadata,
      stream: outputStream,
    };
  } catch (error) {
    logger.error('Failed to fetch video from VideoX', {
      error: error.message,
      serialNumber: camera.serialNumber,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    if (error.response) {
      // Check for VideoX-specific error codes based on status
      if (error.response.status === 404) {
        throw new Error('VIDEO_NOT_FOUND');
      } else if (error.response.status >= 500) {
        throw new Error('RECORDING_SERVER_ERROR');
      } else if (error.response.status === 400) {
        throw new Error(`Invalid request: ${error.message}`);
      } else if (error.response.status === 401 || error.response.status === 403) {
        throw new Error('AUTHENTICATION_FAILED');
      }
    }

    // Network or timeout errors
    if (error.code === 'ECONNREFUSED') {
      throw new Error('RECORDING_SERVER_UNREACHABLE');
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error('REQUEST_TIMEOUT');
    }

    throw new Error(`Failed to fetch video from VideoX: ${error.message}`);
  }
}

/**
 * Get video clip from Milestone server
 * @param {Object} camera - Camera document
 * @param {Date} startTime - Clip start time
 * @param {Date} endTime - Clip end time
 * @param {Object} playbackConfig - Playback configuration
 * @returns {Promise<Object>} Video metadata and stream
 */
async function getVideoFromMilestone(camera, startTime, endTime, playbackConfig) {
  try {
    // Milestone XProtect API endpoint
    const url = `${playbackConfig.serverUrl}/api/rest/v1/recordings/download`;

    const response = await axios({
      method: 'GET',
      url,
      headers: {
        'Authorization': `Basic ${Buffer.from(playbackConfig.apiKey).toString('base64')}`,
      },
      params: {
        cameraId: camera.serialNumber,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        format: 'mp4',
      },
      responseType: 'stream',
      timeout: 30000,
    });

    // Milestone may provide metadata differently
    const metadata = {
      duration: (endTime - startTime) / 1000,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'h264',
      mimeType: 'video/mp4',
    };

    logger.debug('Milestone clip metadata', { serialNumber: camera.serialNumber, metadata });

    return {
      metadata,
      stream: response.data,
    };
  } catch (error) {
    logger.error('Failed to fetch video from Milestone', {
      error: error.message,
      serialNumber: camera.serialNumber,
    });

    if (error.response?.status === 404) {
      throw new Error('VIDEO_NOT_FOUND');
    } else if (error.response?.status >= 500) {
      throw new Error('RECORDING_SERVER_ERROR');
    }

    throw new Error(`Failed to fetch video from Milestone: ${error.message}`);
  }
}

/**
 * Get video clip from ACS server
 * @param {Object} camera - Camera document
 * @param {Date} startTime - Clip start time
 * @param {Date} endTime - Clip end time
 * @param {Object} playbackConfig - Playback configuration
 * @returns {Promise<Object>} Video metadata and stream
 */
async function getVideoFromACS(camera, startTime, endTime, playbackConfig) {
  try {
    const url = `${playbackConfig.serverUrl}/api/video/export`;

    const response = await axios({
      method: 'POST',
      url,
      headers: {
        'X-API-Key': playbackConfig.apiKey,
        'Content-Type': 'application/json',
      },
      data: {
        camera: camera.serialNumber,
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        format: 'mp4',
      },
      responseType: 'stream',
      timeout: 30000,
    });

    const metadata = {
      duration: (endTime - startTime) / 1000,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'h264',
      mimeType: 'video/mp4',
    };

    logger.debug('ACS clip metadata', { serialNumber: camera.serialNumber, metadata });

    return {
      metadata,
      stream: response.data,
    };
  } catch (error) {
    logger.error('Failed to fetch video from ACS', {
      error: error.message,
      serialNumber: camera.serialNumber,
    });

    if (error.response?.status === 404) {
      throw new Error('VIDEO_NOT_FOUND');
    } else if (error.response?.status >= 500) {
      throw new Error('RECORDING_SERVER_ERROR');
    }

    throw new Error(`Failed to fetch video from ACS: ${error.message}`);
  }
}

export default {
  getVideoClip,
};
