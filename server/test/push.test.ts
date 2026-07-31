import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPostBody,
  captionToBody,
  extensionFor,
  findAdViolations,
  pushBatch,
  type OutgoingPost,
} from '../src/push/client.js';

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
  const saved = process.env.CONTENT360_API_KEY;
  process.env.CONTENT360_API_KEY = 'test-key';
  try {
    const result = await pushBatch([post('a', 'Missing the tag.')]);
    assert.equal(result.error, 'blocked');
  } finally {
    if (saved === undefined) delete process.env.CONTENT360_API_KEY;
    else process.env.CONTENT360_API_KEY = saved;
  }
});

// The body is stored as HTML by Content360's composer and is not escaped on
// the way in, so "&" and "<3" have to be escaped here or they are read as
// markup. Newlines stay newlines — Content360 blocks them itself.
test('captions are escaped for the HTML composer, newlines left alone', () => {
  assert.equal(captionToBody('Art & Vibes <3'), 'Art &amp; Vibes &lt;3');
  assert.equal(captionToBody('one\ntwo'), 'one\ntwo');
  assert.equal(captionToBody('5 > 3 & rising'), '5 &gt; 3 &amp; rising');
});

test('a Pinterest post carries title, link and a board keyed to its account', () => {
  const body = buildPostBody(
    { ...post('a', 'Warm mugs. #ad'), pinterest: { title: 'Mug', link: 'https://s.example/m', board: '691161942753702446' } },
    132821,
    '1904992'
  );
  assert.deepEqual(body.accounts, [132821]);
  assert.equal(body.date, '2026-08-03');
  assert.equal(body.time, '09:00');
  assert.equal(body.timezone, 'UTC');
  assert.equal(body.schedule, true);

  const version = body.versions[0];
  assert.equal(version.account_id, 0);
  assert.equal(version.is_original, true);
  assert.deepEqual(version.content[0].media, ['1904992']);
  assert.deepEqual(version.options.pinterest, {
    title: 'Mug',
    link: 'https://s.example/m',
    boards: { 'account-132821': '691161942753702446' },
  });
});

test('Facebook and Instagram carry their own option blocks, not Pinterest’s', () => {
  const fb = buildPostBody(
    { ...post('a', 'x #ad'), network: 'facebook', pinterest: undefined, facebook: { postType: 'reel' } },
    132838,
    '1'
  );
  assert.deepEqual(fb.versions[0].options, { facebook_page: { type: 'reel' } });

  const ig = buildPostBody(
    { ...post('a', 'x #ad'), network: 'instagram', pinterest: undefined },
    155362,
    '1'
  );
  assert.deepEqual(ig.versions[0].options, { instagram: { type: 'post' } });
});

test('a board is sent as null rather than omitted when none is picked yet', () => {
  const body = buildPostBody(post('a', 'x #ad'), 132821, '1');
  assert.deepEqual((body.versions[0].options.pinterest as { boards: unknown }).boards, {
    'account-132821': null,
  });
});

// A workspace can hold two accounts on one network, so the account a post
// addresses is the caller's choice — and the board is keyed to it.
test('the chosen account id is what the post addresses, and keys its board', () => {
  const body = buildPostBody(
    { ...post('a', 'x #ad'), pinterest: { title: 'Mug', link: 'https://s.example/m', board: 'b1' } },
    155362,
    '1'
  );
  assert.deepEqual(body.accounts, [155362]);
  assert.deepEqual((body.versions[0].options.pinterest as { boards: unknown }).boards, {
    'account-155362': 'b1',
  });
});

// The crop renderer emits JPEG. Naming every upload .png put the wrong
// extension on every asset in the seller's media library.
test('an upload is named after what it actually is', () => {
  assert.equal(extensionFor('image/jpeg'), 'jpg');
  assert.equal(extensionFor('image/png'), 'png');
  assert.equal(extensionFor('image/webp'), 'webp');
  assert.equal(extensionFor('video/mp4'), 'mp4');
  assert.equal(extensionFor('application/octet-stream'), 'png');
});
