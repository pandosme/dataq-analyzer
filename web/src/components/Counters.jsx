import { useState, useEffect, useRef, useCallback } from 'react';
import CameraSelector from './CameraSelector';
import CounterFlowView from './CounterFlowView';
import { camerasAPI, pathsAPI, countersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Counters.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const ZONE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
const ZONE_COLORS_FILL   = ['#e74c3c50', '#3498db50', '#2ecc7150', '#f39c1250', '#9b59b650', '#1abc9c50'];
const ZONE_COLORS_BORDER = ['#e74c3c',   '#3498db',   '#2ecc71',   '#f39c12',   '#9b59b6',   '#1abc9c'];
const ALL_CLASSES = ['Human', 'Car', 'Truck', 'Bus', 'Bike', 'Vehicle', 'Undefined'];

// Zone-editor hit-test constants
const HANDLE_HIT  = 12; // px click radius around a handle
const HANDLE_DRAW = 5;  // px half-size of drawn handle square
const HANDLE_KEYS = ['nw','n','ne','e','se','s','sw','w'];
const HANDLE_CURSORS = { nw:'nw-resize', n:'n-resize', ne:'ne-resize', e:'e-resize', se:'se-resize', s:'s-resize', sw:'sw-resize', w:'w-resize', body:'move' };

function generatePairs(zones) {
  const pairs = [];
  for (let i = 0; i < zones.length; i++)
    for (let j = 0; j < zones.length; j++)
      if (i !== j) pairs.push({ id: `${zones[i].label}->${zones[j].label}`, from: zones[i].label, to: zones[j].label, name: '', enabled: true });
  return pairs;
}

function totalCount(set) {
  return (set.counters || []).filter(c => c.enabled).reduce((s, c) => s + (c.value || 0), 0);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

// days is now tracked by the server (distinct days with path data)

// ─── Zone Editor Canvas ───────────────────────────────────────────────────────
function ZoneEditor({ snapshot, zones, paths, onChange, readOnly }) {
  const canvasRef   = useRef(null);
  const imgRef      = useRef(null);
  const zonesRef    = useRef(zones);     // always current, readable from handlers without stale closure
  const pathsRef    = useRef(paths);
  const selectedRef = useRef(null);      // selected zone index
  const dragRef     = useRef(null);      // active drag state
  const [cursor, setCursor] = useState('crosshair');

  // Keep refs in sync with props (must be in effect, not render body)
  useEffect(() => { zonesRef.current = zones; }, [zones]);
  useEffect(() => { pathsRef.current = paths; }, [paths]);

  // ── Canvas helpers ────────────────────────────────────────────────────────
  const getCanvasPx = useCallback((e) => {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width  / r.width),
      y: (e.clientY - r.top)  * (canvas.height / r.height),
    };
  }, []);

  const toNorm = useCallback((px, py) => {
    const canvas = canvasRef.current;
    return { x: Math.round((px / canvas.width) * 1000), y: Math.round((py / canvas.height) * 1000) };
  }, []);

  // Returns the 8 handle pixel positions for a zone rect
  const getHandlePts = useCallback((rect) => {
    const canvas = canvasRef.current;
    if (!canvas) return {};
    const px1 = (rect.x1 / 1000) * canvas.width,  py1 = (rect.y1 / 1000) * canvas.height;
    const px2 = (rect.x2 / 1000) * canvas.width,  py2 = (rect.y2 / 1000) * canvas.height;
    const mx = (px1 + px2) / 2, my = (py1 + py2) / 2;
    return { nw:{x:px1,y:py1}, n:{x:mx,y:py1}, ne:{x:px2,y:py1}, e:{x:px2,y:my}, se:{x:px2,y:py2}, s:{x:mx,y:py2}, sw:{x:px1,y:py2}, w:{x:px1,y:my} };
  }, []);

  // Hit-test mouse pos against all zones; returns { zoneIdx, handle, cursor } or null
  const hitTest = useCallback((mx, my) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const zs = zonesRef.current;
    for (let i = zs.length - 1; i >= 0; i--) {
      const pts = getHandlePts(zs[i].rect);
      for (const key of HANDLE_KEYS) {
        const h = pts[key];
        if (Math.abs(mx - h.x) <= HANDLE_HIT && Math.abs(my - h.y) <= HANDLE_HIT)
          return { zoneIdx: i, handle: key, cursor: HANDLE_CURSORS[key] };
      }
      // Body hit
      const px1 = (zs[i].rect.x1 / 1000) * canvas.width,  py1 = (zs[i].rect.y1 / 1000) * canvas.height;
      const px2 = (zs[i].rect.x2 / 1000) * canvas.width,  py2 = (zs[i].rect.y2 / 1000) * canvas.height;
      if (mx >= px1 && mx <= px2 && my >= py1 && my <= py2)
        return { zoneIdx: i, handle: 'body', cursor: 'move' };
    }
    return null;
  }, [getHandlePts]);

  // Apply a drag delta to a rect given the handle type
  const applyDrag = useCallback((handle, origRect, dx, dy) => {
    const canvas = canvasRef.current;
    const ndx = (dx / canvas.width)  * 1000;
    const ndy = (dy / canvas.height) * 1000;
    let { x1, y1, x2, y2 } = origRect;
    if (handle === 'body') { x1 += ndx; x2 += ndx; y1 += ndy; y2 += ndy; }
    else {
      if (handle.includes('w')) x1 += ndx;
      if (handle.includes('e')) x2 += ndx;
      if (handle.includes('n')) y1 += ndy;
      if (handle.includes('s')) y2 += ndy;
    }
    const MIN = 40;
    // Clamp to canvas bounds
    x1 = Math.max(0, Math.min(x1, 1000)); y1 = Math.max(0, Math.min(y1, 1000));
    x2 = Math.max(0, Math.min(x2, 1000)); y2 = Math.max(0, Math.min(y2, 1000));
    // Enforce minimum size (don't let a side cross the other)
    if (x2 - x1 < MIN) { if (handle.includes('w') && !handle.includes('e')) x1 = x2 - MIN; else x2 = x1 + MIN; }
    if (y2 - y1 < MIN) { if (handle.includes('n') && !handle.includes('s')) y1 = y2 - MIN; else y2 = y1 + MIN; }
    // Re-clamp after min-size enforcement
    x1 = Math.max(0, x1); y1 = Math.max(0, y1);
    x2 = Math.min(1000, x2); y2 = Math.min(1000, y2);
    return { x1:Math.round(x1), y1:Math.round(y1), x2:Math.round(x2), y2:Math.round(y2) };
  }, []);

  // ── Redraw (reads from refs — no stale-closure issues) ────────────────────
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;
    canvas.width  = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    // Path dots overlay (birth → last point)
    const ps = pathsRef.current;
    if (ps?.length) {
      ctx.globalAlpha = 0.35;
      ps.forEach(ev => {
        const bx = ev.bx ?? ev.path?.[0]?.x ?? null;
        const by = ev.by ?? ev.path?.[0]?.y ?? null;
        const lp = ev.path?.[ev.path.length - 1];
        if (bx == null || !lp) return;
        const x1 = (bx / 1000) * canvas.width,  y1 = (by / 1000) * canvas.height;
        const x2 = (lp.x / 1000) * canvas.width, y2 = (lp.y / 1000) * canvas.height;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.fillStyle = '#ffff00';
        ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    // Zones
    const zs = zonesRef.current;
    zs.forEach((z, i) => {
      const { x1, y1, x2, y2 } = z.rect;
      const px1 = (x1 / 1000) * canvas.width,  py1 = (y1 / 1000) * canvas.height;
      const px2 = (x2 / 1000) * canvas.width,  py2 = (y2 / 1000) * canvas.height;
      const selected = selectedRef.current === i;
      ctx.fillStyle   = ZONE_COLORS_FILL[i];
      ctx.strokeStyle = ZONE_COLORS_BORDER[i];
      ctx.lineWidth   = selected ? 3 : 2;
      ctx.fillRect(px1, py1, px2 - px1, py2 - py1);
      ctx.strokeRect(px1, py1, px2 - px1, py2 - py1);
      ctx.fillStyle = ZONE_COLORS_BORDER[i];
      ctx.font = `bold ${Math.max(14, Math.round(canvas.width / 40))}px sans-serif`;
      ctx.fillText(z.label, px1 + 6, py1 + 20);

      // Draw resize handles on selected zone
      if (selected) {
        const pts = getHandlePts(z.rect);
        ctx.fillStyle   = '#ffffff';
        ctx.strokeStyle = ZONE_COLORS_BORDER[i];
        ctx.lineWidth   = 1.5;
        Object.values(pts).forEach(({ x, y }) => {
          ctx.fillRect(x - HANDLE_DRAW, y - HANDLE_DRAW, HANDLE_DRAW * 2, HANDLE_DRAW * 2);
          ctx.strokeRect(x - HANDLE_DRAW, y - HANDLE_DRAW, HANDLE_DRAW * 2, HANDLE_DRAW * 2);
        });
      }
    });

    // In-progress new-zone rect
    const drag = dragRef.current;
    if (drag?.type === 'new' && drag.curRect) {
      const { x, y, w, h } = drag.curRect;
      ctx.setLineDash([6, 3]);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }, [getHandlePts]); // getHandlePts is stable; everything else is via refs

  // Load image
  useEffect(() => {
    if (!snapshot) { imgRef.current = null; return; }
    const img = new Image();
    img.onload = () => { imgRef.current = img; redraw(); };
    img.src = snapshot;
  }, [snapshot, redraw]);

  // Redraw when zones/paths change from outside (e.g. zone deleted)
  useEffect(() => { redraw(); }, [zones, paths, redraw]);

  // ── Mouse events ──────────────────────────────────────────────────────────
  const onMouseMove = useCallback((e) => {
    const pos = getCanvasPx(e);
    const drag = dragRef.current;

    if (drag) {
      if (drag.type === 'new') {
        const s = drag.startPx;
        drag.curRect = { x: Math.min(s.x, pos.x), y: Math.min(s.y, pos.y), w: Math.abs(pos.x - s.x), h: Math.abs(pos.y - s.y) };
        redraw();
      } else if (drag.type === 'zone') {
        const dx = pos.x - drag.startPx.x;
        const dy = pos.y - drag.startPx.y;
        const newRect = applyDrag(drag.handle, drag.origRect, dx, dy);
        const updated = zonesRef.current.map((z, i) => i === drag.zoneIdx ? { ...z, rect: newRect } : z);
        onChange(updated); // triggers re-render → zones prop changes → useEffect redraws
      }
      return;
    }

    // Hover only — update cursor
    const hit = hitTest(pos.x, pos.y);
    setCursor(hit ? hit.cursor : (zonesRef.current.length < 6 ? 'crosshair' : 'default'));
  }, [getCanvasPx, hitTest, applyDrag, onChange, redraw]);

  const onMouseDown = useCallback((e) => {
    const pos = getCanvasPx(e);
    e.preventDefault();
    const hit = hitTest(pos.x, pos.y);
    if (hit) {
      selectedRef.current = hit.zoneIdx;
      dragRef.current = { type:'zone', zoneIdx:hit.zoneIdx, handle:hit.handle, startPx:pos, origRect:{ ...zonesRef.current[hit.zoneIdx].rect } };
      setCursor(hit.cursor);
      redraw();
    } else {
      // Start drawing new zone in empty space
      if (zonesRef.current.length >= 6) return;
      selectedRef.current = null;
      dragRef.current = { type:'new', startPx:pos, curRect:null };
      setCursor('crosshair');
      redraw();
    }
  }, [getCanvasPx, hitTest, redraw]);

  const onMouseUp = useCallback((e) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.type === 'new') {
      const pos = getCanvasPx(e);
      const s   = drag.startPx;
      if (Math.abs(pos.x - s.x) > 20 && Math.abs(pos.y - s.y) > 20) {
        const n1 = toNorm(Math.min(s.x, pos.x), Math.min(s.y, pos.y));
        const n2 = toNorm(Math.max(s.x, pos.x), Math.max(s.y, pos.y));
        const newZones = [...zonesRef.current, { label: ZONE_LABELS[zonesRef.current.length], name:'', rect:{ x1:n1.x, y1:n1.y, x2:n2.x, y2:n2.y } }];
        selectedRef.current = newZones.length - 1;
        onChange(newZones);
      }
    }
    // Restore cursor based on final position
    const pos = getCanvasPx(e);
    const hit = hitTest(pos.x, pos.y);
    setCursor(hit ? hit.cursor : (zonesRef.current.length < 6 ? 'crosshair' : 'default'));
    redraw();
  }, [getCanvasPx, toNorm, hitTest, onChange, redraw]);

  const onMouseLeave = useCallback(() => {
    dragRef.current = null;
    setCursor('crosshair');
    redraw();
  }, [redraw]);

  return (
    <canvas
      ref={canvasRef}
      className="zone-canvas"
      onMouseDown={readOnly ? undefined : onMouseDown}
      onMouseMove={readOnly ? undefined : onMouseMove}
      onMouseUp={readOnly ? undefined : onMouseUp}
      onMouseLeave={readOnly ? undefined : onMouseLeave}
      style={{ cursor: readOnly ? 'default' : cursor }}
    />
  );
}

// ─── Counter List ─────────────────────────────────────────────────────────────
function CounterList({ sets, loading, onRefresh, onCreate, onSelect, readOnly }) {
  return (
    <div className="counter-list">
      <div className="counter-list-header">
        <h2>Counter Sets</h2>
        <div className="counter-list-actions">
          <button className="btn-secondary" onClick={onRefresh} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          {!readOnly && <button className="btn-primary" onClick={onCreate}>+ New Counter Set</button>}
        </div>
      </div>

      {!loading && sets.length === 0 && (
        <div className="empty-state">
          <p>No counter sets defined yet.</p>
          {!readOnly && <button className="btn-primary" onClick={onCreate}>Create your first Counter Set</button>}
        </div>
      )}

      {sets.length > 0 && (
        <table className="counter-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Camera</th>
              <th>Zones</th>
              <th>Total Count</th>
              <th>Days Active</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sets.map(s => (
              <tr key={s._id} className="clickable-row" onClick={() => onSelect(s)}>
                <td><strong>{s.name}</strong></td>
                <td><code>{s.serial}</code></td>
                <td>{s.zones.map(z => z.label).join(' ')}</td>
                <td className="count-cell">{totalCount(s).toLocaleString()}</td>
                <td>{s.days ?? 0}</td>
                <td>
                  <span className={`backfill-badge backfill-${s.backfill?.status || 'idle'}`}
                    title={(!s.backfill?.status || s.backfill?.status === 'idle')
                      ? 'No backfill — counter only counts new events.'
                      : s.backfill?.status === 'running'
                      ? 'Backfill in progress — counting historical path data.'
                      : s.backfill?.status === 'complete'
                      ? 'Backfill applied — historical data has been counted.'
                      : s.backfill?.status === 'failed'
                      ? `Backfill failed: ${s.backfill.error || 'unknown error'}`
                      : ''}
                  >
                    {(!s.backfill?.status || s.backfill?.status === 'idle') && 'No backfill'}
                    {s.backfill?.status === 'running' &&
                      `Backfill${s.backfill.totalPaths > 0
                        ? ` ${Math.round(s.backfill.processedPaths / s.backfill.totalPaths * 100)}%`
                        : '...'}`}
                    {s.backfill?.status === 'complete' && 'Backfill'}
                    {s.backfill?.status === 'failed' && 'Backfill failed'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Counter Detail (merged view + edit) ─────────────────────────────────────
function CounterDetail({ set: initialSet, onBack, onChanged, onDelete, readOnly }) {
  const [set, setSet]                     = useState(initialSet);
  const [name, setName]                   = useState(initialSet.name);
  const [zones, setZones]                 = useState(initialSet.zones.map(z => ({ ...z, rect: { ...z.rect } })));
  const [objectClasses, setObjectClasses] = useState([...(initialSet.objectClasses || [])]);
  const [counters, setCounters]           = useState([]);
  const [mqttEnabled, setMqttEnabled]     = useState(!!(initialSet.mqtt?.enabled || initialSet.mqtt?.topic));
  const [mqttTopic, setMqttTopic]         = useState(initialSet.mqtt?.topic || '');
  const [mqttInterval, setMqttInterval]   = useState(initialSet.mqtt?.intervalSeconds || 60);
  const [snapshot, setSnapshot]           = useState(null);
  const [paths, setPaths]                 = useState([]);
  const [showPaths, setShowPaths]         = useState(false);
  const [backfill, setBackfill]           = useState(initialSet.backfill);
  const [flowViewConfig, setFlowViewConfig] = useState(initialSet.flowViewConfig || {
    arrowColor: '#3498db',
    arrowOpacity: 0.7,
    selectedClass: null,
    displayMode: 'total',
  });
  const [busy, setBusy]                   = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [dirty, setDirty]                = useState(false);
  const [cameraLabels, setCameraLabels]  = useState(ALL_CLASSES);
  const pollRef    = useRef(null);
  const initialRef = useRef(initialSet);
  const [saveError, setSaveError] = useState(null);

  // Track changes for dirty state
  useEffect(() => {
    const init = initialRef.current;
    const changed =
      name !== init.name ||
      mqttEnabled !== !!(init.mqtt?.enabled || init.mqtt?.topic) ||
      mqttTopic !== (init.mqtt?.topic || '') ||
      mqttInterval !== (init.mqtt?.intervalSeconds || 60) ||
      JSON.stringify(objectClasses.sort()) !== JSON.stringify([...(init.objectClasses || [])].sort()) ||
      JSON.stringify(zones.map(z => ({ label: z.label, name: z.name, rect: z.rect }))) !==
        JSON.stringify((init.zones || []).map(z => ({ label: z.label, name: z.name, rect: z.rect }))) ||
      JSON.stringify(counters.map(c => ({ id: c.id, name: c.name, enabled: c.enabled }))) !==
        JSON.stringify((init.counters || []).map(c => ({ id: c.id, name: c.name, enabled: c.enabled })));
    setDirty(changed);
  }, [name, zones, objectClasses, counters, mqttEnabled, mqttTopic, mqttInterval]);

  // Robust snapshot loader
  const toDataUrl = (raw) => {
    if (!raw) return null;
    if (raw.startsWith('data:')) return raw;
    return `data:image/jpeg;base64,${raw}`;
  };
  const extractImage = (obj) => toDataUrl(obj?.image ?? obj?.base64Image ?? null);

  // Load snapshot
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snapResp = await camerasAPI.getSnapshot(set.serial);
        if (!cancelled) {
          let img = extractImage(snapResp?.data) || extractImage(snapResp);
          if (!img) {
            const camerasResp = await camerasAPI.getAll().catch(() => null);
            const cameras = camerasResp?.data || camerasResp || [];
            const cam = (Array.isArray(cameras) ? cameras : []).find(c => c.serialNumber === set.serial);
            img = extractImage(cam?.snapshot);
          }
          if (img) setSnapshot(img);
        }
      } catch {} // eslint-disable-line no-empty
    })();
    return () => { cancelled = true; };
  }, [set.serial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load camera-specific labels
  useEffect(() => {
    camerasAPI.getAll().then(res => {
      const cameras = res?.data || res || [];
      const cam = (Array.isArray(cameras) ? cameras : []).find(c => c.serialNumber === set.serial);
      if (cam?.labels?.length) setCameraLabels(cam.labels);
    }).catch(() => {});
  }, [set.serial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load paths on demand when toggle is enabled
  useEffect(() => {
    if (!showPaths) { setPaths([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await pathsAPI.query({ serial: set.serial, class: objectClasses, limit: 500 });
        const events = res?.data || res || [];
        if (!cancelled && events.length) setPaths(events);
      } catch {} // eslint-disable-line no-empty
    })();
    return () => { cancelled = true; };
  }, [showPaths, set.serial, objectClasses]);

  // Initialize & regenerate counters when zones change
  useEffect(() => {
    if (zones.length >= 2) {
      const newPairs = generatePairs(zones);
      const merged = newPairs.map(p => {
        const prev = counters.find(c => c.id === p.id);
        const existing = set.counters.find(c => c.id === p.id);
        return {
          ...p,
          name: prev?.name ?? existing?.name ?? '',
          enabled: prev?.enabled ?? existing?.enabled ?? true,
          value: existing?.value ?? 0,
          classes: existing?.classes ?? {},
          lastReset: existing?.lastReset ?? null,
          arrowConfig: prev?.arrowConfig ?? existing?.arrowConfig ?? null,
        };
      });
      setCounters(merged);
    } else {
      setCounters([]);
    }
  }, [zones]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll backfill while running
  useEffect(() => {
    if (backfill?.status === 'running') {
      pollRef.current = setInterval(async () => {
        const bf = await countersAPI.getBackfill(set._id);
        setBackfill(bf);
        if (bf?.status !== 'running') {
          clearInterval(pollRef.current);
          const updated = await countersAPI.get(set._id);
          if (updated) {
            setSet(updated);
            setBackfill(updated.backfill);
            initialRef.current = updated;
            setName(updated.name);
            setZones(updated.zones.map(z => ({ ...z, rect: { ...z.rect } })));
            setObjectClasses([...(updated.objectClasses || [])]);
            setMqttEnabled(!!(updated.mqtt?.enabled || updated.mqtt?.topic));
            setMqttTopic(updated.mqtt?.topic || '');
            setMqttInterval(updated.mqtt?.intervalSeconds || 60);
            onChanged(updated);
          }
        }
      }, 1500);
    }
    return () => clearInterval(pollRef.current);
  }, [backfill?.status, set._id, onChanged]);

  const handleSave = async () => {
    if (zones.length < 2 || objectClasses.length === 0) return;
    setBusy(true);
    setSaveError(null);
    try {
      // Detect if object classes changed → needs recount
      const origClasses = [...(initialRef.current.objectClasses || [])].sort().join(',');
      const currClasses = [...objectClasses].sort().join(',');
      const classesChanged = origClasses !== currClasses;
      const updated = await countersAPI.update(set._id, {
        name,
        zones,
        objectClasses,
        counters: counters.map(c => ({ id: c.id, name: c.name, enabled: c.enabled, arrowConfig: c.arrowConfig })),
        flowViewConfig,
        mqtt: { enabled: mqttEnabled && !!mqttTopic, topic: mqttTopic, intervalSeconds: mqttInterval },
        recount: classesChanged,
      });
      if (updated) {
        setSet(updated);
        setBackfill(updated.backfill);
        initialRef.current = updated;
        setDirty(false);
        onChanged(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      setSaveError(err?.response?.data?.error || err.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this Counter Set? This cannot be undone.')) return;
    setDeleting(true);
    setSaveError(null);
    try {
      await countersAPI.delete(set._id);
      onDelete(set._id);
    } catch (err) {
      setSaveError(err?.response?.data?.error || err.message || 'Delete failed');
      setDeleting(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset all counters to 0? This only clears current counts.')) return;
    setBusy(true);
    setSaveError(null);
    try {
      const updated = await countersAPI.resetAll(set._id);
      if (updated) {
        setSet(updated);
        initialRef.current = updated;
        // Refresh the displayed counter rows with the reset values (value=0, classes={})
        setCounters(prev => prev.map(c => {
          const fresh = (updated.counters || []).find(u => u.id === c.id);
          return fresh ? { ...c, value: fresh.value ?? 0, classes: fresh.classes ?? {} } : { ...c, value: 0, classes: {} };
        }));
        onChanged(updated);
      }
    } catch (err) {
      setSaveError(err?.response?.data?.error || err.message || 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  const handleBackfill = async () => {
    if (!window.confirm('Backfill will reset all counters and recount from historical path data. Continue?')) return;
    setBusy(true);
    setSaveError(null);
    try {
      const bf = await countersAPI.startBackfill(set._id);
      if (bf) setBackfill(bf);
    } catch (err) {
      setSaveError(err?.response?.data?.error || err.message || 'Backfill failed');
    } finally {
      setBusy(false);
    }
  };

  // Flow view config change handler
  const handleFlowViewConfigChange = async (newConfig) => {
    setFlowViewConfig(newConfig);
    setDirty(true);
  };

  // Arrow config change handler for individual counters
  const handleCounterArrowConfigChange = (counterId, arrowConfig) => {
    setCounters(prev => prev.map(c =>
      c.id === counterId ? { ...c, arrowConfig } : c
    ));
    setDirty(true);
  };

  // Save flow view configuration (called when exiting edit mode)
  const handleFlowViewSave = async () => {
    try {
      const updated = await countersAPI.update(set._id, {
        counters: counters.map(c => ({ id: c.id, name: c.name, enabled: c.enabled, arrowConfig: c.arrowConfig })),
        flowViewConfig,
      });
      if (updated) {
        setSet(updated);
        initialRef.current = updated;
        setDirty(false);
        onChanged(updated);
      }
    } catch (err) {
      setSaveError(err?.response?.data?.error || err.message || 'Save failed');
      throw err; // Re-throw so CounterFlowView knows it failed
    }
  };

  const removeZone = (idx) => {
    setZones(prev => prev.filter((_, j) => j !== idx).map((z, k) => ({ ...z, label: ZONE_LABELS[k] })));
  };

  const bfPct = backfill?.totalPaths > 0 ? Math.round((backfill.processedPaths || 0) / backfill.totalPaths * 100) : 0;

  return (
    <div className="counter-detail">
      <div className="detail-header">
        <button className="btn-secondary btn-small" onClick={onBack}>← Back</button>
        <h2>{readOnly ? name : <input className="name-input" value={name} onChange={e => setName(e.target.value)} />}</h2>
        <div className="detail-actions">
          {saveError && <span className="save-error-indicator" title={saveError}>⚠ Error: {saveError}</span>}
        {!readOnly && saved && <span className="saved-indicator">✓ Saved</span>}
          {!readOnly && <button className="btn-warning btn-small" onClick={handleReset} disabled={busy}>Reset Counters</button>}
          {!readOnly && <button className="btn-info btn-small" onClick={handleBackfill} disabled={busy || backfill?.status === 'running'}>Backfill</button>}
          {!readOnly && <button className={`btn-save${dirty ? ' btn-save-dirty' : ''}`} onClick={handleSave} disabled={busy || !dirty || zones.length < 2 || objectClasses.length === 0}>
            {busy ? 'Saving…' : 'Save'}
          </button>}
          {!readOnly && <button className="btn-danger btn-small" onClick={handleDelete} disabled={deleting}>{deleting ? '…' : 'Delete'}</button>}
        </div>
      </div>

      {/* Backfill status */}
      {backfill && backfill.status !== 'idle' && (
        <div className={`backfill-bar backfill-${backfill.status}`}>
          {backfill.status === 'running' ? (
            <>
              <span>Recounting historical data… {(backfill.processedPaths ?? 0).toLocaleString()} / {(backfill.totalPaths ?? 0).toLocaleString()} paths ({bfPct}%)</span>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${bfPct}%` }} /></div>
            </>
          ) : backfill.status === 'complete' ? (
            <span>✔ Backfill complete — {(backfill.totalPaths ?? 0).toLocaleString()} historical paths processed ({fmtDate(backfill.completedAt)})</span>
          ) : backfill.status === 'failed' ? (
            <span>✖ Backfill failed: {backfill.error}</span>
          ) : null}
        </div>
      )}

      {/* Zone editor + settings sidebar */}
      <div className="step1-layout">
        <div className="step1-sidebar">
          {/* Zones */}
          <label className="field-label">Zones ({zones.length}/6)</label>
          {zones.map((z, i) => (
            <div key={z.label} className="zone-row">
              <span className="zone-chip-lg" style={{ background: ZONE_COLORS_FILL[i], borderColor: ZONE_COLORS_BORDER[i], color: ZONE_COLORS_BORDER[i] }}>{z.label}</span>
              <input placeholder={`Zone ${z.label} name`} value={z.name} readOnly={readOnly}
                onChange={e => setZones(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              {!readOnly && <button className="btn-small btn-danger" onClick={() => removeZone(i)} disabled={zones.length <= 2}>✕</button>}
            </div>
          ))}
          {!readOnly && zones.length < 6 && <p className="hint">Draw on the image to add a zone.</p>}

          {/* Path overlay toggle */}
          <label className="path-toggle" title="Show the last 500 stored paths to help position zones. Yellow dot = start, line = direction of travel.">
            <input type="checkbox" checked={showPaths} onChange={e => setShowPaths(e.target.checked)} />
            {' '}Show paths
          </label>

          {/* Object Classes */}
          <div className="detail-settings-group">
            <label className="field-label">Object Classes</label>
            <div className="class-checkboxes">
              {cameraLabels.map(cls => (
                <label key={cls} className="class-check">
                  <input type="checkbox" checked={objectClasses.includes(cls)} disabled={readOnly}
                    onChange={e => setObjectClasses(prev => e.target.checked ? [...prev, cls] : prev.filter(c => c !== cls))} />
                  {' '}{cls}
                </label>
              ))}
            </div>
            {objectClasses.length === 0 && <p className="hint warning">Select at least one class.</p>}
          </div>

          {/* MQTT Publishing */}
          <div className="detail-settings-group">
            <label className="field-label">MQTT Publishing</label>
            <label className="class-check">
              <input type="checkbox" checked={mqttEnabled} disabled={readOnly}
                onChange={e => setMqttEnabled(e.target.checked)} />
              {' '}Enable MQTT output
            </label>
            {mqttEnabled && (
              <>
                <div className="field-group">
                  <label className="field-sublabel">Topic</label>
                  <input type="text" className="text-input" value={mqttTopic} placeholder="e.g. dataq/counters/my-counter"
                    readOnly={readOnly} onChange={e => setMqttTopic(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-sublabel">Interval (seconds)</label>
                  <input type="number" className="text-input" min="60" max="3600" value={mqttInterval}
                    readOnly={readOnly} onChange={e => setMqttInterval(Number(e.target.value) || 60)} />
                  <p className="hint">60 – 3600 seconds</p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="step1-canvas">
          {snapshot ? (
            <ZoneEditor snapshot={snapshot} zones={zones} paths={paths} onChange={setZones} readOnly={readOnly} />
          ) : (
            <div className="canvas-placeholder">Loading snapshot…</div>
          )}
        </div>
      </div>

      {/* Counter directions table */}
      {counters.length > 0 && (
        <div className="edit-counters-section">
          <h3>Counter Directions</h3>
          <table className="counter-values-table">
            <thead>
              <tr>
                <th>Direction</th>
                <th>Name</th>
                <th>Enabled</th>
                <th>Count</th>
                <th>Per class</th>
              </tr>
            </thead>
            <tbody>
              {counters.map((c, ci) => {
                const fromZone = zones.findIndex(z => z.label === c.from);
                const toZone   = zones.findIndex(z => z.label === c.to);
                return (
                  <tr key={c.id} className={!c.enabled ? 'row-disabled' : ''}>
                    <td>
                      <span className="zone-chip" style={{ color: ZONE_COLORS_BORDER[fromZone] }}>{c.from}</span>
                      <span className="arrow">→</span>
                      <span className="zone-chip" style={{ color: ZONE_COLORS_BORDER[toZone] }}>{c.to}</span>
                    </td>
                    <td>
                      <input className="counter-name-input" placeholder="e.g. Entrance → Exit" value={c.name} readOnly={readOnly}
                        onChange={e => setCounters(prev => prev.map((x, i) => i === ci ? { ...x, name: e.target.value } : x))} />
                    </td>
                    <td>
                      <label className="enabled-check">
                        <input type="checkbox" checked={c.enabled} disabled={readOnly}
                          onChange={e => setCounters(prev => prev.map((x, i) => i === ci ? { ...x, enabled: e.target.checked } : x))} />
                      </label>
                    </td>
                    <td className="count-cell">{(c.value || 0).toLocaleString()}</td>
                    <td className="class-cell">
                      {Object.entries(c.classes || {}).map(([cls, n]) => (
                        <span key={cls} className="class-chip">{cls}: {n}</span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Inline graph */}
      {(() => {
        const enabledCounters = counters.filter(c => c.enabled && (c.value || 0) > 0).sort((a, b) => (b.value || 0) - (a.value || 0));
        if (enabledCounters.length === 0) return null;
        const maxVal = Math.max(1, ...enabledCounters.map(c => c.value || 0));
        const BAR_H = 30, GAP = 4, LABEL_W = 120, BAR_AREA_W = 450;
        const svgH = enabledCounters.length * (BAR_H + GAP) + 10;
        const allClasses = [...new Set(enabledCounters.flatMap(c => Object.keys(c.classes || {})))].sort();
        const classColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
        return (
          <div className="inline-graph-section">
            <h3>Counter Graph</h3>
            <div className="graph-container">
              <svg width={LABEL_W + BAR_AREA_W + 100} height={svgH} className="counter-bar-chart">
                {enabledCounters.map((c, i) => {
                  const fromIdx = zones.findIndex(z => z.label === c.from);
                  const toIdx   = zones.findIndex(z => z.label === c.to);
                  const y = i * (BAR_H + GAP) + 5;
                  const barW = Math.max(2, ((c.value || 0) / maxVal) * BAR_AREA_W);
                  let stackX = LABEL_W;
                  return (
                    <g key={c.id}>
                      <text x={LABEL_W - 8} y={y + BAR_H / 2 + 5} fill="#ccc" fontSize="12" textAnchor="end">
                        <tspan fill={ZONE_COLORS_BORDER[fromIdx]}>{c.from}</tspan>
                        <tspan fill="#666"> → </tspan>
                        <tspan fill={ZONE_COLORS_BORDER[toIdx]}>{c.to}</tspan>
                      </text>
                      {allClasses.map((cls, ci) => {
                        const clsVal = (c.classes || {})[cls] || 0;
                        if (clsVal === 0) return null;
                        const w = (clsVal / maxVal) * BAR_AREA_W;
                        const x0 = stackX;
                        stackX += w;
                        return (
                          <rect key={cls} x={x0} y={y} width={w} height={BAR_H} rx={ci === 0 ? 4 : 0}
                            fill={classColors[ci % classColors.length]} opacity={0.8}>
                            <title>{cls}: {clsVal.toLocaleString()}</title>
                          </rect>
                        );
                      })}
                      {allClasses.length === 0 && (
                        <rect x={LABEL_W} y={y} width={barW} height={BAR_H} rx={4}
                          fill={ZONE_COLORS_BORDER[fromIdx]} opacity={0.8} />
                      )}
                      <text x={LABEL_W + barW + 8} y={y + BAR_H / 2 + 5} fill="#e0e0e0" fontSize="12" fontWeight="600">
                        {(c.value || 0).toLocaleString()}
                      </text>
                    </g>
                  );
                })}
              </svg>
              {allClasses.length > 0 && (
                <div className="graph-legend">
                  {allClasses.map((cls, ci) => (
                    <span key={cls} className="legend-item">
                      <span className="legend-swatch" style={{ background: classColors[ci % classColors.length] }} />
                      {cls}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Counter Flow View */}
      {counters.length > 0 && snapshot && (
        <div className="counter-flow-section">
          <h3>Counter Flow View</h3>
          <CounterFlowView
            snapshot={snapshot}
            zones={zones}
            counters={counters}
            days={set.days || 1}
            flowViewConfig={flowViewConfig}
            objectClasses={objectClasses}
            onConfigChange={handleFlowViewConfigChange}
            onCounterConfigChange={handleCounterArrowConfigChange}
            onSave={handleFlowViewSave}
            readOnly={readOnly}
          />
        </div>
      )}
    </div>
  );
}

// ─── Create Wizard ────────────────────────────────────────────────────────────
function CounterCreate({ onSave, onCancel }) {
  const [step, setStep]               = useState(1);
  const [camera, setCamera]           = useState('');
  const [snapshot, setSnapshot]       = useState(null);
  const [paths, setPaths]             = useState([]);
  const [showPaths, setShowPaths]     = useState(false);
  const [loadingSnap, setLoadingSnap] = useState(false);
  const [zones, setZones]             = useState([]);
  const [setName, setSetName]         = useState('');
  const [objectClasses, setObjCls]    = useState(['Vehicle']);
  const [pairs, setPairs]             = useState([]);
  const [mqtt, setMqtt]               = useState({ enabled: false, intervalSeconds: 300, topic: '' });
  const [saving, setSaving]           = useState(false);
  const [cameraLabels, setCameraLabels] = useState(ALL_CLASSES);

  // Load snapshot + recent paths when camera selected
  useEffect(() => {
    if (!camera) { setSnapshot(null); setPaths([]); return; }
    setLoadingSnap(true);

    const toDataUrl = (raw) => {
      if (!raw) return null;
      if (raw.startsWith('data:')) return raw;
      return `data:image/jpeg;base64,${raw}`;
    };

    const extractImage = (snapshotObj) => {
      // Backend may use 'image' or 'base64Image' as field name
      return toDataUrl(snapshotObj?.image ?? snapshotObj?.base64Image ?? null);
    };

    Promise.all([
      // Try dedicated snapshot endpoint
      camerasAPI.getSnapshot(camera).catch(err => {
        console.warn('Snapshot endpoint failed:', err?.response?.status, err?.message);
        return null;
      }),
      // Get camera list (as fallback for snapshot + for display name)
      camerasAPI.getAll().catch(() => null),
    ]).then(([snapResp, camerasResp]) => {
      // Try snapshot from dedicated endpoint first (data.image or data.base64Image)
      let img = extractImage(snapResp?.data);

      // Fallback: use snapshot embedded in the camera list entry
      if (!img && camerasResp?.data) {
        const cam = camerasResp.data.find(c => c.serialNumber === camera);
        img = extractImage(cam?.snapshot);
      }

      setSnapshot(img);
      setLoadingSnap(false);
      const cam = (camerasResp?.data || []).find(c => c.serialNumber === camera);
      if (cam?.labels?.length) setCameraLabels(cam.labels);
    });
  }, [camera]);

  // Load paths on demand when toggle is enabled
  useEffect(() => {
    if (!showPaths || !camera) { setPaths([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const q = { serial: camera, limit: 500 };
        if (objectClasses.length > 0) q.class = objectClasses;
        const res = await pathsAPI.query(q);
        const events = res?.data || res || [];
        if (!cancelled) setPaths(events);
      } catch {} // eslint-disable-line no-empty
    })();
    return () => { cancelled = true; };
  }, [showPaths, camera, objectClasses]);

  // Regenerate pairs whenever zones change
  useEffect(() => {
    if (zones.length >= 2) {
      const newPairs = generatePairs(zones).map(p => {
        const existing = pairs.find(x => x.id === p.id);
        return existing || p;
      });
      setPairs(newPairs);
    } else {
      setPairs([]);
    }
  }, [zones]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generate MQTT topic from name
  useEffect(() => {
    if (setName)
      setMqtt(m => ({ ...m, topic: 'dataq/counters/' + setName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }));
  }, [setName]);

  const canProceed = () => {
    if (step === 1) return camera && snapshot && zones.length >= 2;
    if (step === 2) return setName.trim().length > 0 && objectClasses.length > 0;
    return true;
  };

  const [createError, setCreateError] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setCreateError(null);
    try {
      const result = await countersAPI.create({
        name: setName,
        serial: camera,
        objectClasses,
        zones,
        counters: pairs,
        mqtt: mqtt.enabled ? mqtt : { ...mqtt, enabled: false },
      });
      onSave(result);
    } catch (err) {
      setCreateError(err?.response?.data?.error || err.message || 'Create failed');
      setSaving(false);
    }
  };

  return (
    <div className="counter-create">
      <div className="wizard-header">
        <button className="btn-secondary btn-small" onClick={onCancel}>← Cancel</button>
        <div className="wizard-steps">
          {['Draw Zones', 'Name & Classes', 'Configure Counters'].map((label, i) => (
            <span key={i} className={`wizard-step-dot ${step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}`}>
              <span className="dot-num">{step > i + 1 ? '✔' : i + 1}</span> {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Step 1: Zone drawing ── */}
      {step === 1 && (
        <div className="wizard-step">
          <h3>Step 1 — Draw Zones</h3>
          <p className="step-hint">Select a camera, then <strong>click and drag</strong> rectangles on the snapshot to define 2–6 zones. Toggle &quot;Show paths&quot; to see recent object paths and guide placement.</p>
          <div className="step1-layout">
            <div className="step1-sidebar">
              <label className="field-label">Camera</label>
              <CameraSelector selectedCamera={camera} onCameraChange={c => { setCamera(c); setZones([]); }} />
              {loadingSnap && <p className="hint">Loading snapshot…</p>}
              {zones.length > 0 && (
                <div className="zone-list">
                  <label className="field-label">Zones ({zones.length}/6)</label>
                  {zones.map((z, i) => (
                    <div key={z.label} className="zone-row">
                      <span className="zone-chip-lg" style={{ background: ZONE_COLORS_FILL[i], borderColor: ZONE_COLORS_BORDER[i], color: ZONE_COLORS_BORDER[i] }}>{z.label}</span>
                      <input placeholder={`Zone ${z.label} name (optional)`} value={z.name}
                        onChange={e => setZones(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                      <button className="btn-small btn-danger" onClick={() => setZones(prev => {
                        const next = prev.filter((_, j) => j !== i).map((z, k) => ({ ...z, label: ZONE_LABELS[k] }));
                        return next;
                      })}>✕</button>
                    </div>
                  ))}
                  {zones.length >= 2 && <p className="hint">Generates {zones.length * (zones.length - 1)} counters</p>}
                </div>
              )}
              {/* Path overlay toggle */}
              {camera && (
                <label className="path-toggle" title="Show the last 500 stored paths to help position zones. Yellow dot = start, line = direction of travel.">
                  <input type="checkbox" checked={showPaths} onChange={e => setShowPaths(e.target.checked)} />
                  {' '}Show paths
                </label>
              )}
              {!snapshot && !loadingSnap && !camera && <p className="hint">Select a camera to begin.</p>}
              {!snapshot && !loadingSnap && camera && <p className="hint warning">⚠ Could not load snapshot — check browser console for details. You can still draw zones once the image loads.</p>}
            </div>
            <div className="step1-canvas">
              {snapshot
                ? <ZoneEditor snapshot={snapshot} zones={zones} paths={paths} onChange={setZones} />
                : <div className="canvas-placeholder">{loadingSnap ? 'Loading…' : 'No snapshot'}</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Name & Classes ── */}
      {step === 2 && (
        <div className="wizard-step">
          <h3>Step 2 — Name &amp; Object Classes</h3>
          <div className="step2-layout">
            <div className="field-group">
              <label className="field-label">Counter Set Name</label>
              <input className="text-input" placeholder="e.g. Westminster Intersection" value={setName}
                onChange={e => setSetName(e.target.value)} autoFocus />
            </div>
            <div className="field-group">
              <label className="field-label">Object Classes to Count</label>
              <div className="class-checkboxes">
                {cameraLabels.map(cls => (
                  <label key={cls} className="class-check">
                    <input type="checkbox" checked={objectClasses.includes(cls)}
                      onChange={e => setObjCls(prev => e.target.checked ? [...prev, cls] : prev.filter(c => c !== cls))} />
                    {' '}{cls}
                  </label>
                ))}
              </div>
              {objectClasses.length === 0 && <p className="hint warning">Select at least one class.</p>}
            </div>
            <div className="field-group">
              <label className="field-label">Zone Summary</label>
              <div className="zone-legend">
                {zones.map((z, i) => (
                  <span key={z.label} className="zone-badge" style={{ borderColor: ZONE_COLORS_BORDER[i], background: ZONE_COLORS_FILL[i] }}>
                    <strong style={{ color: ZONE_COLORS_BORDER[i] }}>{z.label}</strong> {z.name || '(unnamed)'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Counter names + MQTT ── */}
      {step === 3 && (
        <div className="wizard-step">
          <h3>Step 3 — Counter Names &amp; MQTT</h3>
          <p className="step-hint">Optionally name each direction and disable any you don't need. Names are used in MQTT output and the display.</p>
          <div className="step3-layout">
            <div className="pairs-grid">
              {pairs.map((p, pi) => {
                const fi = zones.findIndex(z => z.label === p.from);
                const ti = zones.findIndex(z => z.label === p.to);
                return (
                  <div key={p.id} className={`pair-row ${!p.enabled ? 'pair-disabled' : ''}`}>
                    <span className="pair-id">
                      <span style={{ color: ZONE_COLORS_BORDER[fi] }}>{p.from}</span>
                      <span className="arrow">→</span>
                      <span style={{ color: ZONE_COLORS_BORDER[ti] }}>{p.to}</span>
                    </span>
                    <input className="counter-name-input" placeholder="e.g. Main St → 1st Ave" value={p.name}
                      onChange={e => setPairs(prev => prev.map((x, i) => i === pi ? { ...x, name: e.target.value } : x))} />
                    <label className="enabled-check">
                      <input type="checkbox" checked={p.enabled}
                        onChange={e => setPairs(prev => prev.map((x, i) => i === pi ? { ...x, enabled: e.target.checked } : x))} />
                      {' '}Count
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="mqtt-config">
              <h4>MQTT Publishing</h4>
              <label className="class-check">
                <input type="checkbox" checked={mqtt.enabled} onChange={e => setMqtt(m => ({ ...m, enabled: e.target.checked }))} />
                {' '}Enable MQTT output
              </label>
              {mqtt.enabled && (
                <>
                  <div className="field-group">
                    <label className="field-label">Publish interval (seconds)</label>
                    <input type="number" min="60" max="3600" value={mqtt.intervalSeconds}
                      onChange={e => setMqtt(m => ({ ...m, intervalSeconds: Number(e.target.value) }))} />
                    <p className="hint">60 – 3600 seconds</p>
                  </div>
                  <div className="field-group">
                    <label className="field-label">MQTT Topic</label>
                    <input className="text-input" value={mqtt.topic} onChange={e => setMqtt(m => ({ ...m, topic: e.target.value }))} />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {createError && (
        <div className="save-error-banner">⚠ {createError}</div>
      )}
      {/* Wizard navigation */}
      <div className="wizard-nav">
        {step > 1 && <button className="btn-secondary" onClick={() => setStep(s => s - 1)}>← Back</button>}
        {step < 3 && <button className="btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>Next →</button>}
        {step === 3 && <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Create Counter Set'}</button>}
      </div>
    </div>
  );
}

// ─── Main Counters Component ──────────────────────────────────────────────────
export default function Counters() {
  const { isViewer } = useAuth();
  const viewer = isViewer();
  const [view, setView]     = useState('list'); // 'list' | 'create' | 'detail'
  const [sets, setSets]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    const data = await countersAPI.list();
    setSets(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const handleChanged = useCallback((updated) => {
    setSets(prev => prev.map(s => s._id === updated._id ? updated : s));
    setSelected(updated);
  }, []);

  const handleDeleted = useCallback((deletedId) => {
    setSets(prev => prev.filter(s => s._id !== deletedId));
    setSelected(null);
    setView('list');
  }, []);

  const handleSaved = (newSet) => {
    setSets(prev => [...prev, newSet]);
    setSelected(newSet);
    setView('detail');
  };

  if (view === 'create' && !viewer) return <CounterCreate onSave={handleSaved} onCancel={() => setView('list')} />;
  if (view === 'detail' && selected) return (
    <CounterDetail set={selected} onBack={() => setView('list')} onChanged={handleChanged} onDelete={handleDeleted} readOnly={viewer} />
  );

  return (
    <div className="counters-wrapper">
      <CounterList
        sets={sets}
        loading={loading}
        onRefresh={loadList}
        onCreate={() => setView('create')}
        onSelect={s => { setSelected(s); setView('detail'); }}
        readOnly={viewer}
      />
    </div>
  );
}
