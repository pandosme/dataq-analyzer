import { OccupancyEvent } from '../models/index.js';
import logger from '../utils/logger.js';

export const OCCUPANCY_RANGES = Object.freeze({
  '15m': { durationMs: 15 * 60 * 1000, bucketMs: 30 * 1000 },
  '30m': { durationMs: 30 * 60 * 1000, bucketMs: 60 * 1000 },
  '1h': { durationMs: 60 * 60 * 1000, bucketMs: 2 * 60 * 1000 },
  '6h': { durationMs: 6 * 60 * 60 * 1000, bucketMs: 10 * 60 * 1000 },
  '12h': { durationMs: 12 * 60 * 60 * 1000, bucketMs: 20 * 60 * 1000 },
  '1d': { durationMs: 24 * 60 * 60 * 1000, bucketMs: 60 * 60 * 1000 },
  '1w': { durationMs: 7 * 24 * 60 * 60 * 1000, bucketMs: 6 * 60 * 60 * 1000 },
});

function normalizeOccupancy(occupancy) {
  if (!occupancy || typeof occupancy !== 'object' || Array.isArray(occupancy)) {
    throw new Error('occupancy must be an object');
  }

  return Object.fromEntries(
    Object.entries(occupancy).map(([label, value]) => {
      const count = Number(value);
      if (!label.trim() || !Number.isFinite(count) || count < 0) {
        throw new Error('occupancy labels must contain non-negative numeric counts');
      }
      return [label.trim(), count];
    })
  );
}

function occupancyToObject(occupancy) {
  return occupancy instanceof Map ? Object.fromEntries(occupancy) : { ...(occupancy || {}) };
}

export function normalizeOccupancyEvent(data, topicSerial, topicArea) {
  const serial = String(topicSerial || data?.serial || '').trim().toUpperCase();
  const area = String(topicArea || data?.area || '').trim();
  const timestamp = Math.floor(Number(data?.timestamp));

  if (!serial) throw new Error('serial is required');
  if (!area) throw new Error('area is required');
  if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error('timestamp must be epoch milliseconds');

  return {
    serial,
    area,
    occupancy: normalizeOccupancy(data.occupancy),
    timestamp,
    name: typeof data.name === 'string' ? data.name.trim() : '',
    location: typeof data.location === 'string' ? data.location.trim() : '',
  };
}

export async function saveOccupancyEvent(data, topicSerial, topicArea) {
  const normalized = normalizeOccupancyEvent(data, topicSerial, topicArea);
  const event = await OccupancyEvent.create(normalized);
  logger.debug('Occupancy event saved', {
    serial: normalized.serial,
    area: normalized.area,
    timestamp: normalized.timestamp,
  });
  return event;
}

export async function getOccupancyAreas(serial) {
  const rows = await OccupancyEvent.aggregate([
    { $match: { serial: serial.toUpperCase() } },
    {
      $project: {
        area: 1,
        timestamp: 1,
        labels: {
          $map: {
            input: { $objectToArray: '$occupancy' },
            as: 'entry',
            in: '$$entry.k',
          },
        },
      },
    },
    { $unwind: { path: '$labels', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$area',
        labels: { $addToSet: '$labels' },
        lastTimestamp: { $max: '$timestamp' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((row) => ({
    area: row._id,
    labels: row.labels.filter(Boolean).sort(),
    lastTimestamp: row.lastTimestamp,
  }));
}

export function buildOccupancyPoints({ baseline, buckets, knownLabels = [], start, end, bucketMs }) {
  const bucketByIndex = new Map(buckets.map((bucket) => [bucket._id, bucket]));
  const labels = new Set(knownLabels);
  Object.keys(occupancyToObject(baseline?.occupancy)).forEach((label) => labels.add(label));
  buckets.forEach((bucket) => {
    Object.keys(occupancyToObject(bucket.occupancy)).forEach((label) => labels.add(label));
  });
  const sortedLabels = [...labels].sort();
  const createPoint = (timestamp, occupancy) => ({
    timestamp,
    ...Object.fromEntries(sortedLabels.map((label) => [label, occupancy[label] ?? 0])),
  });

  let current = baseline?.occupancy ? occupancyToObject(baseline.occupancy) : null;
  const bucketCount = Math.ceil((end - start) / bucketMs);
  const points = [];

  if (current) points.push(createPoint(start, current));

  for (let index = 0; index < bucketCount; index += 1) {
    const bucket = bucketByIndex.get(index);
    if (bucket) current = occupancyToObject(bucket.occupancy);
    if (current) {
      points.push(createPoint(
        Math.min(start + ((index + 1) * bucketMs), end),
        current
      ));
    }
  }

  return { labels: sortedLabels, points };
}

export async function getOccupancySeries({ serial, area, range, to }) {
  const rangeConfig = OCCUPANCY_RANGES[range];
  if (!rangeConfig) throw new Error('Unsupported occupancy range');

  const end = Number.isFinite(Number(to)) ? Math.floor(Number(to)) : Date.now();
  const start = end - rangeConfig.durationMs;
  const match = { serial: serial.toUpperCase(), area };

  const [baseline, buckets, labelRows] = await Promise.all([
    OccupancyEvent.findOne({ ...match, timestamp: { $lt: start } })
      .sort({ timestamp: -1 })
      .select({ occupancy: 1, timestamp: 1, _id: 0 })
      .lean(),
    OccupancyEvent.aggregate([
      { $match: { ...match, timestamp: { $gte: start, $lte: end } } },
      { $sort: { timestamp: 1 } },
      {
        $group: {
          _id: {
            $floor: { $divide: [{ $subtract: ['$timestamp', start] }, rangeConfig.bucketMs] },
          },
          occupancy: { $last: '$occupancy' },
          sourceTimestamp: { $last: '$timestamp' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    OccupancyEvent.aggregate([
      { $match: { ...match, timestamp: { $lte: end } } },
      { $project: { labels: { $objectToArray: '$occupancy' } } },
      { $unwind: '$labels' },
      { $group: { _id: '$labels.k' } },
    ]),
  ]);

  const { labels, points } = buildOccupancyPoints({
    baseline,
    buckets,
    knownLabels: labelRows.map((row) => row._id),
    start,
    end,
    bucketMs: rangeConfig.bucketMs,
  });

  return {
    serial: serial.toUpperCase(),
    area,
    range,
    from: start,
    to: end,
    bucketMs: rangeConfig.bucketMs,
    labels,
    points,
  };
}