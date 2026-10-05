import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCopyPrompt,
  DEFAULT_COPY_PROMPT,
  DEFAULT_PRODUCT_TYPE,
  parsePinCopy,
} from '../src/copywrite/index.js';

const TAGS = [
  'stained glass art',
  'faux stained glass',
  'acrylic wall art',
  'boho wall decor',
  'window art',
  'sun catcher decor',
  'colorful wall art',
  'gift for her',
  'housewarming gift',
  'living room decor',
  'modern wall art',
  'botanical art',
  'nursery decor',
];

function reply(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    titles: ['Faux Stained Glass Wall Art', 'Boho Acrylic Window Art Print', 'Colorful Sun Catcher Decor'],
    description: 'A bright acrylic panel that catches the light. Hang it in any window.',
    tags: TAGS,
    ...over,
  });
}

test('clean minified JSON parses into 3 titles, a description and 13 tags', () => {
  const copy = parsePinCopy(reply());
  assert.ok(copy);
  assert.equal(copy.titles.length, 3);
  assert.equal(copy.titles[0], 'Faux Stained Glass Wall Art');
  assert.match(copy.description, /acrylic panel/);
  assert.equal(copy.tags.length, 13);
});

test('markdown fences survive the first-{ to last-} slice', () => {
  const copy = parsePinCopy('```json\n' + reply() + '\n```');
  assert.ok(copy);
  assert.equal(copy.titles.length, 3);
});

// Whether a pin needs #ad is the seller's judgement, so the description is
// returned exactly as written — nothing added, nothing removed.
test('a description is returned as written — no #ad is added', () => {
  const copy = parsePinCopy(reply({ description: 'Warm light. Great gift.' }));
  assert.ok(copy);
  assert.equal(copy.description, 'Warm light. Great gift.');
  assert.doesNotMatch(copy.description, /#ad/i);
});

test('a description that already carries #ad keeps it untouched', () => {
  const copy = parsePinCopy(reply({ description: 'Warm light. Great gift. #ad' }));
  assert.ok(copy);
  assert.equal(copy.description, 'Warm light. Great gift. #ad');
});

test('fewer than three titles fails the contract', () => {
  assert.equal(parsePinCopy(reply({ titles: ['One', 'Two'] })), null);
});

test('fewer than thirteen tags fails the contract', () => {
  assert.equal(parsePinCopy(reply({ tags: TAGS.slice(0, 12) })), null);
});

test('duplicate tags do not count toward thirteen', () => {
  assert.equal(parsePinCopy(reply({ tags: [...TAGS.slice(0, 12), 'Stained Glass Art'] })), null);
});

test('a missing description fails the contract', () => {
  assert.equal(parsePinCopy(reply({ description: '  ' })), null);
});

test('extras are trimmed to 3 titles and 13 tags, tags lowercased', () => {
  const copy = parsePinCopy(
    reply({ titles: ['A', 'B', 'C', 'D'], tags: ['UPPER CASE TAG', ...TAGS] })
  );
  assert.ok(copy);
  assert.deepEqual(copy.titles, ['A', 'B', 'C']);
  assert.equal(copy.tags.length, 13);
  assert.equal(copy.tags[0], 'upper case tag');
});

test('a title over 100 characters is cut at a word boundary', () => {
  const long = 'Stained Glass '.repeat(10).trim();
  const copy = parsePinCopy(reply({ titles: [long, 'B', 'C'] }));
  assert.ok(copy);
  assert.ok(copy.titles[0].length <= 100);
  assert.ok(long.startsWith(copy.titles[0]));
  assert.doesNotMatch(copy.titles[0], /\s$/);
});

test('non-JSON, empty text and the old single-title shape fail cleanly', () => {
  assert.equal(parsePinCopy('Sorry, I cannot do that.'), null);
  assert.equal(parsePinCopy(''), null);
  assert.equal(
    parsePinCopy('{"title":"Mug","desc":"Nice.","keywords":["a b","c d","e f","g h","i j"]}'),
    null
  );
});

test('the default prompt is the seller’s, with {product_type} filled', () => {
  const text = buildCopyPrompt({ hasImage: true });
  assert.ok(text.startsWith(DEFAULT_COPY_PROMPT.replace('{product_type}', DEFAULT_PRODUCT_TYPE)));
  assert.doesNotMatch(text, /\{product_type\}/);
  assert.match(text, /attached product image/);
  assert.match(text, /"titles"/);
});

test('an edited prompt and product type are used, and every placeholder is filled', () => {
  const text = buildCopyPrompt({
    prompt: 'Write for this {product_type}. Really, a {product_type}.',
    productType: 'sticker sheet',
    mockup: 'Tote bag',
    scenes: ['Desk flat lay', 'Window light'],
    styleDirection: 'No people',
    product: 'botanical line art',
    hasImage: true,
  });
  assert.ok(text.startsWith('Write for this sticker sheet. Really, a sticker sheet.'));
  assert.match(text, /tote bag mockup/);
  assert.match(text, /Desk flat lay, Window light/);
  assert.match(text, /No people/);
  assert.match(text, /botanical line art/);
  // The format instruction is appended even to an edited prompt, so a prompt
  // changed on Connections can never break parsing.
  assert.match(text, /Return only JSON/);
});

test('without an image the prompt names the product type instead', () => {
  const text = buildCopyPrompt({ hasImage: false, productType: 'mug' });
  assert.doesNotMatch(text, /attached product image/);
  assert.match(text, /Product: mug\./);
});

test('several mockup types are all named, and copy is kept true of the design', () => {
  const text = buildCopyPrompt({ hasImage: true, mockups: ['Coffee cup', 'T-shirt', 'Basic marketing'] });
  assert.match(text, /coffee cup, t-shirt and art print mockups/);
  assert.match(text, /true of the design itself/);
});

test('a single mockup type still reads as one', () => {
  assert.match(buildCopyPrompt({ hasImage: true, mockups: ['Pillow'] }), /shown as a pillow mockup/);
});

// The first live descriptions ran to several paragraphs. Pinterest caps a
// description at 500 characters, and the caption adds hashtags after it.
test('the format asks for a short description within the limit', async () => {
  const { DESCRIPTION_MAX } = await import('../src/copywrite/index.js');
  assert.match(buildCopyPrompt({ hasImage: true }), new RegExp(`at most ${DESCRIPTION_MAX} characters`));
});

test('an over-long description is cut back to the last whole sentence', async () => {
  const { clampDescription } = await import('../src/copywrite/index.js');
  const s1 = 'A luminous nativity scene rendered in faux stained glass for your wall.';
  const s2 = 'Mary, Joseph and the Christ child glow beneath a radiant Bethlehem star in sapphire and ruby.';
  const s3 = 'Printed on crystal clear acrylic so light passes through and the colours shine like a chapel window.';
  const s4 = 'A meaningful gift for anyone who treasures faith based decor at Christmas.';
  const long = [s1, s2, s3, s4].join(' ');
  const out = clampDescription(long, 300);
  assert.ok(out.length <= 300, `${out.length} characters`);
  assert.ok(out.endsWith('.'), 'ends on a full sentence');
  assert.ok(long.startsWith(out));
  assert.equal(clampDescription('Short and sweet.', 300), 'Short and sweet.');
});

test('one endless sentence is cut at a word with an ellipsis', async () => {
  const { clampDescription } = await import('../src/copywrite/index.js');
  const out = clampDescription('stained glass '.repeat(40).trim(), 120);
  assert.ok(out.length <= 120);
  assert.ok(out.endsWith('…'));
  assert.doesNotMatch(out, /\s…$/);
});

test('the parser applies the limit to what Claude returns', () => {
  const desc = 'This sentence is about sixty characters long, give or take. '.repeat(8).trim();
  const copy = parsePinCopy(reply({ description: desc }));
  assert.ok(copy);
  assert.ok(copy.description.length <= 300, `${copy.description.length}`);
  assert.ok(copy.description.endsWith('.'));
});
