import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockupPrompt, templateByLabel, TEMPLATE_LABELS, variationFor } from '../src/scenes/templates.js';

const wallArt = templateByLabel('Wall art')!;

test('the wizard’s twelve mockup types all resolve to a template', () => {
  for (const label of [
    'T-shirt',
    'Sweatshirt',
    'T-shirt flat lay',
    'Sweatshirt flat lay',
    'Coffee cup',
    'Pillow',
    'Invitation card',
    'Wall art',
    'TV wall art',
    'Tote bag',
    'Sticker sheet',
    'Planner stickers',
  ]) {
    assert.ok(templateByLabel(label), label);
  }
  assert.equal(TEMPLATE_LABELS.length, 12);
});

test('with no options the prompt is the template alone', () => {
  assert.equal(mockupPrompt(wallArt), wallArt.prompt);
});

// Each pin takes a different chosen scene in rotation, and the scene has to
// reach the model or every pin is the same room.
test('a chosen scene is written into the prompt and overrides the template’s room', () => {
  const text = mockupPrompt(wallArt, { scene: 'Cozy home setting' });
  assert.ok(text.startsWith(wallArt.prompt));
  assert.match(text, /Cozy home setting/);
  assert.match(text, /in place of any setting described above/);
  assert.match(text, /wall art with the artwork stays the subject/);
});

test('different scenes give different prompts for the same mockup and variant', () => {
  const a = mockupPrompt(wallArt, { scene: 'Desk flat lay', variant: 1 });
  const b = mockupPrompt(wallArt, { scene: 'Window light', variant: 1 });
  assert.notEqual(a, b);
});

test('style direction and the per-pin variation are both appended', () => {
  const text = mockupPrompt(wallArt, { styleDirection: 'No people, fall colours', variant: 2 });
  assert.match(text, /Style direction: No people, fall colours\./);
  assert.ok(text.endsWith(variationFor(2, wallArt.overhead)));
});

test('a scene that is just the template’s own name adds nothing', () => {
  assert.equal(mockupPrompt(wallArt, { scene: 'Wall art' }), wallArt.prompt);
});
