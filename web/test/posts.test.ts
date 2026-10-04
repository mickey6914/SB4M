import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPosts,
  captionFor,
  copyForPin,
  hashtag,
  missingCopyMessage,
  networksFor,
  pinsMissingCopy,
  PINTEREST_DESC_MAX,
  pushSummary,
  type PostablePin,
} from '../src/state/posts';

const COPY = {
  titles: ['Faux Stained Glass Wall Art', 'Boho Acrylic Window Art', 'Colorful Sun Catcher Decor'],
  description: 'A bright acrylic panel that catches the light. Hang it in any window.',
  tags: Array.from({ length: 13 }, (_, i) => `tag number ${i + 1}`),
};

function seededPins(count: number): PostablePin[] {
  return Array.from({ length: count }, (_, i) => ({
    ...copyForPin(COPY, i),
    link: 'https://expressartvibe.etsy.com/listing/1',
    approved: true,
  }));
}

function slotsFor(pins: number, networks: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 1; i <= pins; i++)
    for (const n of networks) m.set(`${i}#${n}`, `2026-10-0${i}T09:00:00.000Z`);
  return m;
}

function assetsFor(pins: number): Map<number, Record<string, string>> {
  const m = new Map<number, Record<string, string>>();
  for (let n = 1; n <= pins; n++)
    m.set(n, { '2:3': `data:pin${n}-23`, '1:1': `data:pin${n}-11`, '4:5': `data:pin${n}-45` });
  return m;
}

// The seller-testing bug: 1 image → 3 pins → 3 networks gave 9 posts, and 6
// of them went out image-only because only the edited pin had a caption.
test('a 3-pin run with no manual edits produces 9 posts, every one with copy', () => {
  const networks = networksFor('all');
  const posts = buildPosts({
    runId: '15',
    pins: seededPins(3),
    networks,
    slots: slotsFor(3, networks),
    assets: assetsFor(3),
  });
  assert.equal(posts.length, 9);
  for (const p of posts) {
    assert.ok(p.caption.trim(), `${p.localId} has an empty caption`);
    assert.match(p.caption, /catches the light/);
    assert.match(p.caption, /#tagnumber1\b/);
    assert.ok(p.assetUrl, `${p.localId} has no image`);
    assert.ok(p.scheduledAt, `${p.localId} has no time`);
  }
});

test('each post carries its OWN pin’s title and picture', () => {
  const networks = networksFor('all');
  const posts = buildPosts({
    runId: '15',
    pins: seededPins(3),
    networks,
    slots: slotsFor(3, networks),
    assets: assetsFor(3),
  });
  const pin2 = posts.filter((p) => p.localId.startsWith('15#2#'));
  assert.equal(pin2.length, 3);
  assert.equal(pin2.find((p) => p.network === 'pinterest')!.pinterest!.title, COPY.titles[1]);
  assert.match(pin2.find((p) => p.network === 'facebook')!.caption, /^Boho Acrylic Window Art/);
  assert.equal(pin2.find((p) => p.network === 'instagram')!.assetUrl, 'data:pin2-45');
});

test('titles spread across pins and cycle past three', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((i) => copyForPin(COPY, i).title),
    [COPY.titles[0], COPY.titles[1], COPY.titles[2], COPY.titles[0], COPY.titles[1]]
  );
  assert.equal(copyForPin(COPY, 4).keywords.length, 13);
  assert.ok(copyForPin(COPY, 4).keywords.every((k) => k.on));
});

test('only included pins are pushed', () => {
  const pins = seededPins(3);
  pins[1].approved = false;
  const networks = networksFor('all');
  const posts = buildPosts({
    runId: '15',
    pins,
    networks,
    slots: slotsFor(2, networks),
    assets: assetsFor(3),
  });
  assert.equal(posts.length, 6);
  assert.ok(!posts.some((p) => p.localId.startsWith('15#2#')));
  // Slots index included pins in order, so pin 3 takes the second slot.
  assert.equal(posts.find((p) => p.localId === '15#3#pinterest')!.scheduledAt, '2026-10-02T09:00:00.000Z');
});

test('included pins missing a title or description are named', () => {
  const pins = seededPins(4);
  pins[1].desc = '';
  pins[2].title = '  ';
  pins[3].desc = '';
  pins[3].approved = false; // not included, so not a blocker
  assert.deepEqual(pinsMissingCopy(pins), [2, 3]);
  assert.equal(
    missingCopyMessage([2, 3]),
    'Pin 2, 3 have no title or description. Every post needs copy before it goes to Content360.'
  );
});

test('unticked tags stay out of the caption', () => {
  const pin = { ...seededPins(1)[0] };
  pin.keywords = pin.keywords.map((k, i) => ({ ...k, on: i !== 0 }));
  assert.doesNotMatch(captionFor(pin, 'instagram'), /#tagnumber1\b/);
  assert.match(captionFor(pin, 'instagram'), /#tagnumber2\b/);
});

test('Facebook and Instagram end with the link; Pinterest carries it as a field', () => {
  const pin = seededPins(1)[0];
  assert.ok(captionFor(pin, 'facebook').endsWith(pin.link));
  assert.ok(!captionFor(pin, 'pinterest').includes(pin.link));
});

test('a Pinterest body never exceeds 500 characters', () => {
  const pin = { ...seededPins(1)[0], desc: 'Light through colour. '.repeat(30) };
  const body = captionFor(pin, 'pinterest');
  assert.ok(body.length <= PINTEREST_DESC_MAX, `${body.length} characters`);
  const short = captionFor(seededPins(1)[0], 'pinterest');
  assert.ok(short.length <= PINTEREST_DESC_MAX);
  assert.match(short, /#tagnumber13\b/);
});

test('hashtags are squashed to letters and digits', () => {
  assert.equal(hashtag('Stained Glass Art'), '#stainedglassart');
  assert.equal(hashtag("mom's gift-idea"), '#momsgiftidea');
  assert.equal(hashtag('—'), '');
});

test('the confirmation counts pins and posts across the networks used', () => {
  assert.equal(
    pushSummary(3, networksFor('all')),
    '3 pins pushed to Content360: 9 posts queued across Pinterest, Facebook and Instagram.'
  );
  assert.equal(
    pushSummary(1, networksFor('pinterest')),
    '1 pin pushed to Content360: 1 post queued across Pinterest.'
  );
});
