import assert from 'node:assert/strict';
import { after, afterEach, before, mock, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = await mkdtemp(path.join(tmpdir(), 'dataq-retention-test-'));
const configPath = path.join(directory, 'config.yaml');
await writeFile(configPath, 'app:\n  dataRetentionDays: 45\nmqtt:\n  enabled: false\n');
process.env.NODE_ENV = 'test';
process.env.CONFIG_PATH = configPath;
process.env.JWT_SECRET = 'retention-tests-only-not-a-real-secret';

const { Camera, PathEvent, SystemConfig, User } = await import('../src/models/index.js');
const { getSystemConfig } = await import('../src/services/configService.js');
const { generateToken } = await import('../src/services/authService.js');
const { runRetentionCleanup } = await import('../src/services/retentionService.js');
const { default: configRouter } = await import('../src/routes/config.js');
const { default: camerasRouter } = await import('../src/routes/cameras.js');

const admin = { _id: '507f1f77bcf86cd799439011', username: 'test-admin', role: 'admin', enabled: true };
const camera = { _id: '507f1f77bcf86cd799439012', serialNumber: 'TEST', name: 'Test camera', cameraType: 'remote' };
let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/config', configRouter);
  app.use('/api/cameras', camerasRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => mock.restoreAll());
after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(directory, { recursive: true });
});

function mockDefault(value = null) {
  mock.method(SystemConfig, 'findById', () => ({
    select: () => ({ lean: async () => value }),
  }));
}

function authenticateAs(user = admin) {
  mock.method(User, 'findById', () => ({ select: async () => user }));
  return { Authorization: `Bearer ${generateToken(user)}`, 'Content-Type': 'application/json' };
}

test('uses the file default until a default is explicitly saved in MongoDB', async () => {
  mockDefault();
  assert.equal((await getSystemConfig()).dataRetentionDays, 45);
});

test('reads the database default on each call without changing other installation settings', async () => {
  let stored = { retentionDefaultDays: 14 };
  mock.method(SystemConfig, 'findById', () => ({ select: () => ({ lean: async () => stored }) }));
  const first = await getSystemConfig();
  assert.equal(first.dataRetentionDays, 14);
  stored = { retentionDefaultDays: 7 };
  const second = await getSystemConfig();
  assert.equal(second.dataRetentionDays, 7);
  assert.equal(second.appName, first.appName);
});

test('requires administrator access for both retention endpoints', async () => {
  for (const method of ['GET', 'PUT']) {
    const anonymous = await fetch(`${baseUrl}/api/config/retention`, { method });
    assert.equal(anonymous.status, 401);
    const viewer = await fetch(`${baseUrl}/api/config/retention`, {
      method, headers: authenticateAs({ ...admin, role: 'viewer' }),
    });
    assert.equal(viewer.status, 403);
  }
});

test('reports whether cleanup is disabled on this instance', async () => {
  mockDefault({ retentionDefaultDays: 14 });
  const original = process.env.RETENTION_ENABLED;
  try {
    for (const [flag, expected] of [['false', false], ['true', true]]) {
      process.env.RETENTION_ENABLED = flag;
      const response = await fetch(`${baseUrl}/api/config/retention`, { headers: authenticateAs() });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).data, { dataRetentionDays: 14, cleanupEnabled: expected });
    }
  } finally {
    if (original === undefined) delete process.env.RETENTION_ENABLED;
    else process.env.RETENTION_ENABLED = original;
  }
});

test('persists only the explicit default without running cleanup', async () => {
  const update = mock.method(SystemConfig, 'findByIdAndUpdate', async () => ({}));
  const deletion = mock.method(PathEvent, 'deleteMany', async () => { throw new Error('Unexpected deletion'); });
  const response = await fetch(`${baseUrl}/api/config/retention`, {
    method: 'PUT', headers: authenticateAs(), body: JSON.stringify({ dataRetentionDays: 30 }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { dataRetentionDays: 30 });
  assert.deepEqual(update.mock.calls[0].arguments, [
    'system-config', { $set: { retentionDefaultDays: 30 } }, { upsert: true, runValidators: true },
  ]);
  assert.equal(deletion.mock.callCount(), 0);
});

test('rejects invalid defaults and unrelated settings without writing', async () => {
  const update = mock.method(SystemConfig, 'findByIdAndUpdate', async () => ({}));
  const headers = authenticateAs();
  for (const body of [
    {}, { dataRetentionDays: null }, { dataRetentionDays: 0 }, { dataRetentionDays: -1 },
    { dataRetentionDays: 1.5 }, { dataRetentionDays: '30' }, { dataRetentionDays: true },
    { dataRetentionDays: Number.MAX_SAFE_INTEGER + 1 }, { dataRetentionDays: 30, mqtt: {} },
  ]) {
    const response = await fetch(`${baseUrl}/api/config/retention`, {
      method: 'PUT', headers, body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
  }
  assert.equal(update.mock.callCount(), 0);
});

test('returns an explicit error if saving the default fails', async () => {
  mock.method(SystemConfig, 'findByIdAndUpdate', async () => { throw new Error('Database unavailable'); });
  const response = await fetch(`${baseUrl}/api/config/retention`, {
    method: 'PUT', headers: authenticateAs(), body: JSON.stringify({ dataRetentionDays: 30 }),
  });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).success, false);
});

test('keeps other installation configuration read-only', async () => {
  const response = await fetch(`${baseUrl}/api/config/system`, {
    method: 'PUT', headers: authenticateAs(), body: JSON.stringify({ dataRetentionDays: 30 }),
  });
  assert.equal(response.status, 405);
});

test('allows admin camera overrides and resetting to the default', async () => {
  mock.method(Camera, 'findById', async () => camera);
  const update = mock.method(Camera, 'findByIdAndUpdate', async (_id, data) => ({
    ...camera, ...data, toObject() { return { ...camera, ...data }; },
  }));
  const headers = authenticateAs();
  for (const retentionDays of [14, null]) {
    const response = await fetch(`${baseUrl}/api/cameras/${camera._id}`, {
      method: 'PUT', headers, body: JSON.stringify({ retentionDays }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.retentionDays, retentionDays);
  }
  assert.equal(update.mock.callCount(), 2);
});

test('rejects invalid camera overrides and viewer updates', async () => {
  mock.method(Camera, 'findById', async () => camera);
  const update = mock.method(Camera, 'findByIdAndUpdate', async () => ({}));
  const headers = authenticateAs();
  for (const retentionDays of [0, -1, 1.5, '30', '', true, Number.MAX_SAFE_INTEGER + 1]) {
    const response = await fetch(`${baseUrl}/api/cameras/${camera._id}`, {
      method: 'PUT', headers, body: JSON.stringify({ retentionDays }),
    });
    assert.equal(response.status, 400);
  }
  const response = await fetch(`${baseUrl}/api/cameras/${camera._id}`, {
    method: 'PUT', headers: authenticateAs({ ...admin, role: 'viewer' }),
    body: JSON.stringify({ retentionDays: 14 }),
  });
  assert.equal(response.status, 403);
  assert.equal(update.mock.callCount(), 0);
});

test('cleanup uses the shared default and camera overrides, including disabled cameras', async () => {
  mockDefault({ retentionDefaultDays: 30 });
  mock.method(Camera, 'find', () => ({ lean: async () => [
    { serialNumber: 'DEFAULT', retentionDays: null },
    { serialNumber: 'OVERRIDE', retentionDays: 7, enabled: false },
    { serialNumber: 'ARCHIVED', retentionDays: null, archivedAt: new Date() },
  ] }));
  const now = Date.now();
  mock.method(Date, 'now', () => now);
  const deletion = mock.method(PathEvent, 'deleteMany', async () => ({ deletedCount: 2 }));
  assert.deepEqual(await runRetentionCleanup(), { totalDeleted: 6, camerasProcessed: 3 });
  for (const [index, days] of [30, 7, 30].entries()) {
    const query = deletion.mock.calls[index].arguments[0];
    const cutoff = now - days * 86400000;
    assert.equal(query.$or[0].timestamp.$lte, cutoff);
    assert.equal(query.$or[1].createdAt.$lte.getTime(), cutoff);
  }
});
