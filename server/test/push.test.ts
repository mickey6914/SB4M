import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findAdViolations, pushBatch, type OutgoingPost } from '../src/push/client.js';

function post(localId: string, caption: string): OutgoingPost {
  return {
    localId,
    network: 'pinterest',
    scheduledAt: '2026-08-03T09:00:00.000Z',
    caption,
    assetUrl: 'https://example.com/a.jpg',
    pinterest: { title: 'Mug', link: 'https://shop.example.com/mug' },
  };
}

test('#ad violations are found before any network call', () => {
  const violations = findAdViolations([
    post('a', 'Warm mugs. Great gift. #ad'),
    post('b', 'Warm mugs. Great gift.'),
    post('c', '#ad Warm mugs.'),
  ]);
  assert.deepEqual(violations, ['b']);
});

test('a batch missing #ad is hard-blocked, never sent', async () => {
  const result = await pushBatch([post('a', 'No tag here.')]);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'blocked');
  assert.match(result.message, /#ad/);
  assert.equal(result.outcomes?.[0].state, 'failed');
});

test('an empty batch is rejected with a useful message', async () => {
  const result = await pushBatch([]);
  assert.equal(result.ok, false);
  assert.match(result.message, /approve some pins/i);
});

test('a compliant batch without credentials reports not_configured, not a crash', async () => {
  const saved = process.env.CONTENT360_API_KEY;
  delete process.env.CONTENT360_API_KEY;
  try {
    const result = await pushBatch([post('a', 'Warm mugs. Great gift. #ad')]);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'not_configured');
    assert.match(result.message, /CONTENT360_API_KEY/);
  } finally {
    if (saved !== undefined) process.env.CONTENT360_API_KEY = saved;
  }
});

test('compliance is checked before configuration — a bad batch blocks even with a key set', async () => {
  process.env.CONTENT360_API_KEY = 'test-key';
  try {
    const result = await pushBatch([post('a', 'Missing the tag.')]);
    assert.equal(result.error, 'blocked');
  } finally {
    delete process.env.CONTENT360_API_KEY;
  }
});
