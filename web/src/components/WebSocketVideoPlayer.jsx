import { useEffect, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../context/AuthContext';
import './WebSocketVideoPlayer.css';

/**
 * WebSocket Video Player
 *
 * Streams video from the backend via WebSocket.
 * The backend proxies video from the recording server (VideoX, Milestone, etc.)
 * so the frontend doesn't need direct access to the recording server.
 *
 * Video timing:
 * - timestamp: when object FIRST APPEARED (entry time)
 * - Start: timestamp - preTime (show before object appeared)
 * - End: timestamp + age + postTime (show until after object disappeared)
 * - Duration: preTime + age + postTime
 */
function WebSocketVideoPlayer({ serial, timestamp, preTime, postTime, age, onError, onClose, onVideoReady }) {
  const { token, server } = useAuth();
  const videoRef = useRef(null);
  const wsRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const chunksRef = useRef([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState(null);

  // Initialize MediaSource - moved outside useEffect to be accessible
  const initializeMediaSource = (mimeType) => {
    if (!videoRef.current) {
      console.error('WebSocketVideoPlayer: videoRef is null, cannot initialize MediaSource');
      return;
    }

    // Don't re-initialize if already initializing/initialized
    if (mediaSourceRef.current) {
      if (import.meta.env.DEV) {
        console.log('WebSocketVideoPlayer: MediaSource already exists, skipping initialization');
      }
      return;
    }

    if (import.meta.env.DEV) {
      console.log('WebSocketVideoPlayer: Creating MediaSource for', mimeType);
    }

    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;
    videoRef.current.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener('sourceopen', () => {
      try {
        if (import.meta.env.DEV) {
          console.log('WebSocketVideoPlayer: MediaSource sourceopen event fired');
        }

        const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        sourceBufferRef.current = sourceBuffer;

        sourceBuffer.addEventListener('updateend', () => {
          // Process next chunk in queue
          processChunkQueue();
        });

        if (import.meta.env.DEV) {
          console.log('WebSocketVideoPlayer: MediaSource initialized with', mimeType);
          console.log('WebSocketVideoPlayer: Processing', chunksRef.current.length, 'queued chunks');
        }

        // Start processing any chunks that arrived before MediaSource was ready
        processChunkQueue();

        // Auto-play when video has enough data
        if (videoRef.current) {
          const tryPlay = () => {
            if (videoRef.current) {
              videoRef.current.play().catch(e => {
                if (import.meta.env.DEV) {
                  console.log('WebSocketVideoPlayer: Autoplay blocked:', e.message);
                }
              });
            }
          };

          // Try to play when we have enough data
          videoRef.current.addEventListener('canplay', tryPlay, { once: true });
        }

        setLoading(false);
      } catch (e) {
        console.error('Failed to create SourceBuffer:', e);
        setError('Video format not supported');
        if (onError) onError('Video format not supported');
      }
    });

    mediaSource.addEventListener('sourceerror', (e) => {
      console.error('WebSocketVideoPlayer: MediaSource error event', {
        type: e?.type,
        target: e?.target?.readyState,
        message: e?.message
      });
    });

    mediaSource.addEventListener('sourceclose', () => {
      if (import.meta.env.DEV) {
        console.log('WebSocketVideoPlayer: MediaSource closed');
      }
    });

    if (import.meta.env.DEV) {
      console.log('WebSocketVideoPlayer: MediaSource created, readyState:', mediaSource.readyState);
    }
  };

  const processChunkQueue = () => {
    // Process all queued chunks
    if (!sourceBufferRef.current || sourceBufferRef.current.updating) {
      return;
    }

    if (chunksRef.current.length > 0) {
      const chunk = chunksRef.current.shift();
      try {
        sourceBufferRef.current.appendBuffer(chunk);
      } catch (e) {
        console.error('Failed to append buffer:', e);
        // Re-queue on error
        chunksRef.current.unshift(chunk);
      }
    } else if (chunksRef.current.complete) {
      // No more chunks and we're complete, end the stream
      tryEndStream();
    }
  };

  const tryEndStream = () => {
    // Only end stream if all chunks are processed and video is complete
    const canEnd = chunksRef.current.complete &&
                   chunksRef.current.length === 0 &&
                   sourceBufferRef.current &&
                   !sourceBufferRef.current.updating &&
                   mediaSourceRef.current?.readyState === 'open';

    if (import.meta.env.DEV) {
      console.log('WebSocketVideoPlayer: tryEndStream check:', {
        complete: chunksRef.current.complete,
        queueLength: chunksRef.current.length,
        hasSourceBuffer: !!sourceBufferRef.current,
        updating: sourceBufferRef.current?.updating,
        mediaSourceState: mediaSourceRef.current?.readyState,
        canEnd
      });
    }

    if (canEnd) {
      try {
        mediaSourceRef.current.endOfStream();
        if (import.meta.env.DEV) {
          console.log('WebSocketVideoPlayer: Stream ended successfully');
        }
      } catch (e) {
        console.error('Failed to end stream:', e);
      }
    }
  };

  // Use callback ref to store video element reference
  // NOTE: No dependencies - this callback should remain stable
  const videoCallbackRef = useCallback((node) => {
    if (import.meta.env.DEV) {
      console.log('WebSocketVideoPlayer: videoCallbackRef called, node:', !!node);
    }

    if (node) {
      videoRef.current = node;
      if (import.meta.env.DEV) {
        console.log('WebSocketVideoPlayer: Video element ref set');
      }

      // Set initial playback position when metadata is loaded
      // The video clip includes preTime seconds before the event, so we need to
      // start playback at the preTime offset to show the event at the beginning
      const handleLoadedMetadata = () => {
        if (preTime && videoRef.current) {
          videoRef.current.currentTime = preTime;
          if (import.meta.env.DEV) {
            console.log('WebSocketVideoPlayer: Set initial playback position to', preTime, 'seconds');
          }
        }
        // Notify parent of video dimensions for overlay alignment
        if (onVideoReady && videoRef.current) {
          const video = videoRef.current;
          // Calculate rendered video size accounting for object-fit: contain
          const containerWidth = video.clientWidth;
          const containerHeight = video.clientHeight;
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;

          if (videoWidth && videoHeight) {
            const containerRatio = containerWidth / containerHeight;
            const videoRatio = videoWidth / videoHeight;

            let renderedWidth, renderedHeight;
            if (videoRatio > containerRatio) {
              // Video is wider - fit to width
              renderedWidth = containerWidth;
              renderedHeight = containerWidth / videoRatio;
            } else {
              // Video is taller - fit to height
              renderedHeight = containerHeight;
              renderedWidth = containerHeight * videoRatio;
            }

            onVideoReady({
              width: renderedWidth,
              height: renderedHeight,
              videoWidth,
              videoHeight
            });
          }
        }
      };

      node.addEventListener('loadedmetadata', handleLoadedMetadata);

      // Clean up event listener when node changes
      return () => {
        node.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    } else {
      // Node is being detached
      if (import.meta.env.DEV) {
        console.log('WebSocketVideoPlayer: Video element ref cleared');
      }
      videoRef.current = null;
    }
  }, [preTime, onVideoReady]); // Include preTime and onVideoReady in dependencies

  // Initialize MediaSource when metadata arrives (if video element already attached)
  useEffect(() => {
    if (metadata && videoRef.current && !mediaSourceRef.current) {
      if (import.meta.env.DEV) {
        console.log('WebSocketVideoPlayer: Metadata received, video element ready, initializing MediaSource');
      }
      initializeMediaSource(metadata.mimeType);
    }
  }, [metadata]);

  useEffect(() => {
    if (!serial || !timestamp || !token || !server) {
      setError('Missing required parameters');
      return;
    }

    if (import.meta.env.DEV) {
      console.log('WebSocketVideoPlayer: useEffect running, videoRef.current:', !!videoRef.current);
    }

    let ws = null;

    const connect = () => {
      // Convert HTTP/HTTPS to WS/WSS
      // Handle empty/relative URLs (for nginx proxy setup)
      let wsUrl;
      if (!server.url || server.url === '') {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        wsUrl = `${wsProtocol}://${window.location.host}/ws/video?token=${token}`;
      } else {
        // Normalize URL to ensure it has a protocol before converting to WebSocket URL
        let normalizedUrl = server.url;
        if (!normalizedUrl.match(/^https?:\/\//i)) {
          normalizedUrl = `http://${normalizedUrl}`;
        }
        wsUrl = normalizedUrl.replace(/^http/, 'ws') + `/ws/video?token=${token}`;
      }

      if (import.meta.env.DEV) {
        console.log('WebSocketVideoPlayer: Connecting to', wsUrl);
      }

      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        if (import.meta.env.DEV) {
          console.log('WebSocketVideoPlayer: Connected');
        }

        // Request video stream
        const request = {
          type: 'request_video',
          serial,
          timestamp,
          format: 'mp4'
        };

        // Include timing parameters if provided (otherwise backend uses defaults)
        // IMPORTANT: timestamp = when object FIRST APPEARED (entry time)
        // Object timeline: entered at timestamp, exited at (timestamp + age)
        // Video should span: [timestamp - preTime] to [timestamp + age + postTime]
        if (preTime !== undefined) request.preTime = preTime;
        if (postTime !== undefined) request.postTime = postTime;
        if (age !== undefined) request.age = age;

        // Pass API key to backend so it can authenticate with the recording server.
        // Sourced from VITE_API_KEY env var (temporary until backend serves it via system config).
        const envApiKey = import.meta.env.VITE_API_KEY;
        if (envApiKey) request.apiKey = envApiKey;

        if (import.meta.env.DEV) {
          console.log('WebSocketVideoPlayer: Requesting video with timing:', {
            timestamp,
            preTime,
            age,
            postTime,
            calculatedDuration: (preTime || 0) + (age || 0) + (postTime || 0)
          });
        }

        ws.send(JSON.stringify(request));
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          // JSON message
          const message = JSON.parse(event.data);
          handleJsonMessage(message);
        } else {
          // Binary video chunk
          handleVideoChunk(event.data);
        }
      };

      ws.onerror = (err) => {
        if (import.meta.env.DEV) {
          console.error('WebSocketVideoPlayer: WebSocket error', {
            type: err?.type,
            message: err?.message,
            target: err?.target?.readyState
          });
        }
        setError('Connection error');
        setLoading(false);
        if (onError) onError('Connection error');
      };

      ws.onclose = () => {
        if (import.meta.env.DEV) {
          console.log('WebSocketVideoPlayer: Disconnected');
        }
        cleanup();
        // If we closed while still loading (no metadata/error received), surface an error
        setLoading(prev => {
          if (prev) {
            setError('Video stream closed before data was received');
            if (onError) onError('Video stream closed before data was received');
          }
          return false;
        });
      };
    };

    const handleJsonMessage = (message) => {
      if (import.meta.env.DEV) {
        console.log('WebSocketVideoPlayer: Received message', message.type);
      }

      switch (message.type) {
        case 'connected':
          // Connection confirmation
          if (import.meta.env.DEV) {
            console.log('WebSocketVideoPlayer: Connection confirmed');
          }
          break;

        case 'video_metadata':
          if (import.meta.env.DEV) {
            console.log('WebSocketVideoPlayer: Received metadata:', {
              mimeType: message.mimeType,
              duration: message.duration,
              width: message.width,
              height: message.height,
              fps: message.fps
            });
          }
          // Set metadata - this will trigger the useEffect that initializes MediaSource
          setMetadata(message);
          break;

        case 'video_complete':
          if (import.meta.env.DEV) {
            console.log('WebSocketVideoPlayer: Video complete, chunks queued:', chunksRef.current.length);
          }
          setLoading(false);
          // Mark that we're done receiving chunks
          chunksRef.current.complete = true;
          // Try to end stream if all chunks are processed
          tryEndStream();
          break;

        case 'error':
          console.error('WebSocketVideoPlayer: Server error', message.message);
          setError(message.message || 'Video not available');
          setLoading(false);
          if (onError) onError(message.message);
          break;

        case 'pong':
          // Keep-alive response
          break;

        default:
          if (import.meta.env.DEV) {
            console.warn('WebSocketVideoPlayer: Unknown message type', message.type);
          }
      }
    };

    const handleVideoChunk = (arrayBuffer) => {
      // Always queue chunks - processChunkQueue will handle them
      chunksRef.current.push(arrayBuffer);

      // If SourceBuffer is ready and not updating, start processing
      if (sourceBufferRef.current && !sourceBufferRef.current.updating) {
        processChunkQueue();
      }
    };

    const cleanup = () => {
      if (import.meta.env.DEV) {
        console.log('WebSocketVideoPlayer: Cleaning up, MediaSource state:', mediaSourceRef.current?.readyState);
      }

      if (sourceBufferRef.current) {
        try {
          if (!sourceBufferRef.current.updating) {
            sourceBufferRef.current.abort();
          }
        } catch (e) {
          if (import.meta.env.DEV) {
            console.warn('Failed to abort source buffer:', e);
          }
        }
        sourceBufferRef.current = null;
      }

      if (mediaSourceRef.current) {
        try {
          if (mediaSourceRef.current.readyState === 'open') {
            mediaSourceRef.current.endOfStream();
          }
        } catch (e) {
          if (import.meta.env.DEV) {
            console.warn('Failed to end stream:', e);
          }
        }
      }

      // Revoke object URL to prevent memory leaks
      if (videoRef.current?.src) {
        try {
          URL.revokeObjectURL(videoRef.current.src);
        } catch (e) {
          // Ignore errors revoking URL
        }
      }

      mediaSourceRef.current = null;

      // Reset chunk queue
      chunksRef.current.length = 0;
      chunksRef.current.complete = false;
    };

    connect();

    // Ping interval to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      if (ws) {
        ws.close();
      }
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial, timestamp, preTime, postTime, age, token, server?.url]);

  if (error) {
    return (
      <div className="ws-video-player error">
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => onClose && onClose()}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ws-video-player">
      {loading && (
        <div className="video-loading">
          <div className="spinner"></div>
          <p>Loading video...</p>
        </div>
      )}
      <video
        ref={videoCallbackRef}
        className="video-element"
        controls
        autoPlay
        muted
        playsInline
        style={{ display: loading ? 'none' : 'block' }}
      />
      {metadata && !loading && (
        <div className="video-info">
          <span>{metadata.width}x{metadata.height}</span>
          <span>{metadata.fps} fps</span>
          <span>{metadata.duration.toFixed(1)}s</span>
        </div>
      )}
    </div>
  );
}

WebSocketVideoPlayer.propTypes = {
  serial: PropTypes.string.isRequired,
  timestamp: PropTypes.string.isRequired,
  preTime: PropTypes.number,
  postTime: PropTypes.number,
  age: PropTypes.number,
  onError: PropTypes.func,
  onClose: PropTypes.func,
  onVideoReady: PropTypes.func,
};

export default WebSocketVideoPlayer;
