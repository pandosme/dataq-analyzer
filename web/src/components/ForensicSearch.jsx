import { useEffect, useRef, useState, useMemo } from 'react';
import { ActionIcon, Drawer, Tooltip } from '@mantine/core';
import { LogIn, LogOut, Trash2 } from 'lucide-react';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { formatDateTime as formatDateTimeUtil } from '../utils/dateFormat';
import useContainerFit from '../hooks/useContainerFit';
import WebSocketVideoPlayer from './WebSocketVideoPlayer';
import './ForensicSearch.css';

const COLOR_NAME_MAP = {
  White: '#ffffff',
  Black: '#1a1a1a',
  Red: '#e53935',
  Blue: '#1e88e5',
  Green: '#43a047',
  Yellow: '#fdd835',
  Beige: '#d7ccc8',
  Orange: '#fb8c00',
  Purple: '#8e24aa',
  Silver: '#bdbdbd',
  Grey: '#757575',
  Gray: '#757575',
  Brown: '#6d4c41',
  Pink: '#e91e63',
};

function ForensicSearch({ pathData, backgroundImage, selectedCamera, onQuery, loading, cameraDetails, queryOpen, onQueryClose }) {
  const { dateFormat, timeFormat, playbackEnabled, videoPreTime, videoPostTime } = useUserPreferences();
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [selectedPath, setSelectedPath] = useState(null);
  const [drawingMode, setDrawingMode] = useState(null); // 'entry' or 'exit'
  const [entryArea, setEntryArea] = useState(null);
  const [exitArea, setExitArea] = useState(null);
  const [drawStart, setDrawStart] = useState(null);
  const [resizeInfo, setResizeInfo] = useState(null); // { area: 'entry'|'exit', handle: string, startX, startY }
  const [videoInfo, setVideoInfo] = useState(null); // { serial, timestamp, preTime, postTime }
  const [videoDimensions, setVideoDimensions] = useState(null); // { width, height, videoWidth, videoHeight }
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [queryLimit, setQueryLimit] = useState(500); // Maximum number of results to fetch

  // Filter states
  const [filters, setFilters] = useState({
    class: '',
    timeRange: '24hours', // time period selection
    direction: '',
    minDwell: 0,
    color: '',
    color2: '',
    minAge: 0,
    anomalyOnly: false,
  });

  // Playback is handled through the authenticated application WebSocket.

  // Compute image aspect ratio for container-fit sizing
  const imageAspect = useMemo(() => {
    if (!imageRef.current) return null;
    return imageRef.current.width / imageRef.current.height;
  }, [imageLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const fitted = useContainerFit(containerRef, imageAspect);

  // Convert time range selection to hours
  const getTimeRangeHours = (selection) => {
    const ranges = {
      '3hours': 3,
      '6hours': 6,
      '12hours': 12,
      '24hours': 24,
      '2days': 48,
      '3days': 72,
      '4days': 96,
      '5days': 120,
      'week': 168,
      '2weeks': 336,
      '3weeks': 504,
      'month': 720,
      '2months': 1440,
    };
    return ranges[selection] || 24;
  };

  // Clear state when camera changes
  useEffect(() => {
    if (!selectedCamera) {
      // No camera selected - clear everything
      setSelectedPath(null);
      setVideoInfo(null);
      setEntryArea(null);
      setExitArea(null);
      setDrawingMode(null);
      setDrawStart(null);
      setImageLoaded(false);
      return;
    }

    // Camera changed - clear selections and areas but keep filters
    setSelectedPath(null);
    setVideoInfo(null);
    setVideoDimensions(null);
    setEntryArea(null);
    setExitArea(null);
    setDrawingMode(null);
    setDrawStart(null);
    setImageLoaded(false);

    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [selectedCamera]);

  // Load background image
  useEffect(() => {
    if (!backgroundImage) return;

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => {
      console.error('Failed to load background image');
      setImageLoaded(false);
    };
    img.src = backgroundImage;
  }, [backgroundImage]);

  // Helper: Get color for object class
  const getColorForClass = (className) => {
    const colors = {
      Car: '#FFFF00',
      Human: '#00FF00',
      Truck: '#0000FF',
      Bus: '#FFA500',
      Bike: '#FF1493',
      LicensePlate: '#00BFFF',
      Bag: '#800080',
      Head: '#FFD700',
      Animal: '#7FFF00',
      Vehicle: '#00FFFF',
      Undefined: '#A0A0A0',
      Other: '#FF0000',
    };
    return colors[className] || '#FF0000';
  };

  // Helper: Convert hex to RGB
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 255, g: 0, b: 0 };
  };

  // Helper: Check if point is in box
  const isPointInBox = (point, box) => {
    if (!box) return true;
    const minX = Math.min(box.x1, box.x2);
    const maxX = Math.max(box.x1, box.x2);
    const minY = Math.min(box.y1, box.y2);
    const maxY = Math.max(box.y1, box.y2);
    return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
  };

  // Filter paths based on criteria
  const filteredPaths = pathData.filter((pathEvent) => {
    // Class filter
    if (filters.class && pathEvent.class !== filters.class) return false;

    // Time range filter (MUST)
    const pathTime = new Date(pathEvent.timestamp);
    const hours = getTimeRangeHours(filters.timeRange);
    const hoursAgo = new Date(Date.now() - hours * 60 * 60 * 1000);
    if (pathTime < hoursAgo) return false;

    // Entry area filter
    if (entryArea && pathEvent.path && pathEvent.path.length > 0) {
      const firstPoint = pathEvent.path[0];
      if (!isPointInBox(firstPoint, entryArea)) return false;
    }

    // Exit area filter
    if (exitArea && pathEvent.path && pathEvent.path.length > 0) {
      const lastPoint = pathEvent.path[pathEvent.path.length - 1];
      if (!isPointInBox(lastPoint, exitArea)) return false;
    }

    // Direction filter
    if (filters.direction && pathEvent.dx !== undefined && pathEvent.dy !== undefined) {
      const { dx, dy } = pathEvent;
      switch (filters.direction) {
        case 'right':
          if (dx <= 0) return false;
          break;
        case 'left':
          if (dx >= 0) return false;
          break;
        case 'down':
          if (dy <= 0) return false;
          break;
        case 'up':
          if (dy >= 0) return false;
          break;
      }
    }

    // Min dwell filter
    if (filters.minDwell > 0 && (!pathEvent.dwell || pathEvent.dwell < filters.minDwell))
      return false;

    // Color filter
    if (filters.color && pathEvent.color !== filters.color) return false;

    // Color2 filter
    if (filters.color2 && pathEvent.color2 !== filters.color2) return false;

    // Min age filter
    if (filters.minAge > 0 && (!pathEvent.age || pathEvent.age < filters.minAge)) return false;

    // Anomaly filter
    if (filters.anomalyOnly && !pathEvent.anomaly) return false;

    return true;
  });

  // Draw paths on canvas
  useEffect(() => {
    // Need either loaded image or video to draw
    if ((!imageLoaded || !imageRef.current) && !videoInfo) return;
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // When video is playing, size canvas to match video's rendered dimensions
    // When showing static image, size canvas to container-fitted dimensions
    if (videoInfo && videoDimensions) {
      canvas.width = videoDimensions.videoWidth;
      canvas.height = videoDimensions.videoHeight;
    } else if (!videoInfo && imageRef.current) {
      // Wait for the container measurement. Falling back to the image's natural
      // size here would lay the canvas out larger than its container, which then
      // re-measures and re-fits — the image visibly grows and shoves the results
      // table sideways until it settles.
      if (!fitted.width || !fitted.height) return;
      canvas.width = fitted.width;
      canvas.height = fitted.height;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image only if not showing video
    if (!videoInfo && imageRef.current) {
      const img = imageRef.current;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    // Helper function to draw resize handles
    const drawResizeHandles = (x, y, w, h, color) => {
      const handleSize = 8;
      const halfHandle = handleSize / 2;
      ctx.fillStyle = color;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1;

      // Corner handles
      const handles = [
        { x: x - halfHandle, y: y - halfHandle }, // top-left
        { x: x + w - halfHandle, y: y - halfHandle }, // top-right
        { x: x - halfHandle, y: y + h - halfHandle }, // bottom-left
        { x: x + w - halfHandle, y: y + h - halfHandle }, // bottom-right
        // Side midpoint handles
        { x: x + w / 2 - halfHandle, y: y - halfHandle }, // top-center
        { x: x + w / 2 - halfHandle, y: y + h - halfHandle }, // bottom-center
        { x: x - halfHandle, y: y + h / 2 - halfHandle }, // left-center
        { x: x + w - halfHandle, y: y + h / 2 - halfHandle }, // right-center
      ];

      handles.forEach(handle => {
        ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
        ctx.strokeRect(handle.x, handle.y, handleSize, handleSize);
      });
    };

    // Draw entry area
    if (entryArea) {
      const x = (Math.min(entryArea.x1, entryArea.x2) / 1000) * canvas.width;
      const y = (Math.min(entryArea.y1, entryArea.y2) / 1000) * canvas.height;
      const w = (Math.abs(entryArea.x2 - entryArea.x1) / 1000) * canvas.width;
      const h = (Math.abs(entryArea.y2 - entryArea.y1) / 1000) * canvas.height;

      // Filled semi-transparent background
      ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
      ctx.fillRect(x, y, w, h);

      // Border
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, w, h);

      // Resize handles
      drawResizeHandles(x, y, w, h, '#00FF00');
    }

    // Draw exit area
    if (exitArea) {
      const x = (Math.min(exitArea.x1, exitArea.x2) / 1000) * canvas.width;
      const y = (Math.min(exitArea.y1, exitArea.y2) / 1000) * canvas.height;
      const w = (Math.abs(exitArea.x2 - exitArea.x1) / 1000) * canvas.width;
      const h = (Math.abs(exitArea.y2 - exitArea.y1) / 1000) * canvas.height;

      // Filled semi-transparent background
      ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
      ctx.fillRect(x, y, w, h);

      // Border
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, w, h);

      // Resize handles
      drawResizeHandles(x, y, w, h, '#FF0000');
    }

    // Draw paths
    const pathsToDraw = selectedPath ? [selectedPath] : filteredPaths;

    pathsToDraw.forEach((pathEvent) => {
      if (!pathEvent.path || pathEvent.path.length === 0) return;

      const colorHex = getColorForClass(pathEvent.class);
      const colorRgb = hexToRgb(colorHex);

      ctx.strokeStyle = `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.8)`;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      pathEvent.path.forEach((point, index) => {
        const x = (point.x / 1000) * canvas.width;
        const y = (point.y / 1000) * canvas.height;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw entry point (green circle)
      const firstPoint = pathEvent.path[0];
      const fx = (firstPoint.x / 1000) * canvas.width;
      const fy = (firstPoint.y / 1000) * canvas.height;
      ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
      ctx.beginPath();
      ctx.arc(fx, fy, 5, 0, 2 * Math.PI);
      ctx.fill();

      // Draw exit point (red circle)
      const lastPoint = pathEvent.path[pathEvent.path.length - 1];
      const lx = (lastPoint.x / 1000) * canvas.width;
      const ly = (lastPoint.y / 1000) * canvas.height;
      ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.arc(lx, ly, 5, 0, 2 * Math.PI);
      ctx.fill();
    });
  }, [imageLoaded, filteredPaths, selectedPath, entryArea, exitArea, videoInfo, videoDimensions, fitted]);

  // Helper: Check if click is near a resize handle
  const getHandleAtPosition = (mouseX, mouseY, area, areaType) => {
    if (!area) return null;

    const handleSize = 12; // Clickable area slightly larger than visual handle
    const x1 = Math.min(area.x1, area.x2);
    const y1 = Math.min(area.y1, area.y2);
    const x2 = Math.max(area.x1, area.x2);
    const y2 = Math.max(area.y1, area.y2);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const handles = [
      { name: 'top-left', x: x1, y: y1, cursor: 'nwse-resize' },
      { name: 'top-right', x: x2, y: y1, cursor: 'nesw-resize' },
      { name: 'bottom-left', x: x1, y: y2, cursor: 'nesw-resize' },
      { name: 'bottom-right', x: x2, y: y2, cursor: 'nwse-resize' },
      { name: 'top', x: midX, y: y1, cursor: 'ns-resize' },
      { name: 'bottom', x: midX, y: y2, cursor: 'ns-resize' },
      { name: 'left', x: x1, y: midY, cursor: 'ew-resize' },
      { name: 'right', x: x2, y: midY, cursor: 'ew-resize' },
    ];

    for (const handle of handles) {
      if (
        Math.abs(mouseX - handle.x) < handleSize &&
        Math.abs(mouseY - handle.y) < handleSize
      ) {
        return { handle: handle.name, area: areaType, cursor: handle.cursor };
      }
    }
    return null;
  };

  // Helper: Check if click is inside an area (for moving)
  const isPointInsideArea = (mouseX, mouseY, area) => {
    if (!area) return false;
    const x1 = Math.min(area.x1, area.x2);
    const y1 = Math.min(area.y1, area.y2);
    const x2 = Math.max(area.x1, area.x2);
    const y2 = Math.max(area.y1, area.y2);
    return mouseX >= x1 && mouseX <= x2 && mouseY >= y1 && mouseY <= y2;
  };

  // State for tracking cursor based on hover position
  const [hoverCursor, setHoverCursor] = useState('default');

  // Handle canvas mouse events for drawing and resizing areas
  const handleCanvasMouseDown = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 1000;

    // First check if clicking on a resize handle (only when not in drawing mode)
    if (!drawingMode) {
      // Check entry area handles first
      const entryHandle = getHandleAtPosition(x, y, entryArea, 'entry');
      if (entryHandle) {
        e.preventDefault();
        e.stopPropagation();
        setResizeInfo({ ...entryHandle, startX: x, startY: y, originalArea: { ...entryArea }, mode: 'resize' });
        return;
      }

      // Check exit area handles
      const exitHandle = getHandleAtPosition(x, y, exitArea, 'exit');
      if (exitHandle) {
        e.preventDefault();
        e.stopPropagation();
        setResizeInfo({ ...exitHandle, startX: x, startY: y, originalArea: { ...exitArea }, mode: 'resize' });
        return;
      }

      // Check if clicking inside an area (for moving)
      if (isPointInsideArea(x, y, entryArea)) {
        e.preventDefault();
        e.stopPropagation();
        setResizeInfo({ area: 'entry', startX: x, startY: y, originalArea: { ...entryArea }, mode: 'move' });
        return;
      }

      if (isPointInsideArea(x, y, exitArea)) {
        e.preventDefault();
        e.stopPropagation();
        setResizeInfo({ area: 'exit', startX: x, startY: y, originalArea: { ...exitArea }, mode: 'move' });
        return;
      }
    }

    // If in drawing mode, start drawing new area
    if (drawingMode) {
      setDrawStart({ x, y });
    }
  };

  const handleCanvasMouseMove = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 1000;

    // Update cursor based on hover position when not actively dragging
    if (!resizeInfo && !drawingMode) {
      // Check handles first
      const entryHandle = getHandleAtPosition(x, y, entryArea, 'entry');
      if (entryHandle) {
        setHoverCursor(entryHandle.cursor);
        return;
      }
      const exitHandle = getHandleAtPosition(x, y, exitArea, 'exit');
      if (exitHandle) {
        setHoverCursor(exitHandle.cursor);
        return;
      }
      // Check if inside area (for move cursor)
      if (isPointInsideArea(x, y, entryArea) || isPointInsideArea(x, y, exitArea)) {
        setHoverCursor('move');
        return;
      }
      setHoverCursor('default');
      return;
    }

    // If not actively resizing/moving, nothing to do
    if (!resizeInfo) return;

    // Clamp values to 0-1000 range
    const clampedX = Math.max(0, Math.min(1000, x));
    const clampedY = Math.max(0, Math.min(1000, y));

    const { handle, area, originalArea, mode, startX, startY } = resizeInfo;
    const setArea = area === 'entry' ? setEntryArea : setExitArea;

    // Handle moving the entire area
    if (mode === 'move') {
      const deltaX = clampedX - startX;
      const deltaY = clampedY - startY;

      let x1 = originalArea.x1 + deltaX;
      let y1 = originalArea.y1 + deltaY;
      let x2 = originalArea.x2 + deltaX;
      let y2 = originalArea.y2 + deltaY;

      // Keep area within bounds
      const width = Math.abs(originalArea.x2 - originalArea.x1);
      const height = Math.abs(originalArea.y2 - originalArea.y1);

      if (x1 < 0) { x1 = 0; x2 = width; }
      if (x2 > 1000) { x2 = 1000; x1 = 1000 - width; }
      if (y1 < 0) { y1 = 0; y2 = height; }
      if (y2 > 1000) { y2 = 1000; y1 = 1000 - height; }

      setArea({ x1, y1, x2, y2 });
      return;
    }

    // Handle resizing
    // Get normalized coordinates (ensure x1 < x2, y1 < y2)
    let x1 = Math.min(originalArea.x1, originalArea.x2);
    let y1 = Math.min(originalArea.y1, originalArea.y2);
    let x2 = Math.max(originalArea.x1, originalArea.x2);
    let y2 = Math.max(originalArea.y1, originalArea.y2);

    // Update coordinates based on which handle is being dragged
    switch (handle) {
      case 'top-left':
        x1 = clampedX;
        y1 = clampedY;
        break;
      case 'top-right':
        x2 = clampedX;
        y1 = clampedY;
        break;
      case 'bottom-left':
        x1 = clampedX;
        y2 = clampedY;
        break;
      case 'bottom-right':
        x2 = clampedX;
        y2 = clampedY;
        break;
      case 'top':
        y1 = clampedY;
        break;
      case 'bottom':
        y2 = clampedY;
        break;
      case 'left':
        x1 = clampedX;
        break;
      case 'right':
        x2 = clampedX;
        break;
    }

    setArea({ x1, y1, x2, y2 });
  };

  const handleCanvasMouseUp = (e) => {
    // If we were resizing, just stop
    if (resizeInfo) {
      setResizeInfo(null);
      return;
    }

    // If we were drawing, complete the area
    if (drawingMode && drawStart) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 1000;
      const y = ((e.clientY - rect.top) / rect.height) * 1000;

      const area = {
        x1: drawStart.x,
        y1: drawStart.y,
        x2: x,
        y2: y,
      };

      if (drawingMode === 'entry') {
        setEntryArea(area);
      } else if (drawingMode === 'exit') {
        setExitArea(area);
      }

      setDrawingMode(null);
      setDrawStart(null);
    }
  };

  // Handle canvas click to close video (only when overlay is active)
  const handleCanvasClick = (e) => {
    // Don't close video if we were resizing or drawing
    if (resizeInfo || drawStart) return;

    // If video is playing and canvas is in overlay mode, close the video
    if (videoInfo) {
      setVideoInfo(null);
      setVideoDimensions(null);
      setSelectedPath(null);
    }
  };

  // Format date/time using system date format setting
  const formatDateTime = (timestamp) => {
    return formatDateTimeUtil(timestamp, dateFormat, timeFormat);
  };

  // Handle Query/Refresh button click
  const handleQuery = () => {
    if (!selectedCamera) {
      setToastMessage('Please select a camera first');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }

    // Build query from ForensicSearch's own filters
    // This overrides any stale App-level filters from other views
    const hours = getTimeRangeHours(filters.timeRange);
    const now = new Date();
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000);

    const queryFilters = {
      from: from.toISOString(),
      to: now.toISOString(),
      limit: queryLimit,
    };

    // Only include class if explicitly selected (empty = all)
    if (filters.class) {
      queryFilters.class = filters.class;
    }

    // Include minAge if set
    if (filters.minAge > 0) {
      queryFilters.minAge = filters.minAge;
    }

    if (filters.minDwell > 0) queryFilters.minDwell = filters.minDwell;
    if (filters.color) queryFilters.color = filters.color;
    if (filters.color2) queryFilters.color2 = filters.color2;
    if (filters.anomalyOnly) queryFilters.anomalyOnly = true;
    if (entryArea) queryFilters.entryArea = entryArea;
    if (exitArea) queryFilters.exitArea = exitArea;
    if (filters.direction === 'up' || filters.direction === 'down') {
      queryFilters.dy = filters.direction;
    }
    if (filters.direction === 'left' || filters.direction === 'right') {
      queryFilters.dx = filters.direction;
    }

    if (onQuery) {
      onQuery(queryFilters);
    }
    onQueryClose?.();
  };

  // Handle row click to select path and play video
  const handleRowClick = (pathEvent) => {
    // Toggle selection
    const newSelectedPath = selectedPath === pathEvent ? null : pathEvent;
    setSelectedPath(newSelectedPath);

    // If selecting a new path, request video via WebSocket
    // Use user's preferred pre/post time (which may override system defaults)
    // With no recording server configured there is no clip to ask for, and the
    // camera view is the better answer anyway: the canvas keeps the backdrop and
    // draws the selected path on it. Requesting video regardless would swap that
    // for an error box.
    if (playbackEnabled && newSelectedPath && newSelectedPath.serial && newSelectedPath.timestamp) {
      // Calculate correct video timing:
      // IMPORTANT: timestamp = when the object FIRST APPEARED (entry time)
      // - timestamp: when object first appeared/was first detected
      // - age: how long object was in scene (seconds)
      // - Object entered at: timestamp
      // - Object exited at: timestamp + age
      // - Start: timestamp - preTime
      // - End: timestamp + age + postTime
      // - Duration: preTime + age + postTime
      const age = newSelectedPath.age || 0;

      setVideoInfo({
        serial: newSelectedPath.serial,
        timestamp: newSelectedPath.timestamp,
        preTime: videoPreTime,
        postTime: videoPostTime,
        age: age
      });
    } else {
      // Deselecting - clear video
      setVideoInfo(null);
    }
  };

  return (
    <div className="forensic-search">
      <Drawer
        opened={queryOpen}
        onClose={onQueryClose}
        position="right"
        title="Forensic query"
        size="sm"
      >
        <div className="forensic-left-panel">
        <div className="filter-grid">
          {/* Row 1: Time & Min Age */}
          <div className="filter-row">
            <div className="filter-group">
              <label>Time *</label>
              <select
                value={filters.timeRange}
                onChange={(e) => setFilters({ ...filters, timeRange: e.target.value })}
              >
                <option value="3hours">Last 3 hours</option>
                <option value="6hours">Last 6 hours</option>
                <option value="12hours">Last 12 hours</option>
                <option value="24hours">Last 24 hours</option>
                <option value="2days">Last 2 days</option>
                <option value="3days">Last 3 days</option>
                <option value="4days">Last 4 days</option>
                <option value="5days">Last 5 days</option>
                <option value="week">Last week</option>
                <option value="2weeks">Last 2 weeks</option>
                <option value="3weeks">Last 3 weeks</option>
                <option value="month">Last month</option>
                <option value="2months">Last 2 months</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Min Age (s)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={filters.minAge}
                onChange={(e) =>
                  setFilters({ ...filters, minAge: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          {/* Row 2: Object Class & Color */}
          <div className="filter-row">
            <div className="filter-group">
              <label>Object Class</label>
              <select
                value={filters.class}
                onChange={(e) => setFilters({ ...filters, class: e.target.value })}
              >
                <option value="">All</option>
                {(cameraDetails?.labels || ['Human', 'Vehicle', 'Bike', 'LicensePlate', 'Bag', 'Head', 'Animal', 'Car', 'Truck', 'Bus', 'Other']).map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Color</label>
              <select
                value={filters.color}
                onChange={(e) => setFilters({ ...filters, color: e.target.value })}
              >
                <option value="">All</option>
                <option value="White">White</option>
                <option value="Black">Black</option>
                <option value="Red">Red</option>
                <option value="Blue">Blue</option>
                <option value="Green">Green</option>
                <option value="Yellow">Yellow</option>
                <option value="Beige">Beige</option>
                <option value="Gray">Gray</option>
                <option value="Silver">Silver</option>
                <option value="Orange">Orange</option>
                <option value="Brown">Brown</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Color 2</label>
              <select
                value={filters.color2}
                onChange={(e) => setFilters({ ...filters, color2: e.target.value })}
              >
                <option value="">All</option>
                <option value="White">White</option>
                <option value="Black">Black</option>
                <option value="Red">Red</option>
                <option value="Blue">Blue</option>
                <option value="Green">Green</option>
                <option value="Yellow">Yellow</option>
                <option value="Beige">Beige</option>
                <option value="Gray">Gray</option>
                <option value="Silver">Silver</option>
                <option value="Orange">Orange</option>
                <option value="Brown">Brown</option>
              </select>
            </div>
          </div>

          {/* Row 3: Direction & Min Dwell */}
          <div className="filter-row">
            <div className="filter-group">
              <label>Direction</label>
              <select
                value={filters.direction}
                onChange={(e) => setFilters({ ...filters, direction: e.target.value })}
              >
                <option value="">All</option>
                <option value="up">Up</option>
                <option value="down">Down</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Min Dwell (s)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={filters.minDwell}
                onChange={(e) =>
                  setFilters({ ...filters, minDwell: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          {/* Row 4: Anomaly (Full Width) */}
          <div className="filter-row-full">
            <div className="filter-group">
              <div className="checkbox-wrapper">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.anomalyOnly}
                    onChange={(e) => setFilters({ ...filters, anomalyOnly: e.target.checked })}
                  />
                  <span>Anomaly Only</span>
                </label>
              </div>
            </div>
          </div>

          {/* Limit & Query Button */}
          <div className="filter-row">
            <div className="filter-group">
              <label>Max Results</label>
              <input
                type="number"
                min="1"
                max="10000"
                step="100"
                value={queryLimit}
                onChange={(e) => setQueryLimit(parseInt(e.target.value) || 500)}
              />
            </div>

            <div className="filter-group">
              <label>&nbsp;</label>
              <button
                className="btn-query"
                onClick={handleQuery}
                disabled={loading || !selectedCamera}
              >
                {loading ? 'Loading...' : 'Query / Refresh'}
              </button>
            </div>
          </div>
        </div>

        {drawingMode && (
          <div className="filter-info">
            <p className="drawing-hint">
              Click and drag on the image to draw {drawingMode} area
            </p>
          </div>
        )}
        </div>
      </Drawer>

      {/* Middle Panel - Image/Video with paths */}
      <div className="forensic-middle-panel">
        <div className="forensic-area-tools" aria-label="Search areas">
          <button
            className={`btn-area btn-entry ${drawingMode === 'entry' ? 'active' : ''} ${entryArea ? 'has-area' : ''}`}
            onClick={() => setDrawingMode(drawingMode === 'entry' ? null : 'entry')}
          >
            <LogIn size={15} />
            {entryArea ? 'Edit entry' : 'Add entry'}
          </button>
          {entryArea && (
            <Tooltip label="Remove entry area">
              <ActionIcon color="red" variant="subtle" aria-label="Remove entry area" onClick={() => setEntryArea(null)}>
                <Trash2 size={15} />
              </ActionIcon>
            </Tooltip>
          )}
          <button
            className={`btn-area btn-exit ${drawingMode === 'exit' ? 'active' : ''} ${exitArea ? 'has-area' : ''}`}
            onClick={() => setDrawingMode(drawingMode === 'exit' ? null : 'exit')}
          >
            <LogOut size={15} />
            {exitArea ? 'Edit exit' : 'Add exit'}
          </button>
          {exitArea && (
            <Tooltip label="Remove exit area">
              <ActionIcon color="red" variant="subtle" aria-label="Remove exit area" onClick={() => setExitArea(null)}>
                <Trash2 size={15} />
              </ActionIcon>
            </Tooltip>
          )}
          {drawingMode && <span>Drag on the image to set the {drawingMode} area</span>}
        </div>
        {!selectedCamera ? (
          <div className="no-camera-selected">
            <p>Select a camera to perform forensic search</p>
          </div>
        ) : (
          <div className="media-container" ref={containerRef}>
            {!imageLoaded && !videoInfo && <div className="loading">Loading camera view...</div>}
            {videoInfo && (
              <WebSocketVideoPlayer
                serial={videoInfo.serial}
                timestamp={videoInfo.timestamp}
                preTime={videoInfo.preTime}
                postTime={videoInfo.postTime}
                age={videoInfo.age}
                onError={(error) => {
                  console.error('Video playback error:', error);
                  // Drop back to the backdrop with the selected path drawn on
                  // it, rather than leaving a black player and a warning where
                  // the camera view should be.
                  setVideoInfo(null);
                  setVideoDimensions(null);
                  setToastMessage(error || 'Ingen video för denna händelse');
                  setShowToast(true);
                  setTimeout(() => setShowToast(false), 4000);
                }}
                onClose={() => {
                  setVideoInfo(null);
                  setVideoDimensions(null);
                  setSelectedPath(null);
                }}
                onVideoReady={(dims) => setVideoDimensions(dims)}
              />
            )}
            <canvas
              ref={canvasRef}
              className={`forensic-canvas ${drawingMode ? 'drawing-mode' : ''} ${videoInfo ? 'overlay-canvas' : ''} ${resizeInfo ? 'resizing' : ''}`}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={() => { resizeInfo && setResizeInfo(null); setHoverCursor('default'); }}
              onClick={handleCanvasClick}
              style={{
                display: imageLoaded || videoInfo ? 'block' : 'none',
                ...(videoInfo && videoDimensions
                  ? {
                      width: videoDimensions.width + 'px',
                      height: videoDimensions.height + 'px'
                    }
                  : fitted.width
                  ? { width: fitted.width + 'px', height: fitted.height + 'px' }
                  : {}),
                cursor: drawingMode ? 'crosshair' : (resizeInfo ? (resizeInfo.mode === 'move' ? 'move' : (resizeInfo.cursor || 'grabbing')) : hoverCursor)
              }}
            />
          </div>
        )}
      </div>

      {/* Right Panel - Table */}
      <div className="forensic-right-panel">
        <div className="results-header">
          <h3>Results</h3>
          <p className="result-count">
            Found: <strong>{filteredPaths.length}</strong> paths
          </p>
        </div>
        <div className="forensic-table-container">
          <table className="forensic-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Label</th>
                <th>Color</th>
                <th>Age (s)</th>
                <th>Anomaly</th>
              </tr>
            </thead>
            <tbody>
              {filteredPaths.map((pathEvent, index) => (
                <tr
                  key={pathEvent._id || index}
                  className={selectedPath === pathEvent ? 'selected' : ''}
                  onClick={() => handleRowClick(pathEvent)}
                >
                  <td>{formatDateTime(pathEvent.timestamp)}</td>
                  <td>
                    <span
                      className={`label-badge label-${pathEvent.class?.toLowerCase() || 'unknown'}`}
                    >
                      {pathEvent.class}
                    </span>
                  </td>
                  <td>
                    <span className="color-swatch-cell">
                      {pathEvent.color ? (
                        <>
                          <span
                            className="color-dot"
                            style={{ background: COLOR_NAME_MAP[pathEvent.color] || pathEvent.color }}
                            title={pathEvent.color}
                          />
                          <span>{pathEvent.color}</span>
                        </>
                      ) : null}
                      {pathEvent.color2 ? (
                        <>
                          <span
                            className="color-dot"
                            style={{ background: COLOR_NAME_MAP[pathEvent.color2] || pathEvent.color2 }}
                            title={pathEvent.color2}
                          />
                          <span>{pathEvent.color2}</span>
                        </>
                      ) : null}
                      {!pathEvent.color && !pathEvent.color2 ? '-' : null}
                    </span>
                  </td>
                  <td>{pathEvent.age?.toFixed(1) || 'N/A'}</td>
                  <td className="anomaly-cell">{pathEvent.anomaly || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredPaths.length === 0 && (
            <div className="no-results">No paths match the current filters</div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="toast-notification">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default ForensicSearch;
