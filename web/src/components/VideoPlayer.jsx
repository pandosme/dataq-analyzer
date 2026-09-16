import { useRef, useState, useEffect } from 'react';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { formatDateTime } from '../utils/dateFormat';
import './VideoPlayer.css';

function VideoPlayer({ videoInfo, onClose }) {
  const { dateFormat, timeFormat } = useUserPreferences();
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (videoRef.current) {
      // Auto-play when video loads
      videoRef.current.play().catch((err) => {
        console.error('Auto-play failed:', err);
        setIsPlaying(false);
      });
    }
  }, [videoInfo]);

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handleReplay = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleDownload = () => {
    const downloadUrl = videoInfo.url.replace('type=stream', 'type=file');

    // Create a temporary anchor element to trigger download
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `path_${videoInfo.startTime}.mp4`;

    // Add authorization header by fetching with fetch API
    fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${videoInfo.apiKey}`,
      },
    })
      .then((response) => response.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err) => {
        console.error('Download failed:', err);
        setError('Failed to download video');
      });
  };

  const handleError = (e) => {
    console.error('Video playback error:', e);
    setError('Failed to load video. Check VideoX connection and ensure recording exists for this time range.');
  };

  if (!videoInfo) {
    return null;
  }

  return (
    <div className="video-player-overlay" onClick={onClose}>
      <div className="video-player-modal" onClick={(e) => e.stopPropagation()}>
        <div className="video-player-header">
          <h3>Video Playback</h3>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="video-player-content">
          {error && <div className="video-error">{error}</div>}

          <video
            ref={videoRef}
            className="video-element"
            controls
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onError={handleError}
          >
            <source
              src={videoInfo.url}
              type="video/mp4"
            />
            Your browser does not support the video tag.
          </video>

          <div className="video-controls">
            <button className="video-btn" onClick={handlePlayPause}>
              {isPlaying ? '⏸️ Pause' : '▶️ Play'}
            </button>
            <button className="video-btn" onClick={handleReplay}>
              🔄 Replay
            </button>
            <button className="video-btn" onClick={handleDownload}>
              💾 Download
            </button>
          </div>

          <div className="video-info">
            <p><strong>Duration:</strong> {videoInfo.duration} seconds</p>
            <p><strong>Start Time:</strong> {formatDateTime(new Date(videoInfo.startTime * 1000), dateFormat, timeFormat)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoPlayer;
