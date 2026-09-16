import { useEffect, useRef, useState, useMemo } from 'react';
import useContainerFit from '../hooks/useContainerFit';
import './DwellHeatmap.css';

// Grid resolution for density accumulation
const GRID_W = 200;
const GRID_H = 200;

// Gaussian spread for path-points mode
const SPREAD   = 8;
const SIGMA2   = (SPREAD / 2.5) ** 2;

// A single idle point contributes weight 1.0 at its center (see addPoint).
// Opacity saturates at this weight so every qualifying point is visible,
// not just cells that are "hot" relative to the busiest spot in the dataset.
const POINT_VISIBILITY = 1.0;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Pretty-print seconds */
function fmtTime(sec) {
  if (sec == null) return '—';
  const s = Math.round(sec);
  if (s < 60)  return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

// Colour scale for "how long objects idle here": blue (short) -> yellow -> red (long)
function idleColor(t) {
  t = clamp(t, 0, 1);
  if (t < 0.5) {
    const k = t / 0.5;
    return { r: Math.round(40 + k * 215), g: Math.round(100 + k * 155), b: Math.round(255 - k * 255) };
  }
  const k = (t - 0.5) / 0.5;
  return { r: 255, g: Math.round(255 - k * 215), b: 0 };
}

// ---------------------------------------------------------------------------

function DwellHeatmap({ pathData, backgroundImage, loading, filters }) {
  const canvasRef     = useRef(null);
  const containerRef  = useRef(null);
  const [imgAspect, setImgAspect]         = useState(null);
  const [imgNaturalSize, setImgNaturalSize] = useState(null);
  const [opacity, setOpacity]             = useState(0.65);

  const fitted = useContainerFit(containerRef, imgAspect);

  /* ---------- query-level minIdle ---------- */
  const queryMinIdle = useMemo(() => {
    const v = filters?.minIdle;
    return (v !== undefined && v !== null && v !== '' && parseFloat(v) > 0) ? parseFloat(v) : 0;
  }, [filters]);

  /* ---------- idle points meeting the query's minIdle ---------- */
  const idlePoints = useMemo(() => {
    if (!pathData || pathData.length === 0) return [];
    const pts = [];
    pathData.forEach((ev) => {
      if (!ev.path) return;
      ev.path.slice(0, -1).forEach((pt) => {
        if (!(pt.d > 0) || pt.d < queryMinIdle) return;
        pts.push(pt);
      });
    });
    return pts;
  }, [pathData, queryMinIdle]);

  /* ---------- idle-time range from dataset ---------- */
  const idleRange = useMemo(() => {
    if (idlePoints.length === 0) return { min: queryMinIdle, max: queryMinIdle + 60, total: 0 };

    let hi = 0;
    idlePoints.forEach((pt) => { hi = Math.max(hi, pt.d); });
    if (hi === 0) hi = queryMinIdle + 60;

    return { min: queryMinIdle, max: Math.ceil(hi), total: idlePoints.length };
  }, [idlePoints, queryMinIdle]);

  // Colour scale: idleRange.min (blue, = the query's minIdle floor) to
  // colorMax (red, 95th-percentile duration), both fixed per query.
  const colorMax = useMemo(() => {
    const durations = idlePoints.map((pt) => pt.d);
    if (durations.length === 0) return idleRange.max;
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)];
    return Math.max(p95, idleRange.min + 1);
  }, [idlePoints, idleRange.min, idleRange.max]);

  /* ---------- clear canvas when image changes ---------- */
  useEffect(() => {
    if (!backgroundImage) {
      setImgAspect(null);
      setImgNaturalSize(null);
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, [backgroundImage]);

  /* ---------- render heatmap ---------- */
  useEffect(() => {
    if (!imgNaturalSize || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');

    canvas.width  = fitted.width  || imgNaturalSize.width;
    canvas.height = fitted.height || imgNaturalSize.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (idlePoints.length === 0) return;

    // Accumulate two grids: how often objects idle here (count), and for
    // how long (duration-weighted). Together these drive a dual-channel
    // heatmap — opacity = frequency, colour = average idle duration.
    const heatCount = new Float32Array(GRID_W * GRID_H);
    const heatDur   = new Float32Array(GRID_W * GRID_H);

    const addPoint = (normX, normY, duration) => {
      const gx = Math.round(normX * (GRID_W - 1));
      const gy = Math.round(normY * (GRID_H - 1));
      for (let dy = -SPREAD; dy <= SPREAD; dy++) {
        for (let dx = -SPREAD; dx <= SPREAD; dx++) {
          const nx = gx + dx, ny = gy + dy;
          if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H) {
            const w = Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA2));
            const idx = ny * GRID_W + nx;
            heatCount[idx] += w;
            heatDur[idx]   += w * duration;
          }
        }
      }
    };

    idlePoints.forEach((pt) => {
      addPoint(pt.x / 1000, pt.y / 1000, pt.d);
    });

    let hasData = false;
    for (let i = 0; i < heatCount.length; i++) if (heatCount[i] > 0) { hasData = true; break; }
    if (!hasData) return;

    // Colour scale: fixed from idleRange.min (blue) to colorMax (red).
    const durationSpan = Math.max(1, colorMax - idleRange.min);

    const imageData = new ImageData(GRID_W, GRID_H);
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      const count = heatCount[i];
      if (count <= 0) continue;
      const edge = clamp(count / POINT_VISIBILITY, 0, 1);
      const avgDur = heatDur[i] / count;
      const durT = clamp((avgDur - idleRange.min) / durationSpan, 0, 1);
      const { r, g, b } = idleColor(durT);
      const a = Math.round(edge * opacity * 255);
      imageData.data[i * 4 + 0] = r;
      imageData.data[i * 4 + 1] = g;
      imageData.data[i * 4 + 2] = b;
      imageData.data[i * 4 + 3] = a;
    }

    const offscreen    = document.createElement('canvas');
    offscreen.width    = GRID_W;
    offscreen.height   = GRID_H;
    offscreen.getContext('2d').putImageData(imageData, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);

  }, [imgNaturalSize, idlePoints, opacity, idleRange.min, colorMax, fitted]);

  return (
    <div className="dwell-heatmap">

      {/* ---- Controls ---- */}
      <div className="heatmap-controls">

        {/* Stats badge */}
        <div className="control-group stats-group">
          <label title="Number of points with idle time meeting the Min Idle filter.">Idle Points</label>
          <div className="stats-badge">
            <span className="stats-count">{idleRange.total}</span>
          </div>
        </div>

        {/* Fixed query time window */}
        <div className="control-group window-group">
          <label title="The Dwell Heatmap always queries the last 30 days of data.">Time Window</label>
          <div className="window-badge">Last 30 days</div>
        </div>

        {/* Overlay opacity */}
        <div className="control-group">
          <label>Overlay: {Math.round(opacity * 100)}%</label>
          <input
            type="range" min="0.1" max="1" step="0.05"
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            title="Opacity of the dwell-zone overlay."
          />
        </div>
      </div>

      {/* ---- Legend ---- */}
      <div className="dwell-legend">
        <div className="legend-gradient-wrap">
          <div className="legend-gradient" />
          <div className="range-labels">
            <span>{fmtTime(idleRange.min)}</span>
            <span>{fmtTime(colorMax)}+</span>
          </div>
        </div>
        <span className="legend-label">
          Colour = average idle time at that spot ({fmtTime(idleRange.min)} -
          {' '}{fmtTime(colorMax)}+). Opacity = how often an object idled here
          for at least {fmtTime(queryMinIdle)} (brighter where it happened more often).
        </span>
      </div>

      {/* ---- Canvas ---- */}
      <div className="canvas-container" ref={containerRef}>
        {loading && <div className="loading">Loading…</div>}
        {!backgroundImage && !loading && <div className="loading">Loading camera view…</div>}
        {backgroundImage && (
          <div
            className="canvas-wrapper"
            style={{
              width: fitted.width || '100%',
              height: fitted.height || undefined,
            }}
          >
            <img
              src={backgroundImage}
              alt="Camera view"
              className="background-img"
              style={{ height: fitted.height ? '100%' : 'auto' }}
              onLoad={(e) => {
                setImgAspect(e.target.naturalWidth / e.target.naturalHeight);
                setImgNaturalSize({ width: e.target.naturalWidth, height: e.target.naturalHeight });
              }}
            />
            <canvas
              ref={canvasRef}
              className="heatmap-canvas"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default DwellHeatmap;
