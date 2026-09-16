import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './CounterFlowView.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const HANDLE_HIT = 14;   // px click radius for handles
const HANDLE_SIZE = 10;  // px visual size of handles
const MIN_WIDTH = 2;
const MAX_WIDTH = 24;

// Generate sensible default control points for a cubic bezier arrow
function generateDefaultArrowConfig(fromCenter, toCenter) {
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const perpOffset = Math.min(80, dist * 0.25);
  
  // Perpendicular direction for curvature
  const len = dist || 1;
  const px = (-dy / len) * perpOffset;
  const py = (dx / len) * perpOffset;

  // Control points at 1/3 and 2/3 along the path, offset perpendicular
  const mid1 = { x: fromCenter.x + dx * 0.33, y: fromCenter.y + dy * 0.33 };
  const mid2 = { x: fromCenter.x + dx * 0.67, y: fromCenter.y + dy * 0.67 };

  return {
    startOffset: { x: 0, y: 0 },
    endOffset: { x: 0, y: 0 },
    controlPoint1: { x: mid1.x + px, y: mid1.y + py },
    controlPoint2: { x: mid2.x + px, y: mid2.y + py },
    baseWidth: 6,
    proportional: true,
  };
}

// Get zone center in normalized coords (0-1000)
function getZoneCenter(zone) {
  return {
    x: (zone.rect.x1 + zone.rect.x2) / 2,
    y: (zone.rect.y1 + zone.rect.y2) / 2,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CounterFlowView({
  snapshot,
  zones,
  counters,
  days,
  flowViewConfig,
  objectClasses,
  onConfigChange,
  onCounterConfigChange,
  onSave,
  readOnly,
}) {
  const containerRef = useRef(null);
  const [imgSize, setImgSize] = useState({ width: 800, height: 600 });
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(null); // { counterId, handle: 'start'|'end'|'cp1'|'cp2' }
  const [hoveredHandle, setHoveredHandle] = useState(null);
  const [selectedArrow, setSelectedArrow] = useState(null); // null = all, or counter id

  // Local state for editing (synced from props)
  const [localConfig, setLocalConfig] = useState(flowViewConfig);
  const [localCounters, setLocalCounters] = useState(counters);

  // Sync from props when they change externally
  useEffect(() => {
    setLocalConfig(flowViewConfig);
  }, [flowViewConfig]);

  useEffect(() => {
    setLocalCounters(counters);
  }, [counters]);

  // Load image dimensions
  useEffect(() => {
    if (!snapshot) return;
    const img = new Image();
    img.onload = () => setImgSize({ width: img.width, height: img.height });
    img.src = snapshot;
  }, [snapshot]);

  // Convert normalized coords (0-1000) to SVG pixels
  const toSvg = useCallback((pt) => ({
    x: (pt.x / 1000) * imgSize.width,
    y: (pt.y / 1000) * imgSize.height,
  }), [imgSize]);

  // Convert SVG pixels to normalized coords (0-1000)
  const toNorm = useCallback((pt) => ({
    x: Math.round((pt.x / imgSize.width) * 1000),
    y: Math.round((pt.y / imgSize.height) * 1000),
  }), [imgSize]);

  // Get mouse position in SVG coords
  const getSvgPoint = useCallback((e) => {
    const svg = containerRef.current?.querySelector('svg');
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (imgSize.width / rect.width),
      y: (e.clientY - rect.top) * (imgSize.height / rect.height),
    };
  }, [imgSize]);

  // Build zone lookup
  const zoneMap = useMemo(() => {
    const map = {};
    for (const z of zones) map[z.label] = z;
    return map;
  }, [zones]);

  // Compute arrow data for each enabled counter
  const arrowData = useMemo(() => {
    const enabledCounters = localCounters.filter(c => c.enabled);
    const maxVal = Math.max(1, ...enabledCounters.map(c => c.value || 0));

    return enabledCounters.map(counter => {
      const fromZone = zoneMap[counter.from];
      const toZone = zoneMap[counter.to];
      if (!fromZone || !toZone) return null;

      const fromCenter = getZoneCenter(fromZone);
      const toCenter = getZoneCenter(toZone);

      // Get or generate arrow config
      let config = counter.arrowConfig;
      if (!config) {
        config = generateDefaultArrowConfig(fromCenter, toCenter);
      }

      // Compute actual start/end points
      const start = {
        x: fromCenter.x + (config.startOffset?.x || 0),
        y: fromCenter.y + (config.startOffset?.y || 0),
      };
      const end = {
        x: toCenter.x + (config.endOffset?.x || 0),
        y: toCenter.y + (config.endOffset?.y || 0),
      };

      // Control points (use defaults if not set)
      const cp1 = config.controlPoint1 || {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2 - 50,
      };
      const cp2 = config.controlPoint2 || {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2 - 50,
      };

      // Arrow width
      const baseWidth = config.baseWidth || 6;
      const proportional = config.proportional !== false;
      const ratio = (counter.value || 0) / maxVal;
      const width = proportional
        ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, baseWidth * (0.3 + 0.7 * ratio)))
        : baseWidth;

      // Compute display value based on displayMode
      let displayValue = counter.value || 0;
      const selectedClass = localConfig.selectedClass;
      if (selectedClass && counter.classes?.[selectedClass] !== undefined) {
        displayValue = counter.classes[selectedClass];
      } else if (selectedClass) {
        displayValue = 0; // Class not in this counter
      }

      // Apply daily average if needed
      if (localConfig.displayMode === 'average' && days > 0) {
        displayValue = Math.round(displayValue / days);
      }

      return {
        id: counter.id,
        counter,
        start,
        end,
        cp1,
        cp2,
        width,
        displayValue,
        config,
        fromCenter,
        toCenter,
      };
    }).filter(Boolean);
  }, [localCounters, zoneMap, localConfig, days]);

  // Update a counter's arrowConfig
  const updateArrowConfig = useCallback((counterId, updates) => {
    setLocalCounters(prev => prev.map(c => {
      if (c.id !== counterId) return c;
      const fromZone = zoneMap[c.from];
      const toZone = zoneMap[c.to];
      const existingConfig = c.arrowConfig || generateDefaultArrowConfig(
        getZoneCenter(fromZone),
        getZoneCenter(toZone)
      );
      return {
        ...c,
        arrowConfig: { ...existingConfig, ...updates },
      };
    }));
  }, [zoneMap]);

  // Handle mouse events for dragging
  const handleMouseDown = useCallback((e, counterId, handle) => {
    if (readOnly || !editMode) return;
    e.preventDefault();
    e.stopPropagation();
    
    const arrow = arrowData.find(a => a.id === counterId);
    if (!arrow) return;
    
    // Store initial handle position in normalized coords
    let initialPos;
    switch (handle) {
      case 'start':
        initialPos = arrow.start;
        break;
      case 'end':
        initialPos = arrow.end;
        break;
      case 'cp1':
        initialPos = arrow.cp1;
        break;
      case 'cp2':
        initialPos = arrow.cp2;
        break;
    }
    
    setDragging({ 
      counterId, 
      handle, 
      startMousePos: toNorm(getSvgPoint(e)),
      initialHandlePos: { ...initialPos },
      arrow,
    });
  }, [readOnly, editMode, getSvgPoint, toNorm, arrowData]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) {
      // Just hover detection for cursor
      return;
    }

    const pos = getSvgPoint(e);
    const normPos = toNorm(pos);
    
    // Calculate delta from start position
    const deltaX = normPos.x - dragging.startMousePos.x;
    const deltaY = normPos.y - dragging.startMousePos.y;
    
    // Apply delta to initial handle position
    const newPos = {
      x: dragging.initialHandlePos.x + deltaX,
      y: dragging.initialHandlePos.y + deltaY,
    };

    switch (dragging.handle) {
      case 'start': {
        const offset = {
          x: newPos.x - dragging.arrow.fromCenter.x,
          y: newPos.y - dragging.arrow.fromCenter.y,
        };
        updateArrowConfig(dragging.counterId, { startOffset: offset });
        break;
      }
      case 'end': {
        const offset = {
          x: newPos.x - dragging.arrow.toCenter.x,
          y: newPos.y - dragging.arrow.toCenter.y,
        };
        updateArrowConfig(dragging.counterId, { endOffset: offset });
        break;
      }
      case 'cp1':
        updateArrowConfig(dragging.counterId, { controlPoint1: newPos });
        break;
      case 'cp2':
        updateArrowConfig(dragging.counterId, { controlPoint2: newPos });
        break;
    }
  }, [dragging, getSvgPoint, toNorm, updateArrowConfig]);

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      // Persist changes
      const counter = localCounters.find(c => c.id === dragging.counterId);
      if (counter?.arrowConfig && onCounterConfigChange) {
        onCounterConfigChange(dragging.counterId, counter.arrowConfig);
      }
    }
    setDragging(null);
  }, [dragging, localCounters, onCounterConfigChange]);

  // Handle config changes
  const handleColorChange = (color) => {
    const newConfig = { ...localConfig, arrowColor: color };
    setLocalConfig(newConfig);
    onConfigChange?.(newConfig);
  };

  const handleOpacityChange = (opacity) => {
    const newConfig = { ...localConfig, arrowOpacity: opacity };
    setLocalConfig(newConfig);
    onConfigChange?.(newConfig);
  };

  const handleClassChange = (cls) => {
    const newConfig = { ...localConfig, selectedClass: cls || null };
    setLocalConfig(newConfig);
    onConfigChange?.(newConfig);
  };

  const handleDisplayModeChange = (mode) => {
    const newConfig = { ...localConfig, displayMode: mode };
    setLocalConfig(newConfig);
    onConfigChange?.(newConfig);
  };

  // Handle width/proportional changes for a specific counter
  const handleWidthChange = (counterId, baseWidth) => {
    updateArrowConfig(counterId, { baseWidth });
    const counter = localCounters.find(c => c.id === counterId);
    if (counter?.arrowConfig && onCounterConfigChange) {
      onCounterConfigChange(counterId, { ...counter.arrowConfig, baseWidth });
    }
  };

  const handleProportionalToggle = (counterId, proportional) => {
    updateArrowConfig(counterId, { proportional });
    const counter = localCounters.find(c => c.id === counterId);
    if (counter?.arrowConfig && onCounterConfigChange) {
      onCounterConfigChange(counterId, { ...counter.arrowConfig, proportional });
    }
  };

  // Generate SVG path for cubic bezier
  const getPath = (arrow) => {
    const s = toSvg(arrow.start);
    const e = toSvg(arrow.end);
    const c1 = toSvg(arrow.cp1);
    const c2 = toSvg(arrow.cp2);
    return `M ${s.x} ${s.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${e.x} ${e.y}`;
  };

  // Calculate position for label (midpoint of bezier)
  const getLabelPos = (arrow) => {
    // Approximate midpoint of cubic bezier at t=0.5
    const t = 0.5;
    const s = toSvg(arrow.start);
    const e = toSvg(arrow.end);
    const c1 = toSvg(arrow.cp1);
    const c2 = toSvg(arrow.cp2);

    const mt = 1 - t;
    const x = mt*mt*mt*s.x + 3*mt*mt*t*c1.x + 3*mt*t*t*c2.x + t*t*t*e.x;
    const y = mt*mt*mt*s.y + 3*mt*mt*t*c1.y + 3*mt*t*t*c2.y + t*t*t*e.y;
    return { x, y };
  };

  return (
    <div className="counter-flow-view">
      {/* Controls */}
      <div className="flow-controls">
        <div className="control-group">
          <label>Class:</label>
          <select
            value={localConfig.selectedClass || ''}
            onChange={(e) => handleClassChange(e.target.value)}
          >
            <option value="">All Classes (Total)</option>
            {objectClasses.map(cls => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label>Display:</label>
          <select
            value={localConfig.displayMode || 'total'}
            onChange={(e) => handleDisplayModeChange(e.target.value)}
          >
            <option value="total">Total Count</option>
            <option value="average">Daily Average</option>
          </select>
          {localConfig.displayMode === 'average' && (
            <span className="days-info">({days} days)</span>
          )}
        </div>

        <div className="control-group">
          <label>Color:</label>
          <input
            type="color"
            value={localConfig.arrowColor || '#3498db'}
            onChange={(e) => handleColorChange(e.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="control-group">
          <label>Opacity:</label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={localConfig.arrowOpacity || 0.7}
            onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
            disabled={readOnly}
          />
          <span>{Math.round((localConfig.arrowOpacity || 0.7) * 100)}%</span>
        </div>

        {!readOnly && (
          <button
            className={`btn-edit-arrows ${editMode ? 'active' : ''}`}
            disabled={saving}
            onClick={async () => {
              if (editMode && onSave) {
                // Exiting edit mode - save changes
                setSaving(true);
                try {
                  await onSave();
                } finally {
                  setSaving(false);
                }
              }
              setEditMode(!editMode);
              if (editMode) setSelectedArrow(null); // Reset selection when exiting
            }}
          >
            {saving ? 'Saving...' : editMode ? '✓ Done Editing' : '✎ Edit Arrows'}
          </button>
        )}

        {/* Arrow selector dropdown (only in edit mode) */}
        {editMode && (
          <div className="control-group arrow-selector">
            <label>Edit:</label>
            <select
              value={selectedArrow || ''}
              onChange={(e) => setSelectedArrow(e.target.value || null)}
            >
              <option value="">All Arrows</option>
              {arrowData.map(arrow => (
                <option key={arrow.id} value={arrow.id}>
                  {arrow.counter.from} → {arrow.counter.to}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* SVG Overlay */}
      <div
        ref={containerRef}
        className="flow-canvas-container"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {snapshot && (
          <img
            src={snapshot}
            alt="Camera view"
            className="flow-backdrop"
            draggable={false}
          />
        )}

        <svg
          className="flow-svg"
          viewBox={`0 0 ${imgSize.width} ${imgSize.height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Arrowhead marker definitions - one per arrow with dampened scaling */}
          <defs>
            {arrowData.map(arrow => {
              // Dampen the arrowhead growth: use sqrt to slow scaling
              const arrowheadScale = 0.6 + Math.sqrt(arrow.width / 6) * 0.4;
              const headWidth = 6 * arrowheadScale;
              const headHeight = 4 * arrowheadScale;
              return (
                <marker
                  key={`marker-${arrow.id}`}
                  id={`arrowhead-${arrow.id}`}
                  markerWidth={headWidth}
                  markerHeight={headHeight}
                  refX={headWidth - 0.5}
                  refY={headHeight / 2}
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path
                    d={`M0,0 L0,${headHeight} L${headWidth},${headHeight / 2} z`}
                    fill={localConfig.arrowColor || '#3498db'}
                  />
                </marker>
              );
            })}
          </defs>

          {/* Draw arrows */}
          {arrowData.map(arrow => {
            // Dim non-selected arrows when a specific arrow is selected for editing
            const isSelected = !selectedArrow || selectedArrow === arrow.id;
            const dimOpacity = editMode && !isSelected ? 0.25 : 1;
            const arrowOpacity = (localConfig.arrowOpacity || 0.7) * dimOpacity;

            return (
            <g key={arrow.id} className={`arrow-group ${!isSelected ? 'dimmed' : ''}`}>
              {/* Main path */}
              <path
                d={getPath(arrow)}
                fill="none"
                stroke={localConfig.arrowColor || '#3498db'}
                strokeWidth={arrow.width}
                strokeOpacity={arrowOpacity}
                strokeLinecap="round"
                markerEnd={`url(#arrowhead-${arrow.id})`}
                className="arrow-path"
              />

              {/* Count label */}
              {(() => {
                const pos = getLabelPos(arrow);
                return (
                  <g className="arrow-label" opacity={dimOpacity}>
                    <rect
                      x={pos.x - 25}
                      y={pos.y - 12}
                      width="50"
                      height="24"
                      rx="4"
                      fill="rgba(0,0,0,0.75)"
                    />
                    <text
                      x={pos.x}
                      y={pos.y + 5}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="14"
                      fontWeight="600"
                    >
                      {arrow.displayValue.toLocaleString()}
                    </text>
                  </g>
                );
              })()}

              {/* Edit handles (only in edit mode and for selected arrow) */}
              {editMode && isSelected && (
                <>
                  {/* Start handle (green) */}
                  <circle
                    cx={toSvg(arrow.start).x}
                    cy={toSvg(arrow.start).y}
                    r={HANDLE_SIZE}
                    fill="#2ecc71"
                    stroke="#fff"
                    strokeWidth="2"
                    className="drag-handle start-handle"
                    onMouseDown={(e) => handleMouseDown(e, arrow.id, 'start')}
                    style={{ cursor: 'grab' }}
                  />

                  {/* End handle (red) */}
                  <circle
                    cx={toSvg(arrow.end).x}
                    cy={toSvg(arrow.end).y}
                    r={HANDLE_SIZE}
                    fill="#e74c3c"
                    stroke="#fff"
                    strokeWidth="2"
                    className="drag-handle end-handle"
                    onMouseDown={(e) => handleMouseDown(e, arrow.id, 'end')}
                    style={{ cursor: 'grab' }}
                  />

                  {/* Control point 1 handle (blue square) */}
                  <rect
                    x={toSvg(arrow.cp1).x - HANDLE_SIZE/2}
                    y={toSvg(arrow.cp1).y - HANDLE_SIZE/2}
                    width={HANDLE_SIZE}
                    height={HANDLE_SIZE}
                    fill="#3498db"
                    stroke="#fff"
                    strokeWidth="2"
                    className="drag-handle cp-handle"
                    onMouseDown={(e) => handleMouseDown(e, arrow.id, 'cp1')}
                    style={{ cursor: 'grab' }}
                  />

                  {/* Control point 2 handle (blue square) */}
                  <rect
                    x={toSvg(arrow.cp2).x - HANDLE_SIZE/2}
                    y={toSvg(arrow.cp2).y - HANDLE_SIZE/2}
                    width={HANDLE_SIZE}
                    height={HANDLE_SIZE}
                    fill="#9b59b6"
                    stroke="#fff"
                    strokeWidth="2"
                    className="drag-handle cp-handle"
                    onMouseDown={(e) => handleMouseDown(e, arrow.id, 'cp2')}
                    style={{ cursor: 'grab' }}
                  />

                  {/* Guide lines from handles to control points */}
                  <line
                    x1={toSvg(arrow.start).x}
                    y1={toSvg(arrow.start).y}
                    x2={toSvg(arrow.cp1).x}
                    y2={toSvg(arrow.cp1).y}
                    stroke="#3498db"
                    strokeWidth="1"
                    strokeDasharray="4,4"
                    opacity="0.5"
                  />
                  <line
                    x1={toSvg(arrow.end).x}
                    y1={toSvg(arrow.end).y}
                    x2={toSvg(arrow.cp2).x}
                    y2={toSvg(arrow.cp2).y}
                    stroke="#9b59b6"
                    strokeWidth="1"
                    strokeDasharray="4,4"
                    opacity="0.5"
                  />
                </>
              )}
            </g>
          );
          })}
        </svg>
      </div>

      {/* Arrow width controls (shown in edit mode) */}
      {editMode && arrowData.length > 0 && (
        <div className="arrow-width-controls">
          <h4>Arrow Width Settings</h4>
          <table className="width-settings-table">
            <thead>
              <tr>
                <th>Direction</th>
                <th>Base Width</th>
                <th>Proportional</th>
              </tr>
            </thead>
            <tbody>
              {arrowData.map(arrow => (
                <tr key={arrow.id}>
                  <td>{arrow.counter.from} → {arrow.counter.to}</td>
                  <td>
                    <input
                      type="range"
                      min={MIN_WIDTH}
                      max={MAX_WIDTH}
                      value={arrow.config.baseWidth || 6}
                      onChange={(e) => handleWidthChange(arrow.id, parseInt(e.target.value, 10))}
                    />
                    <span>{arrow.config.baseWidth || 6}px</span>
                  </td>
                  <td>
                    <label>
                      <input
                        type="checkbox"
                        checked={arrow.config.proportional !== false}
                        onChange={(e) => handleProportionalToggle(arrow.id, e.target.checked)}
                      />
                      Scale by count
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
