import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  BACKDROPS,
  compositeStyleFor,
  isBasicMarketing,
  MARKETING_SIZE,
  marketingMockup,
  PROMO_SAFE,
  wrapTitle,
} from '../src/scenes/marketing.js';

async function art(w = 900, h = 900, colour = '#d01c8b'): Promise<Buffer> {
  // A flat colour: any redraw or recolour of the art would show.
  return sharp({ create: { width: w, height: h, channels: 3, background: colour } }).png().toBuffer();
}

async function pixel(img: Buffer, x: number, y: number): Promise<number[]> {
  const { data } = await sharp(img).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}

const close = (a: number[], b: number[], tol = 12) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const MAGENTA = [0xd0, 0x1c, 0x8b];

// Rows (or columns) holding pixels matching a colour, as [first, last].
async function span(img: Buffer, match: (p: number[]) => boolean, axis: 'rows' | 'cols'): Promise<[number, number]> {
  const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
  let first = -1;
  let last = -1;
  const outer = axis === 'rows' ? info.height : info.width;
  const inner = axis === 'rows' ? info.width : info.height;
  for (let o = 0; o < outer; o += 2) {
    for (let i = 0; i < inner; i += 4) {
      const x = axis === 'rows' ? i : o;
      const y = axis === 'rows' ? o : i;
      const k = (y * info.width + x) * info.channels;
      if (match([data[k], data[k + 1], data[k + 2]])) {
        if (first < 0) first = o;
        last = o;
        break;
      }
    }
  }
  return [first, last];
}

test('labels map to their composite style, whatever the case', () => {
  assert.equal(compositeStyleFor(' basic MARKETING '), 'promo');
  assert.equal(compositeStyleFor('Unframed wall art'), 'unframed');
  assert.equal(compositeStyleFor('Wall art'), null);
  assert.ok(isBasicMarketing('Basic marketing'));
  assert.ok(!isBasicMarketing(undefined));
});

test('a basic marketing mockup is 2:3 and keeps the artwork’s own colours', async () => {
  const out = await marketingMockup(await art(), 1, 'promo', 'Faux Stained Glass Nativity Wall Art');
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, MARKETING_SIZE.width);
  assert.equal(meta.height, MARKETING_SIZE.height);
  const [top, bottom] = await span(out, (p) => close(p, MAGENTA), 'rows');
  const mid = Math.round((top + bottom) / 2);
  assert.ok(close(await pixel(out, MARKETING_SIZE.width / 2, mid), MAGENTA));
  assert.ok(!close(await pixel(out, 10, 10), MAGENTA), 'corner is backdrop');
});

// Every network re-crops the pin and lays the brand band over the bottom, so
// the art and the headline have to sit where a square crop still shows them.
test('art and title stay inside the area every crop keeps', async () => {
  const out = await marketingMockup(await art(), 1, 'promo', 'Faux Stained Glass Nativity Wall Art');
  const dark = (p: number[]) => p[0] < 90 && p[1] < 90 && p[2] < 90; // the title ink
  const anyContent = (p: number[]) => close(p, MAGENTA) || dark(p);
  const [top, bottom] = await span(out, anyContent, 'rows');
  const [left, right] = await span(out, anyContent, 'cols');
  assert.ok(top >= PROMO_SAFE.top - 2, `content starts at row ${top}`);
  assert.ok(bottom <= PROMO_SAFE.bottom + 2, `content ends at row ${bottom}`);
  assert.ok(left >= PROMO_SAFE.left - 4 && right <= PROMO_SAFE.right + 4, `content spans ${left}-${right}`);
  // And there really is a title below the art.
  const [, artBottom] = await span(out, (p) => close(p, MAGENTA), 'rows');
  const [inkTop] = await span(out, dark, 'rows');
  assert.ok(inkTop > artBottom, 'the title sits under the art');
});

test('long SEO titles wrap to at most three lines and end on a whole word', () => {
  const title =
    'Nativity Scene Stained Glass Art Holy Family Christmas Wall Decor Baby Jesus Manger Religious Gift For Her';
  const { lines, fontSize } = wrapTitle(title);
  assert.ok(lines.length >= 1 && lines.length <= 3);
  assert.ok(fontSize >= 46);
  const words = title.split(' ');
  for (const w of lines.join(' ').split(' ')) assert.ok(words.includes(w), `"${w}" is a whole word`);
  assert.ok(title.startsWith(lines.join(' ')), 'keeps the first words, in order');
});

test('a short title keeps the largest type', () => {
  assert.deepEqual(wrapTitle('Nativity Wall Art'), { lines: ['Nativity Wall Art'], fontSize: 64 });
  assert.deepEqual(wrapTitle('  '), { lines: [], fontSize: 64 });
});

test('pins get different backdrops, and the rotation wraps', async () => {
  const a = await art();
  const [one, two, wrap] = await Promise.all([
    marketingMockup(a, 1, 'promo', 'T'),
    marketingMockup(a, 2, 'promo', 'T'),
    marketingMockup(a, BACKDROPS.length + 1, 'promo', 'T'),
  ]);
  assert.notDeepEqual(await pixel(one, 10, 10), await pixel(two, 10, 10));
  assert.deepEqual(await pixel(wrap, 10, 10), await pixel(one, 10, 10));
});

test('Unframed wall art has no title text', async () => {
  const unframed = await marketingMockup(await art(), 1, 'unframed');
  const dark = (p: number[]) => p[0] < 90 && p[1] < 90 && p[2] < 90;
  const [inkTop] = await span(unframed, dark, 'rows');
  assert.equal(inkTop, -1, 'no title ink on unframed');
  const [top, bottom] = await span(unframed, (p) => close(p, MAGENTA), 'rows');
  assert.ok(bottom - top > 700, 'the art is shown large');
});
