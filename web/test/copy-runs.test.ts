import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialRun, runReducer, type RunState } from '../src/state/run';
import { reviewReducer, seedReview } from '../src/state/review';

const OLD = {
  titles: ['Nativity A', 'Nativity B', 'Nativity C'],
  description: 'Old nativity description.',
  tags: Array.from({ length: 13 }, (_, i) => `old ${i}`),
};
const NEW = {
  titles: ['Ghost A', 'Ghost B', 'Ghost C'],
  description: 'New ghost description.',
  tags: Array.from({ length: 13 }, (_, i) => `ghost ${i}`),
};

function runAt(runNumber: number, extra: Partial<RunState> = {}): RunState {
  return { ...initialRun, runNumber, uploads: ['data:image/png;base64,AA'], hero: 1, volume: 3, mockups: ['Pillow'], ...extra };
}

// The seller-testing bug: a copy request still in flight from the previous
// run finished after the next run started, and its copy landed in the new run.
test('copy written for another run is ignored', () => {
  const state = runAt(2, { copy: { status: 'writing' } });
  const next = runReducer(state, {
    type: 'setCopy',
    forRun: 1,
    forHero: 1,
    copy: { status: 'done', ...OLD, id: '1:1' },
  });
  assert.equal(next, state);
  assert.equal(next.copy.status, 'writing');
});

test('copy written from a hero since swapped is ignored', () => {
  const state = runAt(2, { hero: 2, uploads: ['a', 'b'], copy: { status: 'writing' } });
  const next = runReducer(state, { type: 'setCopy', forRun: 2, forHero: 1, copy: { status: 'done', ...OLD, id: 'x' } });
  assert.equal(next, state);
});

test('copy for this run and hero is taken', () => {
  const next = runReducer(runAt(2), { type: 'setCopy', forRun: 2, forHero: 1, copy: { status: 'done', ...NEW, id: '2:1' } });
  assert.equal(next.copy.status, 'done');
});

// Even if stale copy reached Review, fresh copy must replace it everywhere
// the seller has not typed — it used to fill only EMPTY pins, which left one
// push holding two runs' descriptions and hashtags.
test('fresh copy replaces every untouched pin, not just empty ones', () => {
  const seeded = seedReview(runAt(2, { copy: { status: 'done', ...OLD, id: 'old' } }));
  assert.equal(seeded.pins[1].desc, OLD.description);
  const next = reviewReducer(seeded, { type: 'applyRunCopy', copy: { ...NEW, id: 'new' } });
  for (const [i, p] of next.pins.entries()) {
    assert.equal(p.desc, NEW.description, `pin ${i + 1} description`);
    assert.equal(p.title, NEW.titles[i % 3], `pin ${i + 1} title`);
    assert.equal(p.keywords[0].text, 'ghost 0', `pin ${i + 1} tags`);
  }
});

test('a pin the seller edited keeps their words', () => {
  let state = seedReview(runAt(2, { copy: { status: 'done', ...OLD, id: 'old' } }));
  state = reviewReducer(state, { type: 'selectPin', pin: 2 });
  state = reviewReducer(state, { type: 'setDesc', text: 'My own words.' });
  const next = reviewReducer(state, { type: 'applyRunCopy', copy: { ...NEW, id: 'new' } });
  assert.equal(next.pins[1].desc, 'My own words.');
  assert.equal(next.pins[0].desc, NEW.description);
  assert.equal(next.pins[2].desc, NEW.description);
});

test('re-applying the batch Review was seeded with changes nothing', () => {
  const seeded = seedReview(runAt(2, { copy: { status: 'done', ...NEW, id: 'new' } }));
  assert.equal(reviewReducer(seeded, { type: 'applyRunCopy', copy: { ...NEW, id: 'new' } }), seeded);
});
