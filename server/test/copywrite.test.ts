import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePinCopy } from '../src/copywrite/index.js';

test('clean minified JSON parses', () => {
  const copy = parsePinCopy(
    '{"title":"Cozy Ceramic Mug Gift Set","desc":"Warm your mornings. Perfect for coffee lovers. #ad","keywords":["ceramic mug set","coffee gift ideas","cozy kitchen decor","handmade mug gift","fall coffee bar"]}'
  );
  assert.ok(copy);
  assert.equal(copy.title, 'Cozy Ceramic Mug Gift Set');
  assert.equal(copy.keywords.length, 5);
});

test('markdown fences survive the first-{ to last-} slice', () => {
  const copy = parsePinCopy(
    '```json\n{"title":"Mug","desc":"Nice mug. Great gift. #ad","keywords":["a b","c d","e f","g h","i j"]}\n```'
  );
  assert.ok(copy);
  assert.equal(copy.title, 'Mug');
});

test('missing " #ad" suffix is appended', () => {
  const copy = parsePinCopy(
    '{"title":"Mug","desc":"Nice mug. Great gift.","keywords":["a b","c d","e f","g h","i j"]}'
  );
  assert.ok(copy);
  assert.ok(copy.desc.endsWith(' #ad'));
});

test('fewer than five keywords fails the contract', () => {
  assert.equal(
    parsePinCopy('{"title":"Mug","desc":"Two lines. Here. #ad","keywords":["a b","c d"]}'),
    null
  );
});

test('more than five keywords is trimmed to five, lowercased', () => {
  const copy = parsePinCopy(
    '{"title":"Mug","desc":"Two lines. Here. #ad","keywords":["A B","c d","E f","g h","i j","k l"]}'
  );
  assert.ok(copy);
  assert.deepEqual(copy.keywords, ['a b', 'c d', 'e f', 'g h', 'i j']);
});

test('non-JSON and empty text fail cleanly', () => {
  assert.equal(parsePinCopy('Sorry, I cannot do that.'), null);
  assert.equal(parsePinCopy(''), null);
});
