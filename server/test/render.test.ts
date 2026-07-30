import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  CROP_SIZES,
  overlayTop,
  renderAll,
  renderCrop,
  type CropRatio,
} from '../src/crops/render.js';

// A deterministic source: a 1600x1200 two-tone test card.
async function testSource(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200">
    <rect width="1600" height="1200" fill="#d7d3d3"/>
    <rect x="500" y="300" width="600" height="600" fill="#444141"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

test('each ratio renders at its network-native pixel size', async () => {
  const source = await testSource();
  for (const ratio of Object.keys(CROP_SIZES) as CropRatio[]) {
    const out = await renderCrop(source, ratio, { text: 'EXPRESS ART VIBE', pos: 'bottom' });
    const meta = await sharp(out).metadata();
    assert.equal(meta.width, CROP_SIZES[ratio].width, `${ratio} width`);
    assert.equal(meta.height, CROP_SIZES[ratio].height, `${ratio} height`);
    assert.equal(meta.format, 'jpeg');
  }
});

test('overlay is re-placed per position, not sliced: anchors differ', () => {
  const barHeight = Math.round(1000 * 0.085);
  assert.equal(overlayTop('top', 1500, barHeight), 0);
  assert.equal(overlayTop('middle', 1500, barHeight), Math.round((1500 - barHeight) / 2));
  assert.equal(overlayTop('bottom', 1500, barHeight), 1500 - barHeight);
});

test('overlay position actually changes the rendered pixels', async () => {
  const source = await testSource();
  const top = await renderCrop(source, '1:1', { text: 'EAV', pos: 'top' });
  const bottom = await renderCrop(source, '1:1', { text: 'EAV', pos: 'bottom' });
  assert.notDeepEqual(top, bottom);

  // The accent bar sits in the top strip of the 'top' render and not in the
  // 'bottom' render's top strip.
  const stripOf = async (img: Buffer) => {
    const { data } = await sharp(img)
      .extract({ left: 0, top: 10, width: 40, height: 10 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return data;
  };
  const topStrip = await stripOf(top);
  const bottomStrip = await stripOf(bottom);
  // Accent #ec3013: red channel high, green low.
  assert.ok(topStrip[0] > 200 && topStrip[1] < 90, 'accent bar at top of top-anchored render');
  assert.ok(!(bottomStrip[0] > 200 && bottomStrip[1] < 90), 'no bar at top of bottom-anchored render');
});

test('no overlay renders clean crops', async () => {
  const source = await testSource();
  const out = await renderCrop(source, '9:16', null);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1920);
});

test('renderAll returns every requested ratio', async () => {
  const source = await testSource();
  const out = await renderAll(source, ['2:3', '4:5'], { text: 'EAV', pos: 'middle' });
  assert.deepEqual(Object.keys(out).sort(), ['2:3', '4:5']);
});
