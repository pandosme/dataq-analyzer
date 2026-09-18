import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMediaMtxPlaybackUrl } from '../src/services/mediaMtxService.js';

test('builds a MediaMTX playback URL with UTC timing and an escaped recording path', () => {
  const url = buildMediaMtxPlaybackUrl(
    'http://dart.internal:9996/',
    'Front Drive',
    new Date('2026-09-17T13:24:28.000Z'),
    60.1
  );

  assert.equal(
    url,
    'http://dart.internal:9996/get?path=front+drive&start=2026-09-17T13%3A24%3A28.000Z&duration=61&format=mp4'
  );
});