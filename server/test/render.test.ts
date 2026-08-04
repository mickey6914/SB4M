import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  CROP_SIZES,
  overlayTop,
  renderAll,
  renderCrop,
  barHeightFor,
  fitLabel,
  overlaySvg,
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

// — The overlay has to fit inside its bar —
// SVG <text> does not wrap and does not shrink. A title wider than the bar is
// silently clipped at both ends by the viewport, so it looks like a rendered
// pin right up until you read it. The first live run produced
// "S ALLBIRDS FLIP FLOP IN ANTHRACITE COM" from a 46-character AI title.

// Mirrors the estimate the renderer sets type by, so a fit assertion here
// means the same thing the renderer means.
function estimatedWidth(label: string, fontSize: number): number {
  const tracking = Math.round(fontSize * 0.08);
  return label.length * fontSize * 0.68 + tracking * (label.length - 1);
}

const REAL_TITLE = "Men's Allbirds Flip Flop in Anthracite Comfort";

test('a long title is shrunk to fit rather than clipped', () => {
  for (const { width } of Object.values(CROP_SIZES)) {
    const { label, fontSize, truncated } = fitLabel(REAL_TITLE, width);
    assert.equal(truncated, false, `${width}px should shrink, not truncate`);
    assert.equal(label, REAL_TITLE.toUpperCase(), 'every word survives');
    assert.ok(
      estimatedWidth(label, fontSize) <= width,
      `label overflows the ${width}px bar at ${fontSize}px`
    );
  }
});

test('a short title keeps its natural size — shrinking is not applied blindly', () => {
  const width = CROP_SIZES['2:3'].width;
  const natural = Math.round(barHeightFor(width) * 0.42);
  const { label, fontSize, truncated } = fitLabel('Linen Throw', width);
  assert.equal(fontSize, natural);
  assert.equal(label, 'LINEN THROW');
  assert.equal(truncated, false);
});

test('a title too long to shrink is truncated, and the ellipsis fits too', () => {
  const width = CROP_SIZES['2:3'].width;
  const absurd = 'Handmade Personalised Watercolour Pet Portrait Keepsake Gift For Dog Lovers And Cat People Alike';
  const { label, fontSize, truncated } = fitLabel(absurd, width);
  assert.equal(truncated, true);
  assert.ok(label.endsWith('…'), 'truncation is visible, not silent');
  assert.ok(estimatedWidth(label, fontSize) <= width, 'the truncated label fits');
  // Floor is a readability limit, not an excuse to keep shrinking.
  assert.ok(fontSize >= Math.round(barHeightFor(width) * 0.42 * 0.62) - 1);
});

test('the rendered bar carries the fitted size, not the natural one', async () => {
  const width = CROP_SIZES['4:5'].width;
  const svg = overlaySvg(width, REAL_TITLE).toString();
  const natural = Math.round(barHeightFor(width) * 0.42);
  const drawn = Number(/font-size="(\d+)"/.exec(svg)?.[1]);
  assert.ok(drawn > 0 && drawn < natural, `drawn ${drawn} should be under natural ${natural}`);
  // The bar itself does not move — only the type inside it changes.
  assert.match(svg, new RegExp(`height="${barHeightFor(width)}"`));
});

test('an apostrophe in a real title survives as text, not markup', () => {
  const svg = overlaySvg(CROP_SIZES['1:1'].width, REAL_TITLE).toString();
  assert.match(svg, /MEN&#39;S|MEN'S/);
  assert.doesNotMatch(svg, /<text[^>]*>[^<]*<(?!\/text)/);
});
