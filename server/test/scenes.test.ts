import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { composeMockup, cutout } from '../src/scenes/compose.js';
import { backgroundPrompt, configuredProvider, generateBackground } from '../src/scenes/providers.js';

// A studio-style product shot: a dark square on flat white, like a listing photo.
async function productOnWhite(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
    <rect width="800" height="800" fill="#ffffff"/>
    <rect x="250" y="250" width="300" height="300" fill="#1f4f7a"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// A photo that is NOT on white — must be left alone rather than keyed.
async function productOnScene(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
    <rect width="600" height="600" fill="#7a6a58"/>
    <circle cx="300" cy="300" r="150" fill="#204060"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

// A background for the compositing tests. They are about compose.ts, not about
// which provider is configured, so pin the procedural one: otherwise a
// GEMINI_API_KEY or OPENAI_API_KEY in the ambient environment turns these into
// live, billed, network-dependent calls that fail on a quota error.
async function backdrop(scene: string, size = 1024): Promise<Buffer> {
  const saved = process.env.SCENE_PROVIDER;
  process.env.SCENE_PROVIDER = 'procedural';
  try {
    const bg = await generateBackground({ scene, width: size, height: size });
    assert.ok(bg.ok);
    return bg.image;
  } finally {
    if (saved === undefined) delete process.env.SCENE_PROVIDER;
    else process.env.SCENE_PROVIDER = saved;
  }
}

test('the background prompt demands an empty frame and a stated light direction', () => {
  const p = backgroundPrompt({ scene: 'Cozy home setting', width: 1024, height: 1024 });
  assert.match(p, /empty/i);
  assert.match(p, /no products/i);
  assert.match(p, /upper left/i);
});

test('style direction is carried into the prompt', () => {
  const p = backgroundPrompt({
    scene: 'Desk flat lay',
    styleDirection: 'warm fall colours, no people',
    width: 512,
    height: 512,
  });
  assert.match(p, /warm fall colours/);
});

test('procedural provider works with no keys at all', async () => {
  const saved = process.env.SCENE_PROVIDER;
  process.env.SCENE_PROVIDER = 'procedural';
  try {
    assert.equal(configuredProvider(), 'procedural');
    const result = await generateBackground({ scene: 'Cozy home setting', width: 512, height: 512 });
    assert.ok(result.ok);
    const meta = await sharp(result.image).metadata();
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
  } finally {
    if (saved === undefined) delete process.env.SCENE_PROVIDER;
    else process.env.SCENE_PROVIDER = saved;
  }
});

test('provider setting selects the provider without touching code', () => {
  const saved = process.env.SCENE_PROVIDER;
  try {
    process.env.SCENE_PROVIDER = 'google';
    assert.equal(configuredProvider(), 'google');
    process.env.SCENE_PROVIDER = 'openai';
    assert.equal(configuredProvider(), 'openai');
  } finally {
    if (saved === undefined) delete process.env.SCENE_PROVIDER;
    else process.env.SCENE_PROVIDER = saved;
  }
});

test('a flat white studio background is keyed out to transparency', async () => {
  const { image, keyed } = await cutout(await productOnWhite());
  assert.equal(keyed, true);
  const meta = await sharp(image).metadata();
  assert.equal(meta.hasAlpha, true);
  // Trimmed to the product itself, so much smaller than the 800px canvas.
  assert.ok((meta.width ?? 999) < 500, `trimmed width ${meta.width}`);
});

test('a photo that is not on white is left untouched rather than damaged', async () => {
  const { keyed } = await cutout(await productOnScene());
  assert.equal(keyed, false);
});

test('the composed mockup keeps the background frame size', async () => {
  const mockup = await composeMockup(await backdrop('Gift box scene'), await productOnWhite());
  const meta = await sharp(mockup).metadata();
  assert.equal(meta.width, 1024);
  assert.equal(meta.height, 1024);
});

test('the product survives compositing unaltered: its colour is present in the mockup', async () => {
  const mockup = await composeMockup(await backdrop('Linen table'), await productOnWhite(), {
    scale: 0.6,
  });
  const { data, info } = await sharp(mockup).raw().toBuffer({ resolveWithObject: true });

  // Look for the product's exact blue (#1f4f7a) somewhere in the frame.
  let found = false;
  for (let i = 0; i < data.length; i += info.channels) {
    if (
      Math.abs(data[i] - 0x1f) < 8 &&
      Math.abs(data[i + 1] - 0x4f) < 8 &&
      Math.abs(data[i + 2] - 0x7a) < 8
    ) {
      found = true;
      break;
    }
  }
  assert.ok(found, 'product pixels present and unaltered in the composed mockup');
});

test('a contact shadow grounds the product (darker band beneath it)', async () => {
  const bg = await backdrop('Studio shelf');
  const withShadow = await composeMockup(bg, await productOnWhite(), { shadow: true });
  const without = await composeMockup(bg, await productOnWhite(), { shadow: false });

  // Sample the strip just under the product baseline (0.78 of the frame).
  const strip = async (img: Buffer) => {
    const { data } = await sharp(img)
      .extract({ left: 462, top: 800, width: 100, height: 20 })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return data.reduce((a, b) => a + b, 0) / data.length;
  };
  assert.ok((await strip(withShadow)) < (await strip(without)), 'shadow darkens the contact area');
});
