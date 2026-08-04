import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { composeMockup, cutout } from '../src/scenes/compose.js';
import {
  GOOGLE_DEFAULT_MODEL,
  OPENAI_DEFAULT_BASE_URL,
  backgroundPrompt,
  configuredProvider,
  generateBackground,
  googleEndpoint,
  googleRequestBody,
  googleRoute,
  imageFromGoogleResponse,
  openAiBaseUrl,
} from '../src/scenes/providers.js';

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

// — Google's two protocols —
// Which one a model speaks is decided by the model. Getting this wrong is how
// the default silently 404'd: imagen-* was retired for new accounts, and the
// gemini-*-image models that replaced it do not answer on :predict.

const SQUARE = { scene: 'Cozy home setting', width: 1024, height: 1024 };

test('the model name picks the protocol, and the default is a reachable one', () => {
  assert.equal(googleRoute('imagen-4.0-fast-generate-001'), 'predict');
  assert.equal(googleRoute('imagen-4.0-ultra-generate-001'), 'predict');
  assert.equal(googleRoute('gemini-3.1-flash-image'), 'generateContent');
  assert.equal(googleRoute('gemini-3-pro-image-preview'), 'generateContent');
  // The documented "Nano Banana" override must land on a route that exists.
  assert.equal(googleRoute(GOOGLE_DEFAULT_MODEL), 'generateContent');
  assert.match(googleEndpoint(GOOGLE_DEFAULT_MODEL), /:generateContent$/);
  assert.match(googleEndpoint('imagen-4.0-generate-001'), /:predict$/);
});

test('each protocol gets the body shape it expects, carrying the same prompt', () => {
  const predict = googleRequestBody('imagen-4.0-generate-001', SQUARE) as any;
  assert.equal(predict.instances[0].prompt, backgroundPrompt(SQUARE));
  assert.equal(predict.parameters.sampleCount, 1);

  const generate = googleRequestBody('gemini-3.1-flash-image', SQUARE) as any;
  assert.equal(generate.contents[0].parts[0].text, backgroundPrompt(SQUARE));
  // generateContent has no instances/parameters — sending them is a 400.
  assert.equal(generate.instances, undefined);
  assert.equal(generate.parameters, undefined);
});

test('the image is found in whichever place the protocol puts it', () => {
  const png = Buffer.from('not-really-a-png');
  const b64 = png.toString('base64');

  const fromPredict = imageFromGoogleResponse('imagen-4.0-generate-001', {
    predictions: [{ bytesBase64Encoded: b64 }],
  });
  assert.deepEqual(fromPredict, png);

  // A generateContent reply may lead with a text part before the image.
  const fromGenerate = imageFromGoogleResponse('gemini-3.1-flash-image', {
    candidates: [{ content: { parts: [{ text: 'Here you go' }, { inlineData: { data: b64 } }] } }],
  });
  assert.deepEqual(fromGenerate, png);

  // Snake case is the same reply in the other JSON convention.
  const snake = imageFromGoogleResponse('gemini-3.1-flash-image', {
    candidates: [{ content: { parts: [{ inline_data: { data: b64 } }] } }],
  });
  assert.deepEqual(snake, png);
});

test('a reply with no image returns null rather than throwing', () => {
  for (const [model, json] of [
    ['imagen-4.0-generate-001', { predictions: [] }],
    ['imagen-4.0-generate-001', {}],
    ['gemini-3.1-flash-image', { candidates: [{ content: { parts: [{ text: 'I cannot' }] } }] }],
    ['gemini-3.1-flash-image', { error: { code: 429 } }],
  ] as const) {
    assert.equal(imageFromGoogleResponse(model, json), null, `${model} ${JSON.stringify(json)}`);
  }
});

// — The OpenAI-compatible escape hatch —

test('the OpenAI base url is a setting, so another vendor needs no code change', () => {
  const saved = process.env.OPENAI_BASE_URL;
  try {
    delete process.env.OPENAI_BASE_URL;
    assert.equal(openAiBaseUrl(), OPENAI_DEFAULT_BASE_URL);

    process.env.OPENAI_BASE_URL = 'https://api.together.xyz/v1';
    assert.equal(openAiBaseUrl(), 'https://api.together.xyz/v1');

    // A pasted url with a trailing slash must not produce a double slash.
    process.env.OPENAI_BASE_URL = 'https://api.together.xyz/v1/';
    assert.equal(openAiBaseUrl(), 'https://api.together.xyz/v1');

    process.env.OPENAI_BASE_URL = '   ';
    assert.equal(openAiBaseUrl(), OPENAI_DEFAULT_BASE_URL);
  } finally {
    if (saved === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = saved;
  }
});
