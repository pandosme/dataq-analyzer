import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOccupancyPoints,
  normalizeOccupancyEvent,
  OCCUPANCY_RANGES,
} from '../src/services/occupancyService.js';

test('normalizes an occupancy MQTT payload using its topic identity', () => {
  const event = normalizeOccupancyEvent({
    serial: 'payload-serial',
    area: 'Payload area',
    occupancy: { Car: 5, Truck: 1, Bus: 0 },
    timestamp: 1789574520383.581,
    name: ' Beach Camera ',
    location: ' Habo ',
  }, 'b8a44fd7ded1', 'Area 1');

  assert.deepEqual(event, {
    serial: 'B8A44FD7DED1',
    area: 'Area 1',
    occupancy: { Car: 5, Truck: 1, Bus: 0 },
    timestamp: 1789574520383,
    name: 'Beach Camera',
    location: 'Habo',
  });
});

test('rejects invalid occupancy counts', () => {
  assert.throws(
    () => normalizeOccupancyEvent({ occupancy: { Car: -1 }, timestamp: Date.now() }, 'SERIAL', 'Area 1'),
    /non-negative numeric counts/
  );
});

test('range presets produce a bounded number of graph points', () => {
  const pointCounts = Object.values(OCCUPANCY_RANGES).map(({ durationMs, bucketMs }) => durationMs / bucketMs);
  assert.deepEqual(pointCounts, [30, 30, 30, 36, 36, 24, 28]);
});

test('carries the last occupancy state through buckets without interpolation', () => {
  const result = buildOccupancyPoints({
    baseline: { occupancy: new Map([['Car', 2], ['Truck', 0]]) },
    buckets: [
      { _id: 1, occupancy: { Car: 3, Truck: 1 } },
      { _id: 3, occupancy: { Car: 1, Truck: 1 } },
    ],
    start: 0,
    end: 4000,
    bucketMs: 1000,
  });

  assert.deepEqual(result.labels, ['Car', 'Truck']);
  assert.deepEqual(result.points, [
    { timestamp: 0, Car: 2, Truck: 0 },
    { timestamp: 1000, Car: 2, Truck: 0 },
    { timestamp: 2000, Car: 3, Truck: 1 },
    { timestamp: 3000, Car: 3, Truck: 1 },
    { timestamp: 4000, Car: 1, Truck: 1 },
  ]);
});

test('treats omitted labels and empty occupancy snapshots as zero', () => {
  const result = buildOccupancyPoints({
    baseline: { occupancy: { Car: 2, Truck: 1 } },
    buckets: [
      { _id: 0, occupancy: { Car: 1 } },
      { _id: 1, occupancy: {} },
    ],
    knownLabels: ['Car', 'Truck'],
    start: 0,
    end: 3000,
    bucketMs: 1000,
  });

  assert.deepEqual(result.labels, ['Car', 'Truck']);
  assert.deepEqual(result.points, [
    { timestamp: 0, Car: 2, Truck: 1 },
    { timestamp: 1000, Car: 1, Truck: 0 },
    { timestamp: 2000, Car: 0, Truck: 0 },
    { timestamp: 3000, Car: 0, Truck: 0 },
  ]);
});