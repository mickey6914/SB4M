import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adCompliant,
  DEFAULT_RULES,
  NETWORK_TIMES,
  scheduleRun,
  type ScheduledPost,
} from '../src/schedule/engine.js';

const base = {
  productId: 'mug',
  productTitle: 'Ceramic mug gift set',
  startDate: '2026-08-01',
};

test('30 pins fanned to all three networks = 90 posts, 3 a day', () => {
  const posts = scheduleRun({ ...base, pinCount: 30, fanOut: 'all' });
  assert.equal(posts.length, 90);
  const days = new Set(posts.map((p) => p.date));
  assert.equal(days.size, 30); // one pin per day per network
  assert.equal(posts.at(-1)!.date, '2026-08-30');
});

test('never the same product twice on one network on one day', () => {
  const posts = scheduleRun({ ...base, pinCount: 30, fanOut: 'all' });
  const seen = new Set<string>();
  for (const p of posts) {
    const key = `${p.productId}|${p.network}|${p.date}`;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
  }
});

test('every post lands inside the 09:00-17:00 window', () => {
  const posts = scheduleRun({ ...base, pinCount: 10, fanOut: 'all' });
  for (const p of posts) {
    const hour = Number(p.time.slice(0, 2));
    assert.ok(hour >= DEFAULT_RULES.windowStart && hour <= DEFAULT_RULES.windowEnd, p.time);
  }
});

test('fan-out patterns pick the right networks, same day, staggered times', () => {
  const pOnly = scheduleRun({ ...base, pinCount: 3, fanOut: 'pinterest' });
  assert.deepEqual([...new Set(pOnly.map((p) => p.network))], ['pinterest']);

  const all = scheduleRun({ ...base, pinCount: 1, fanOut: 'all' });
  assert.equal(all.length, 3);
  assert.equal(new Set(all.map((p) => p.date)).size, 1); // same day
  assert.deepEqual(
    all.map((p) => p.time).sort(),
    Object.values(NETWORK_TIMES).sort()
  );
});

test('max posts per network per day caps different products, pushing overflow to the next day', () => {
  // Three other products already fill Pinterest on Aug 1 (cap is 3).
  const existing: ScheduledPost[] = [1, 2, 3].map((n) => ({
    id: `p${n}#1#pinterest`,
    productId: `p${n}`,
    productTitle: `Product ${n}`,
    pinIndex: 1,
    network: 'pinterest',
    date: '2026-08-01',
    time: '09:00',
    state: 'queued',
  }));
  const posts = scheduleRun({ ...base, pinCount: 2, fanOut: 'pinterest', existing });
  assert.equal(posts[0].date, '2026-08-02'); // Aug 1 full → next day
  assert.equal(posts[1].date, '2026-08-03');
});

test('a second product shares days with the first (different products allowed)', () => {
  const first = scheduleRun({ ...base, pinCount: 3, fanOut: 'all' });
  const second = scheduleRun({
    productId: 'runner',
    productTitle: 'Linen table runner',
    pinCount: 3,
    fanOut: 'all',
    startDate: '2026-08-01',
    existing: first,
  });
  assert.equal(second[0].date, '2026-08-01'); // cap 3 leaves room on day one
});

test('#ad compliance check', () => {
  assert.ok(adCompliant('Warm mugs for cold mornings. #ad'));
  assert.ok(adCompliant('#ad Start your day right.'));
  assert.ok(!adCompliant('Warm mugs for cold mornings.'));
  assert.ok(!adCompliant('Great #adventure mug')); // substring is not the tag
});
