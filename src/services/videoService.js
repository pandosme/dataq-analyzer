/**
 * Video Service - Retrieves recorded clips from the configured media server.
 */

import axios from 'axios';
import { spawn } from 'child_process';
import { readFile, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import logger from '../utils/logger.js';
import { getSystemConfig } from './configService.js';
import { getCameraBySerialNumber } from './cameraService.js';
import { buildMediaMtxPlaybackUrl } from './mediaMtxService.js';

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
      hasCredentials: !!(config.playback?.username && config.playback?.password),
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

    if (config.playback.type === 'VideoX') {
      return await getVideoFromVideoX(camera, startTime, endTime, config.playback);
    }

    return await getVideoFromMediaMtx(camera, startTime, endTime, config.playback);
  } catch (error) {
    logger.error('Failed to get video clip', {
      error: error.message,
      serialNumber,
      timestamp,
    });
    throw error;
  }
}

async function getVideoFromVideoX(camera, startTime, endTime, playbackConfig) {
  try {
    const duration = Math.floor((endTime - startTime) / 1000);
    const startTimeEpoch = Math.floor(startTime.getTime() / 1000);
    // Camera Vault addresses cameras by slug or name, case-insensitively — it
    // has no notion of a serial number. This is the same identifier the
    // MediaMTX path already uses, so recordingName stays the one place to fix
    // a camera whose name differs between the two systems.
    const cameraId = camera.recordingName || String(camera.name || '').toLowerCase();
    if (!cameraId) {
      throw new Error(`Camera ${camera.serialNumber} has no name or recordingName to address it by`);
    }
    const baseUrl = playbackConfig.serverUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/api/recordings/export-clip`;
    const response = await axios({
      method: 'GET',
      url,
      headers: { Authorization: `Bearer ${playbackConfig.apiKey}` },
      params: {
        cameraId,
        startTime: startTimeEpoch,
        duration,
        token: playbackConfig.apiKey,
      },
      responseType: 'stream',
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const contentType = response.headers['content-type'] || '';
    if (!contentType.startsWith('video/')) {
      response.data.destroy();
      throw new Error(`VideoX returned unexpected content-type: ${contentType}`);
    }

    const chunks = [];
    for await (const chunk of response.data) chunks.push(chunk);
    const inputFile = join(tmpdir(), `videox-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
    const outputFile = join(tmpdir(), `videox-frag-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
    await writeFile(inputFile, Buffer.concat(chunks));

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputFile,
        '-c', 'copy',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        '-y',
        outputFile,
      ]);
      ffmpeg.on('error', reject);
      ffmpeg.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
    });

    const output = await readFile(outputFile);
    await Promise.all([unlink(inputFile).catch(() => {}), unlink(outputFile).catch(() => {})]);
    return {
      metadata: {
        duration,
        width: 1920,
        height: 1080,
        fps: 25,
        codec: 'h264',
        mimeType: 'video/mp4; codecs="avc1.640029"',
      },
      stream: Readable.from(output),
    };
  } catch (error) {
    logger.error('Failed to fetch video from VideoX', {
      error: error.message,
      serialNumber: camera.serialNumber,
      status: error.response?.status,
    });
    if (error.response?.status === 404) throw new Error('VIDEO_NOT_FOUND');
    if (error.response?.status >= 500) throw new Error('RECORDING_SERVER_ERROR');
    if ([401, 403].includes(error.response?.status)) throw new Error('AUTHENTICATION_FAILED');
    if (error.code === 'ECONNREFUSED') throw new Error('RECORDING_SERVER_UNREACHABLE');
    if (error.code === 'ETIMEDOUT') throw new Error('REQUEST_TIMEOUT');
    throw error;
  }
}

/**
 * Get video clip from a MediaMTX recording server.
 * @param {Object} camera - Camera document
 * @param {Date} startTime - Clip start time
 * @param {Date} endTime - Clip end time
 * @param {Object} playbackConfig - Playback configuration
 * @returns {Promise<Object>} Video metadata and stream
 */
async function getVideoFromMediaMtx(camera, startTime, endTime, playbackConfig) {
  try {
    const duration = (endTime - startTime) / 1000;
    const recordingName = camera.recordingName || camera.name;
    if (!recordingName) {
      throw new Error(`Camera ${camera.serialNumber} has no MediaMTX recording name`);
    }

    const url = buildMediaMtxPlaybackUrl(playbackConfig.serverUrl, recordingName, startTime, duration);

    logger.debug('Requesting video from MediaMTX', {
      recordingName,
      startTime: startTime.toISOString(),
      duration,
      url,
    });

    const response = await axios({
      method: 'GET',
      url,
      auth: { username: playbackConfig.username, password: playbackConfig.password },
      responseType: 'stream',
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    // Metadata is estimated from request parameters
    const metadata = {
      duration: duration,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: 'h264',
      mimeType: 'video/mp4; codecs="avc1.640029"',
    };

    logger.info('MediaMTX clip retrieved successfully', {
      serialNumber: camera.serialNumber,
      duration,
      contentType: response.headers['content-type'],
    });

    const contentType = response.headers['content-type'] || '';
    if (!contentType.startsWith('video/')) {
      response.data.destroy();
      logger.error('MediaMTX returned non-video content type', {
        serialNumber: camera.serialNumber,
        contentType,
        url,
      });
      throw new Error(`MediaMTX returned unexpected content-type: ${contentType}. Check the playback URL and credentials.`);
    }

    return {
      metadata,
      stream: response.data,
    };
  } catch (error) {
    logger.error('Failed to fetch video from MediaMTX', {
      error: error.message,
      serialNumber: camera.serialNumber,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    if (error.response) {
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

    throw new Error(`Failed to fetch video from MediaMTX: ${error.message}`);
  }
}

export default {
  getVideoClip,
};
