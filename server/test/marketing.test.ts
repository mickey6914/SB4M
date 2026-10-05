import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { BACKDROPS, isBasicMarketing, MARKETING_SIZE, marketingMockup } from '../src/scenes/marketing.js';

async function art(): Promise<Buffer> {
  // A flat magenta square: any redraw or recolour of the art would show.
  return sharp({ create: { width: 900, height: 900, channels: 3, background: '#d01c8b' } })
    .png()
    .toBuffer();
}

async function pixel(img: Buffer, x: number, y: number): Promise<number[]> {
  const { data } = await sharp(img).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}

const close = (a: number[], b: number[], tol = 12) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test('the label is recognised whatever its case', () => {
  assert.ok(isBasicMarketing('Basic marketing'));
  assert.ok(isBasicMarketing(' basic MARKETING '));
  assert.ok(!isBasicMarketing('Wall art'));
  assert.ok(!isBasicMarketing(undefined));
});

test('a basic marketing mockup is 2:3 and keeps the artwork’s own colours', async () => {
  const out = await marketingMockup(await art(), 1);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, MARKETING_SIZE.width);
  assert.equal(meta.height, MARKETING_SIZE.height);
  // The middle of the frame is the art, untouched.
  const centre = await pixel(out, MARKETING_SIZE.width / 2, Math.round(MARKETING_SIZE.height * 0.47));
  assert.ok(close(centre, [0xd0, 0x1c, 0x8b]), `centre is ${centre}`);
  // A corner is the plain backdrop, not art.
  const corner = await pixel(out, 10, 10);
  assert.ok(!close(corner, [0xd0, 0x1c, 0x8b]), `corner is ${corner}`);
});

test('pins on this mockup get different backdrops, not identical images', async () => {
  const a = art();
  const [one, two] = await Promise.all([marketingMockup(await a, 1), marketingMockup(await a, 2)]);
  assert.notDeepEqual(await pixel(one, 10, 10), await pixel(two, 10, 10));
  // And the rotation wraps rather than running off the end.
  const wrap = await marketingMockup(await a, BACKDROPS.length + 1);
  assert.deepEqual(await pixel(wrap, 10, 10), await pixel(one, 10, 10));
});

test('a tall artwork is fitted, never cropped', async () => {
  const tall = await sharp({ create: { width: 400, height: 1600, channels: 3, background: '#1f7a4a' } }).png().toBuffer();
  const out = await marketingMockup(tall, 1);
  // Art reaches near the top and bottom of its frame area but stays inside the canvas.
  const top = await pixel(out, MARKETING_SIZE.width / 2, Math.round(MARKETING_SIZE.height * 0.2));
  assert.ok(close(top, [0x1f, 0x7a, 0x4a]), `upper art is ${top}`);
});

test('Unframed wall art is recognised and has no frame around the art', async () => {
  const { compositeStyleFor } = await import('../src/scenes/marketing.js');
  assert.equal(compositeStyleFor('Unframed wall art'), 'unframed');
  assert.equal(compositeStyleFor('Basic marketing'), 'framed');
  assert.equal(compositeStyleFor('Wall art'), null);

  const a = await art();
  const framed = await marketingMockup(a, 1, 'framed');
  const unframed = await marketingMockup(a, 1, 'unframed');
  // Find the art's left edge on the middle row, then look just outside it:
  // framed has the white mat there, unframed has the backdrop (or its shadow).
  const row = Math.round(MARKETING_SIZE.height * 0.47);
  async function leftEdge(img: Buffer): Promise<number> {
    for (let x = 0; x < MARKETING_SIZE.width; x++) {
      if (close(await pixel(img, x, row), [0xd0, 0x1c, 0x8b])) return x;
    }
    return -1;
  }
  const fx = await leftEdge(framed);
  const ux = await leftEdge(unframed);
  assert.ok(fx > 0 && ux > 0);
  assert.ok(close(await pixel(framed, fx - 5, row), [255, 255, 255]), 'framed has a white mat');
  assert.ok(!close(await pixel(unframed, ux - 5, row), [255, 255, 255], 6), 'unframed has no mat');
  // And with no frame to make room for, the art is shown larger.
  assert.ok(ux < fx, 'unframed art is wider');
});
