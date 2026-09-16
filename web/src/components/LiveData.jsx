import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Button, Drawer } from '@mantine/core';
import { SlidersHorizontal } from 'lucide-react';
import { camerasAPI } from '../services/api';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { useWebSocket } from '../context/WebSocketContext';
import { formatDateTime as formatDateTimeUtil } from '../utils/dateFormat';
import ThreeColumnLayout from './ThreeColumnLayout';
import './LiveData.css';

const DEFAULT_LABELS = ['Human', 'Vehicle', 'Bike', 'LicensePlate', 'Bag', 'Head', 'Animal', 'Car', 'Truck', 'Bus', 'Other'];

function LiveData({ selectedCamera, cameraDetails }) {
  const { dateFormat, timeFormat } = useUserPreferences();
  const { isConnected, connectionError, subscribe, onPathEvent } = useWebSocket();
  const [recentPaths, setRecentPaths] = useState([]);
  const [error, setError] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    objectTypes: DEFAULT_LABELS,
    minDistance: 20,
    minAge: 2,
  });
  const canvasRef = useRef(null);
  const videoContainerRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const playerRef = useRef(null);

  // Load camera filters when camera changes
  useEffect(() => {
    if (!cameraDetails) return;
    const availableLabels = cameraDetails.labels || DEFAULT_LABELS;
    setFilters({
      objectTypes: cameraDetails.filters?.objectTypes || availableLabels,
      minDistance: cameraDetails.filters?.minDistance !== undefined ? cameraDetails.filters.minDistance : 20,
      minAge: cameraDetails.filters?.minAge !== undefined ? cameraDetails.filters.minAge : 2,
    });
  }, [cameraDetails]);

  // Clear paths when camera changes
  useEffect(() => {
    setRecentPaths([]);
  }, [selectedCamera]);

  // Subscribe to WebSocket for real-time path events
  useEffect(() => {
    if (!selectedCamera) {
      return;
    }

    // Subscribe to the selected camera
    if (isConnected) {
      if (import.meta.env.DEV) {
        console.log('Subscribing to camera:', selectedCamera);
      }

      subscribe([selectedCamera], {
        classes: filters.objectTypes,
        minAge: filters.minAge,
        minDistance: filters.minDistance,
      });
    }

    // Handle incoming path events
    const unsubscribeHandler = onPathEvent((pathEvent) => {
      // Only add events for the selected camera
      if (pathEvent.serial === selectedCamera) {
        setRecentPaths((prevPaths) => {
          // Add new event to the front and keep only the last 10
          const newPaths = [pathEvent, ...prevPaths].slice(0, 10);
          return newPaths;
        });
      }
    });

    return () => {
      unsubscribeHandler();
    };
  }, [selectedCamera, filters, isConnected, subscribe, onPathEvent]);

  // Update error state based on WebSocket connection
  useEffect(() => {
    if (connectionError) {
      setError(`WebSocket error: ${connectionError}`);
    } else if (!isConnected && selectedCamera) {
      setError('Not connected to real-time feed');
    } else {
      setError(null);
    }
  }, [connectionError, isConnected, selectedCamera]);

  // Initialize video player for local cameras
  useEffect(() => {
    if (!videoContainerRef.current || !cameraDetails) return;

    // Get the video player div first
    const videoPlayerDiv = videoContainerRef.current.querySelector('.video-player-div');
    if (!videoPlayerDiv) {
      console.error('Video player div not found');
      return;
    }

    // Clean up existing player - only clear the video player div, not the entire container
    if (playerRef.current) {
      videoPlayerDiv.innerHTML = '';
      playerRef.current = null;
    }

    // Only create player for local cameras
    if (cameraDetails.cameraType !== 'local' || !cameraDetails.ipAddress) return;

    try {
      // Get aspect ratio and rotation
      const aspect = cameraDetails.snapshot?.aspectRatio || cameraDetails.aspectRatio || '16:9';
      const rotation = cameraDetails.snapshot?.rotation || cameraDetails.rotation || 0;

      let videoWidth = 1280;
      let videoHeight = 720;
      let aspectRatioValue = '16 / 9';

      switch (aspect) {
        case '4:3':
          videoWidth = 800;
          videoHeight = 600;
          aspectRatioValue = '4 / 3';
          break;
        case '1:1':
          videoWidth = 640;
          videoHeight = 640;
          aspectRatioValue = '1 / 1';
          break;
        case '16:10':
          videoWidth = 800;
          videoHeight = 500;
          aspectRatioValue = '16 / 10';
          break;
        default: // 16:9
          videoWidth = 1280;
          videoHeight = 720;
          aspectRatioValue = '16 / 9';
          break;
      }

      // Calculate container dimensions to fill available space while maintaining aspect ratio
      // Swap dimensions if rotated 90 or 270 degrees
      let containerWidth = videoWidth;
      let containerHeight = videoHeight;
      if (rotation === 90 || rotation === 270) {
        // Swap width and height for portrait orientation
        containerWidth = videoHeight;
        containerHeight = videoWidth;
      }

      // Set video-container to explicit pixel dimensions
      // This matches the working pattern from the user's other projects
      videoContainerRef.current.style.width = `${containerWidth}px`;
      videoContainerRef.current.style.height = `${containerHeight}px`;
      videoContainerRef.current.style.position = 'relative';
      videoContainerRef.current.style.maxWidth = '100%';
      videoContainerRef.current.style.maxHeight = '100%';

      // Build player HTML string with all attributes
      // This approach ensures all attributes are set at creation time, not after
      const secureAttr = cameraDetails.useTLS ? ' secure="true"' : '';
      const rotationAttr = rotation ? ` rotation="${rotation}"` : '';
      const usernameAttr = cameraDetails.username ? ` username="${cameraDetails.username}"` : '';
      const passwordAttr = cameraDetails.password ? ` password="${cameraDetails.password}"` : '';

      const playerHTML = `<media-stream-player hostname="${cameraDetails.ipAddress}"${secureAttr} format="RTP_H264" compression="40" audio="0" resolution="${videoWidth}x${videoHeight}" variant="basic" autoplay${usernameAttr}${passwordAttr}${rotationAttr}></media-stream-player>`;

      console.log('Creating player with HTML:', playerHTML.replace(/password="[^"]*"/, 'password="***"'));

      // Insert player using innerHTML
      videoPlayerDiv.innerHTML = playerHTML;

      // Get reference to the created player element
      const player = videoPlayerDiv.querySelector('media-stream-player');
      playerRef.current = player;

      console.log('Player created via innerHTML:', player);
      console.log('Player attributes:', Array.from(player.attributes).map(a => `${a.name}="${a.value}"`).join(', ').replace(/password="[^"]*"/, 'password="***"'));

      // Log player configuration for debugging
      console.log('Video player initialized:', {
        serial: cameraDetails.serialNumber,
        hostname: cameraDetails.ipAddress,
        resolution: `${videoWidth}x${videoHeight}`,
        rotation,
        aspectRatio: aspect,
        hasCredentials: !!(cameraDetails.username && cameraDetails.password),
        useTLS: cameraDetails.useTLS || false
      });

      // Add event listeners to track player lifecycle and errors
      if (player) {
        player.addEventListener('error', (e) => {
          console.error('Player error event:', e);
        });

        // Log player state after a delay for debugging
        setTimeout(() => {
          console.log('Player state after 2 seconds:', {
            tagName: playerRef.current?.tagName,
            connected: playerRef.current?.isConnected,
            attributes: playerRef.current ? Array.from(playerRef.current.attributes).map(a => `${a.name}="${a.value}"`).join(', ').replace(/password="[^"]*"/, 'password="***"') : 'null'
          });
        }, 2000);
      }
    } catch (err) {
      console.error('Error initializing video player:', err);
      setError('Failed to initialize video player');
    }

    return () => {
      // Clean up video player on unmount
      const videoPlayerDiv = videoContainerRef.current?.querySelector('.video-player-div');
      if (videoPlayerDiv) {
        videoPlayerDiv.innerHTML = '';
      }
      playerRef.current = null;
    };
  }, [cameraDetails]);

  // Helper function to convert hex color to RGB
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 0, b: 0 }; // Default to red if parse fails
  };

  // Get color for object class
  const getColorForClass = (className) => {
    const colors = {
      Car: '#FFFF00',           // Yellow
      Human: '#00FF00',         // Lime
      Truck: '#0000FF',         // Blue
      Bus: '#FFA500',           // Orange
      Bike: '#FF1493',          // DeepPink
      LicensePlate: '#00BFFF',  // DeepSkyBlue
      Bag: '#800080',           // Purple
      Head: '#FFD700',          // Gold
      Animal: '#7FFF00',        // Chartreuse
      Vehicle: '#00FFFF',       // Cyan (Aqua)
      Undefined: '#A0A0A0',    // Gray
      Other: '#FF0000',         // Red
    };
    return colors[className] || '#FF0000'; // Red for unknown
  };

  // Draw path overlays on video (for local cameras) or canvas (for remote cameras)
  useEffect(() => {
    const isLocalCamera = cameraDetails?.cameraType === 'local';
    const canvas = isLocalCamera ? overlayCanvasRef.current : canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    const drawPathOverlays = () => {
      // DataQ coordinates are [0...1000][0...1000]
      // Scale to canvas pixel dimensions
      const scaleX = canvas.width / 1000;
      const scaleY = canvas.height / 1000;

      recentPaths.forEach((pathEvent, index) => {
        const coordinates = pathEvent.path || [];
        if (!coordinates || coordinates.length === 0) return;

        // Get color for this object class
        const colorHex = getColorForClass(pathEvent.class);
        const colorRgb = hexToRgb(colorHex);

        // Fade older paths (newest = full opacity, oldest = 10% opacity)
        const opacity = Math.max(0.1, 1 - index * 0.1);
        ctx.strokeStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${opacity})`;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw path line, scaling DataQ coordinates to canvas pixels
        ctx.beginPath();
        coordinates.forEach((coord, i) => {
          const x = coord.x * scaleX;
          const y = coord.y * scaleY;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();

        // Draw start point (green circle)
        const startCoord = coordinates[0];
        ctx.fillStyle = `rgba(0, 255, 0, ${opacity})`;
        ctx.beginPath();
        ctx.arc(startCoord.x * scaleX, startCoord.y * scaleY, 5, 0, 2 * Math.PI);
        ctx.fill();

        // Draw end point (red circle)
        const endCoord = coordinates[coordinates.length - 1];
        ctx.fillStyle = `rgba(255, 0, 0, ${opacity})`;
        ctx.beginPath();
        ctx.arc(endCoord.x * scaleX, endCoord.y * scaleY, 5, 0, 2 * Math.PI);
        ctx.fill();
      });
    };

    const updateCanvas = () => {
      if (!isLocalCamera && cameraDetails?.snapshot?.image) {
        // Remote camera: draw snapshot background
        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          drawPathOverlays();
        };
        img.src = `data:image/jpeg;base64,${cameraDetails.snapshot.image}`;
      } else if (isLocalCamera) {
        // Local camera: clear and redraw paths on transparent canvas
        // Canvas is 1000x1000, CSS scales it to 100% of container
        ctx.clearRect(0, 0, 1000, 1000);
        drawPathOverlays();
      }
    };

    updateCanvas();

    // Redraw on path updates
    const intervalId = setInterval(() => {
      if (isLocalCamera) {
        updateCanvas();
      }
    }, 500);

    return () => {
      clearInterval(intervalId);
    };
  }, [cameraDetails, recentPaths]);

  const formatTime = (timestamp) => {
    return formatDateTimeUtil(timestamp, dateFormat, timeFormat);
  };

  const formatColor = (color) => {
    if (!color || !color.name) return '-';
    return color.name;
  };

  const handleObjectTypeChange = (objectType) => {
    const newTypes = filters.objectTypes.includes(objectType)
      ? filters.objectTypes.filter((t) => t !== objectType)
      : [...filters.objectTypes, objectType];

    const newFilters = {
      ...filters,
      objectTypes: newTypes,
    };
    setFilters(newFilters);
    saveFilters(newFilters);
  };

  const handleFilterChange = (field, value) => {
    const newFilters = {
      ...filters,
      [field]: parseFloat(value),
    };
    setFilters(newFilters);
  };

  const handleSliderRelease = () => {
    saveFilters(filters);
  };

  const saveFilters = async (newFilters) => {
    if (!cameraDetails?._id) return;

    try {
      await camerasAPI.update(cameraDetails._id, { filters: newFilters });
    } catch (err) {
      console.error('Failed to save camera filters:', err);
      setError('Failed to save filters');
    }
  };

  const filterControls = (
    <div className="left-panel-content">
      {selectedCamera && (
        <div className="panel-section">
          <div className="filter-group">
            <label>Object Types</label>
            <div className="checkbox-grid">
              {(cameraDetails?.labels || DEFAULT_LABELS).map((label) => (
                <label key={label} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.objectTypes.includes(label)}
                    onChange={() => handleObjectTypeChange(label)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <label htmlFor="minDistance">
              Min Distance: {filters.minDistance}%
            </label>
            <input
              type="range"
              id="minDistance"
              min="0"
              max="50"
              step="1"
              value={filters.minDistance}
              onChange={(e) => handleFilterChange('minDistance', e.target.value)}
              onMouseUp={handleSliderRelease}
              onTouchEnd={handleSliderRelease}
            />
          </div>

          <div className="filter-group">
            <label htmlFor="minAge">
              Min Age: {filters.minAge}s
            </label>
            <input
              type="range"
              id="minAge"
              min="0"
              max="10"
              step="0.5"
              value={filters.minAge}
              onChange={(e) => handleFilterChange('minAge', e.target.value)}
              onMouseUp={handleSliderRelease}
              onTouchEnd={handleSliderRelease}
            />
          </div>
        </div>
      )}
    </div>
  );

  // Middle Panel Content
  const middlePanel = (
    <div className="camera-view-container">
      {!selectedCamera ? (
        <div className="no-camera-selected">
          <p>Select a camera to view live path detections</p>
        </div>
      ) : cameraDetails?.cameraType === 'local' ? (
        // Local camera: Show video player with canvas overlay
        <div ref={videoContainerRef} className="video-container">
          <div className="video-wrapper">
            <div className="video-player-div"></div>
            <canvas ref={overlayCanvasRef} className="overlay-canvas" width="1000" height="1000" />
          </div>
        </div>
      ) : !cameraDetails?.snapshot?.image ? (
        // Remote camera without snapshot
        <div className="no-snapshot">
          <p>No camera snapshot available</p>
        </div>
      ) : (
        // Remote camera with snapshot
        <canvas ref={canvasRef} className="camera-canvas" />
      )}
    </div>
  );

  // Right Panel Content
  const rightPanel = (
    <div className="right-panel-content">
      <div className="panel-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3>Recent Detections (Last 10)</h3>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.85em',
            color: isConnected ? '#4caf50' : '#999'
          }}>
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isConnected ? '#4caf50' : '#999'
            }}></span>
            {isConnected ? 'Live' : 'Disconnected'}
          </div>
        </div>
        {error && <div className="error-message">{error}</div>}
        <table className="detections-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Class</th>
              <th>Age</th>
              <th>Color 1</th>
              <th>Color 2</th>
            </tr>
          </thead>
          <tbody>
            {recentPaths.length === 0 ? (
              <tr>
                <td colSpan="5" className="no-data">
                  No recent detections
                </td>
              </tr>
            ) : (
              recentPaths.map((path) => (
                <tr key={path._id}>
                  <td className="time-cell">{formatTime(path.timestamp)}</td>
                  <td>
                    <span className={"class-badge class-" + (path.class?.toLowerCase() || 'unknown')}>
                      {path.class || '-'}
                    </span>
                  </td>
                  <td>{path.age ? path.age.toFixed(1) + 's' : '-'}</td>
                  <td>{path.color || '-'}</td>
                  <td>{path.color2 || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <section className="live-workspace">
      <div className="live-toolbar">
        <div className="live-summary">
          <span className={`live-dot ${isConnected ? 'online' : ''}`} />
          <strong>{isConnected ? 'Live' : 'Disconnected'}</strong>
          <span>{recentPaths.length} recent detections</span>
        </div>
        <Button
          variant="default"
          leftSection={<SlidersHorizontal size={16} />}
          onClick={() => setFiltersOpen(true)}
        >
          Filters
        </Button>
      </div>
      <div className="live-content">
        <ThreeColumnLayout middlePanel={middlePanel} rightPanel={rightPanel} />
      </div>
      <Drawer
        opened={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        position="right"
        title="Live filters"
        size="sm"
      >
        {filterControls}
      </Drawer>
    </section>
  );
}

LiveData.propTypes = {
  selectedCamera: PropTypes.string,
  cameraDetails: PropTypes.object,
};

export default LiveData;
