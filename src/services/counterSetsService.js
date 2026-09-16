import CounterSet from '../models/CounterSet.js';
import { PathEvent } from '../models/index.js';
import logger from '../utils/logger.js';

// ─── MQTT publish intervals: counterSetId → NodeJS timer ─────────────────────
const mqttTimers = new Map();

// ─── Zone helpers ─────────────────────────────────────────────────────────────

function pointInRect(x, y, rect) {
  if (x == null || y == null) return false;
  return x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2;
}

// Returns zone label of first (lowest-index) zone containing (x,y), or null.
function findZone(x, y, zones) {
  for (const zone of zones) {
    if (pointInRect(x, y, zone.rect)) return zone.label;
  }
  return null;
}

/**
 * Classify a path event against a counter set's zones.
 * Returns counter id string e.g. "A->B", or null if not countable.
 */
function classifyEvent(event, counterSet) {
  if (!counterSet.objectClasses.includes(event.class)) return null;

  const bx = event.bx ?? event.path?.[0]?.x ?? null;
  const by = event.by ?? event.path?.[0]?.y ?? null;
  const lastPt = event.path?.[event.path.length - 1];

  if (bx == null || by == null || !lastPt) return null;

  const fromLabel = findZone(bx, by, counterSet.zones);
  const toLabel = findZone(lastPt.x, lastPt.y, counterSet.zones);

  if (!fromLabel || !toLabel || fromLabel === toLabel) return null;

  return `${fromLabel}->${toLabel}`;
}

/**
 * Generate all N×(N-1) directional counter pairs from zones.
 */
function generateCounters(zones) {
  const counters = [];
  for (let i = 0; i < zones.length; i++) {
    for (let j = 0; j < zones.length; j++) {
      if (i === j) continue;
      const from = zones[i].label;
      const to = zones[j].label;
      counters.push({
        id: `${from}->${to}`,
        from,
        to,
        name: `${from} → ${to}`,
        enabled: true,
        total: 0,
        byClass: {},
      });
    }
  }
  return counters;
}

// ─── MQTT helpers ─────────────────────────────────────────────────────────────

function startMqttTimer(counterSet, mqttClient) {
  const id = counterSet._id.toString();
  stopMqttTimer(id);

  if (!counterSet.mqttTopic || !counterSet.mqttInterval) return;
  if (!mqttClient) return;

  const ms = counterSet.mqttInterval * 1000;
  const timer = setInterval(async () => {
    try {
      const fresh = await CounterSet.findById(id).lean();
      if (!fresh) { stopMqttTimer(id); return; }

      const payload = {
        name: fresh.name,
        serial: fresh.serial,
        timestamp: Math.floor(Date.now() / 1000),
        days: fresh.days || 0,
        counters: [],
      };
      for (const c of fresh.counters) {
        if (c.enabled) {
          const byClass = c.byClass instanceof Map
            ? Object.fromEntries(c.byClass)
            : (c.byClass || {});
          const entry = {
            direction: c.id,
            name: c.name || `${c.from} \u2192 ${c.to}`,
            total: c.total,
          };
          // Flatten class counts as top-level properties
          for (const [cls, val] of Object.entries(byClass)) {
            entry[cls] = val;
          }
          payload.counters.push(entry);
        }
      }
      mqttClient.publish(fresh.mqttTopic, JSON.stringify(payload), { qos: 1 });
    } catch (err) {
      logger.error('CounterSet MQTT publish error', { error: err.message, id });
    }
  }, ms);

  mqttTimers.set(id, timer);
}

function stopMqttTimer(id) {
  const t = mqttTimers.get(id);
  if (t) { clearInterval(t); mqttTimers.delete(id); }
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

async function runBackfill(counterSetId) {
  try {
    // Get the counter set
    const cs = await CounterSet.findById(counterSetId);
    if (!cs) return;

    // Reset all counters to zero before recounting
    for (const c of cs.counters) {
      c.total = 0;
      c.byClass = {};
    }
    await cs.save();

    // Mark running and count total matching paths first
    const totalPaths = await PathEvent.countDocuments({
      serial: cs.serial.toUpperCase(),
      class: { $in: cs.objectClasses },
    });

    await CounterSet.updateOne(
      { _id: counterSetId },
      {
        $set: {
          'backfill.status': 'running',
          'backfill.totalPaths': totalPaths,
          'backfill.processedPaths': 0,
          'backfill.startedAt': new Date(),
          'backfill.error': null,
        },
      }
    );

    // Stream path events in batches of 500
    const BATCH = 500;
    let skip = 0;
    let processed = 0;

    // Accumulate increments in memory, flush to DB every batch
    const incTotals = {};   // counterId → total increment
    const incByClass = {};  // counterId → { className → increment }

    while (true) {
      // Re-fetch counter set each batch in case it's been deleted
      const fresh = await CounterSet.findById(counterSetId).lean();
      if (!fresh) return;

      const events = await PathEvent.find({
        serial: fresh.serial.toUpperCase(),
        class: { $in: fresh.objectClasses },
      })
        .select({ bx: 1, by: 1, path: 1, class: 1 })
        .sort({ timestamp: 1 })
        .skip(skip)
        .limit(BATCH)
        .lean();

      if (events.length === 0) break;

      for (const event of events) {
        const counterId = classifyEvent(event, fresh);
        if (counterId) {
          incTotals[counterId] = (incTotals[counterId] || 0) + 1;
          if (!incByClass[counterId]) incByClass[counterId] = {};
          const cls = event.class;
          incByClass[counterId][cls] = (incByClass[counterId][cls] || 0) + 1;
        }
      }

      processed += events.length;
      skip += events.length;

      // Update processedPaths progress
      await CounterSet.updateOne(
        { _id: counterSetId },
        { $set: { 'backfill.processedPaths': processed } }
      );

      if (events.length < BATCH) break;
    }

    // Apply accumulated increments to counters array
    const finalCS = await CounterSet.findById(counterSetId);
    if (!finalCS) return;

    for (const counter of finalCS.counters) {
      const cid = counter.id;
      if (incTotals[cid]) {
        counter.total += incTotals[cid];
      }
      if (incByClass[cid]) {
        for (const [cls, n] of Object.entries(incByClass[cid])) {
          const existing = counter.byClass instanceof Map
            ? (counter.byClass.get(cls) || 0)
            : (counter.byClass[cls] || 0);
          if (counter.byClass instanceof Map) {
            counter.byClass.set(cls, existing + n);
          } else {
            counter.byClass[cls] = existing + n;
          }
        }
      }
    }

    // Count distinct days from processed path events
    const distinctDays = await PathEvent.aggregate([
      { $match: { serial: finalCS.serial.toUpperCase(), class: { $in: finalCS.objectClasses } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$timestamp' } } } } },
      { $count: 'days' },
    ]);
    finalCS.days = distinctDays[0]?.days || 0;

    // Track the latest day for real-time day counting
    const latestDay = await PathEvent.findOne(
      { serial: finalCS.serial.toUpperCase(), class: { $in: finalCS.objectClasses } },
      { timestamp: 1 },
      { sort: { timestamp: -1 } }
    ).lean();
    if (latestDay) {
      finalCS.lastDayProcessed = new Date(latestDay.timestamp).toISOString().slice(0, 10);
    }

    // Mark backfill complete
    finalCS.backfill.status = 'complete';
    finalCS.backfill.processedPaths = processed;
    finalCS.backfill.completedAt = new Date();
    await finalCS.save();

    logger.info('CounterSet backfill complete', {
      id: counterSetId,
      processed,
    });
  } catch (err) {
    logger.error('CounterSet backfill failed', {
      error: err.message,
      id: counterSetId,
    });
    await CounterSet.updateOne(
      { _id: counterSetId },
      {
        $set: {
          'backfill.status': 'failed',
          'backfill.error': err.message,
          'backfill.completedAt': new Date(),
        },
      }
    ).catch(() => {});
  }
}

// ─── Initialise MQTT timers for all existing counter sets on startup ──────────

export async function initCounterSets(mqttClient) {
  try {
    const sets = await CounterSet.find({}).lean();
    for (const cs of sets) {
      if (cs.mqttTopic && cs.mqttInterval) {
        startMqttTimer(cs, mqttClient);
      }
    }
    logger.info('CounterSet MQTT timers initialised', { count: sets.length });
  } catch (err) {
    logger.error('Failed to init counter sets', { error: err.message });
  }
}

// ─── Public CRUD ──────────────────────────────────────────────────────────────

export async function list() {
  return CounterSet.find({}).sort({ createdAt: -1 }).lean();
}

export async function getById(id) {
  return CounterSet.findById(id).lean();
}

export async function create(body, mqttClient) {
  const { name, serial, objectClasses, zones, mqttTopic, mqttInterval, counters: customCounters } = body;

  // Validate
  if (!name || !serial || !objectClasses?.length || !zones?.length) {
    throw Object.assign(new Error('name, serial, objectClasses, and zones are required'), { status: 400 });
  }
  if (zones.length < 2 || zones.length > 6) {
    throw Object.assign(new Error('zones must have 2–6 entries'), { status: 400 });
  }

  // Auto-generate counters if not provided
  const generatedCounters = generateCounters(zones);

  // Merge custom counter names if provided
  if (customCounters?.length) {
    for (const cc of customCounters) {
      const gen = generatedCounters.find((g) => g.id === cc.id);
      if (gen) {
        if (cc.name != null) gen.name = cc.name;
        if (cc.enabled != null) gen.enabled = cc.enabled;
      }
    }
  }

  const doc = new CounterSet({
    name,
    serial: serial.toUpperCase(),
    objectClasses,
    zones,
    counters: generatedCounters,
    mqttTopic: mqttTopic || '',
    mqttInterval: mqttInterval || 60,
  });

  await doc.save();

  // Start MQTT publishing if configured
  if (mqttTopic && mqttClient) {
    startMqttTimer(doc, mqttClient);
  }
  return doc.toObject();
}

export async function update(id, body, mqttClient) {
  const cs = await CounterSet.findById(id);
  if (!cs) return null;

  // Simple field updates
  if (body.name != null) cs.name = body.name;
  if (body.mqttTopic != null) cs.mqttTopic = body.mqttTopic;
  if (body.mqttInterval != null) cs.mqttInterval = body.mqttInterval;
  if (body.objectClasses != null) cs.objectClasses = body.objectClasses;

  // Flow view config updates (arrow color, opacity, selectedClass, displayMode)
  if (body.flowViewConfig != null) {
    if (!cs.flowViewConfig) cs.flowViewConfig = {};
    if (body.flowViewConfig.arrowColor != null) cs.flowViewConfig.arrowColor = body.flowViewConfig.arrowColor;
    if (body.flowViewConfig.arrowOpacity != null) cs.flowViewConfig.arrowOpacity = body.flowViewConfig.arrowOpacity;
    if (body.flowViewConfig.selectedClass !== undefined) cs.flowViewConfig.selectedClass = body.flowViewConfig.selectedClass;
    if (body.flowViewConfig.displayMode != null) cs.flowViewConfig.displayMode = body.flowViewConfig.displayMode;
  }

  // Determine if zones changed (structure or geometry)
  let zonesChanged = false;
  if (body.zones) {
    const oldLabels = cs.zones.map((z) => z.label).sort().join(',');
    const newLabels = body.zones.map((z) => z.label).sort().join(',');

    if (oldLabels !== newLabels) {
      zonesChanged = true;
    } else {
      // Check if any rects changed
      for (const newZ of body.zones) {
        const oldZ = cs.zones.find((z) => z.label === newZ.label);
        if (oldZ && newZ.rect) {
          if (
            oldZ.rect.x1 !== newZ.rect.x1 || oldZ.rect.y1 !== newZ.rect.y1 ||
            oldZ.rect.x2 !== newZ.rect.x2 || oldZ.rect.y2 !== newZ.rect.y2
          ) {
            zonesChanged = true;
            break;
          }
        }
      }
    }
    cs.zones = body.zones;
  }

  // Explicit recount flag
  if (body.recount) zonesChanged = true;

  if (zonesChanged) {
    // Regenerate counters from new zones
    cs.counters = generateCounters(cs.zones);

    // Merge custom counter settings if provided
    if (body.counters?.length) {
      for (const upd of body.counters) {
        const c = cs.counters.find((x) => x.id === upd.id);
        if (c) {
          if (upd.name != null) c.name = upd.name;
          if (upd.enabled != null) c.enabled = upd.enabled;
          if (upd.arrowConfig != null) c.arrowConfig = upd.arrowConfig;
        }
      }
    }

    // Reset backfill state
    cs.backfill = {
      status: 'idle',
      totalPaths: 0,
      processedPaths: 0,
      startedAt: null,
      completedAt: null,
      error: null,
    };

    await cs.save();

    // Restart MQTT timer with new settings
    stopMqttTimer(id);
    if (cs.mqttTopic && cs.mqttInterval && mqttClient) {
      startMqttTimer(cs.toObject(), mqttClient);
    }

    logger.info('CounterSet zones updated — counters reset', { id });
    return cs.toObject();
  }

  // No zone change — just update counter names/enabled/arrowConfig
  if (body.counters?.length) {
    for (const upd of body.counters) {
      const c = cs.counters.find((x) => x.id === upd.id);
      if (c) {
        if (upd.name != null) c.name = upd.name;
        if (upd.enabled != null) c.enabled = upd.enabled;
        if (upd.arrowConfig != null) c.arrowConfig = upd.arrowConfig;
      }
    }
  }

  await cs.save();

  // Restart MQTT timer with new settings
  stopMqttTimer(id);
  if (cs.mqttTopic && cs.mqttInterval && mqttClient) {
    startMqttTimer(cs.toObject(), mqttClient);
  }

  return cs.toObject();
}

export async function deleteById(id, mqttClient) {
  stopMqttTimer(id);
  const result = await CounterSet.findByIdAndDelete(id);
  return result != null;
}

export async function resetAll(id) {
  const cs = await CounterSet.findById(id);
  if (!cs) return null;

  for (const c of cs.counters) {
    c.total = 0;
    c.byClass = {};
  }
  cs.days = 0;
  cs.lastDayProcessed = null;
  cs.days = 0;
  cs.lastDayProcessed = null;
  cs.resetAt = new Date();
  await cs.save();
  return cs.toObject();
}

export async function resetOne(id, counterId) {
  const cs = await CounterSet.findById(id);
  if (!cs) return null;

  const counter = cs.counters.find((c) => c.id === counterId);
  if (!counter) return null;

  counter.total = 0;
  counter.byClass = {};
  await cs.save();
  return cs.toObject();
}

export async function getBackfillStatus(id) {
  const cs = await CounterSet.findById(id).select('backfill').lean();
  return cs?.backfill ?? null;
}

export async function startBackfill(id) {
  const cs = await CounterSet.findById(id);

  // Kick off backfill asynchronously (runBackfill resets counters first)
  setImmediate(() => runBackfill(cs._id));

  return { status: 'running', message: 'Backfill started' };
}

// ─── Real-time path event processing ─────────────────────────────────────────

/**
 * Called for every saved path event. Updates any matching counter sets.
 */
export async function processPathEvent(event) {
  try {
    // Find all counter sets for this camera
    const sets = await CounterSet.find({
      serial: event.serial?.toUpperCase(),
      'backfill.status': { $in: ['complete', 'idle'] }, // skip while backfilling
    }).lean();

    if (!sets.length) return;

    for (const cs of sets) {
      // Skip if backfill is running (avoid race)
      if (cs.backfill?.status === 'running') continue;

      const counterId = classifyEvent(event, cs);
      if (!counterId) continue;

      const cls = event.class;
      const byClassKey = `counters.$[el].byClass.${cls}`;

      // Check if this event is on a new calendar day
      const eventDate = event.timestamp
        ? new Date(event.timestamp).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const dayInc = (cs.lastDayProcessed !== eventDate) ? 1 : 0;

      const updateOps = {
        $inc: {
          'counters.$[el].total': 1,
          [byClassKey]: 1,
        },
      };
      if (dayInc) {
        updateOps.$inc.days = 1;
        updateOps.$set = { lastDayProcessed: eventDate };
      }

      await CounterSet.updateOne(
        { _id: cs._id, 'counters.id': counterId },
        updateOps,
        { arrayFilters: [{ 'el.id': counterId, 'el.enabled': true }] }
      );
    }
  } catch (err) {
    logger.error('CounterSet real-time update error', { error: err.message });
  }
}
