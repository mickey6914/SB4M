import sharp from 'sharp';
import { loadImageSource } from '../shared/load-image.js';

// Scene-background providers. The hybrid rule: a provider only ever
// generates an EMPTY background. The seller's product photograph is
// composited on top afterwards (see compose.ts) and is never sent through a
// generative model, so the product cannot be altered.
//
// Which provider runs is a setting (SCENE_PROVIDER), so switching between
// Google and OpenAI is an env change, not a rebuild.

export type ProviderName = 'abacus' | 'google' | 'openai' | 'procedural';

export const PROVIDER_NAMES: ProviderName[] = ['abacus', 'google', 'openai', 'procedural'];

export function isProviderName(raw: string): raw is ProviderName {
  return (PROVIDER_NAMES as string[]).includes(raw);
}

export type SceneRequest = {
  scene: string; // e.g. "Cozy home setting"
  styleDirection?: string; // the run's free-text steer
  width: number;
  height: number;
};

export type SceneResult =
  | { ok: true; image: Buffer; provider: ProviderName; model: string }
  | { ok: false; provider: ProviderName; message: string };

export function configuredProvider(): ProviderName {
  const raw = (process.env.SCENE_PROVIDER ?? '').trim().toLowerCase();
  if (isProviderName(raw)) return raw;
  // Fall back to whichever key exists; procedural keeps the app usable with
  // no keys at all. Abacus leads because it is the one a key alone is enough
  // for — Google additionally needs billing enabled before it can generate.
  if (process.env.ABACUS_API_KEY) return 'abacus';
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return 'google';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'procedural';
}

// Defaults. Google's Imagen models were retired for new API projects in 2026
// ("no longer available to new users"), so the default is a Gemini image
// model, which is reachable — and speaks a different protocol. See
// googleRoute() below.
export const GOOGLE_DEFAULT_MODEL = 'gemini-3.1-flash-image';
export const OPENAI_DEFAULT_MODEL = 'gpt-image-1-mini';

// Abacus fronts many image models behind one key — flux_kontext, flux2_pro,
// dalle, ideogram, recraft, seedream, nano_banana_pro, midjourney. The default
// is a fast photographic one, because a background is the easy case;
// ABACUS_IMAGE_MODEL reaches the rest without a code change.
//
// Mind the spelling: these ids are underscored, not hyphenated, and the
// hyphenated guesses are rejected with a 400 rather than resolved. There is no
// "imagen" here either — Imagen is reachable through the Google box, not this
// one. `GET /v1/models` is the authority on what exists.
export const ABACUS_DEFAULT_MODEL = 'nano_banana_lite';
export const ABACUS_DEFAULT_BASE_URL = 'https://routellm.abacus.ai/v1';

export function abacusModel(): string {
  return process.env.ABACUS_IMAGE_MODEL || ABACUS_DEFAULT_MODEL;
}

export function abacusBaseUrl(): string {
  const raw = (process.env.ABACUS_BASE_URL ?? '').trim();
  return (raw || ABACUS_DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export function googleModel(): string {
  return process.env.GOOGLE_IMAGE_MODEL || GOOGLE_DEFAULT_MODEL;
}

export function openAiModel(): string {
  return process.env.OPENAI_IMAGE_MODEL || OPENAI_DEFAULT_MODEL;
}

// A misspelt SCENE_PROVIDER is indistinguishable from an unset one once it
// falls through to key detection: something still renders, just not what was
// asked for. That is not hypothetical — SCENE_PROVIDER=abacus sat in the
// deployment environment before there was an Abacus provider, quietly drawing
// through Google, and it took a failing test to notice. An unrecognised name
// is an error the caller reports, not a silent substitution.
export function providerSettingError(): string | null {
  const raw = (process.env.SCENE_PROVIDER ?? '').trim();
  if (!raw || isProviderName(raw.toLowerCase())) return null;
  return `SCENE_PROVIDER is set to "${raw}", which is not one of: ${PROVIDER_NAMES.join(', ')}.`;
}

export function providerStatus() {
  return {
    active: configuredProvider(),
    settingError: providerSettingError(),
    abacus: Boolean(process.env.ABACUS_API_KEY),
    google: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    models: {
      abacus: abacusModel(),
      google: googleModel(),
      openai: openAiModel(),
    },
  };
}

// The prompt is deliberately explicit that the frame must be EMPTY and that
// the light has a direction — the compositor uses the same direction for the
// contact shadow, which is what stops the product looking pasted on.
export function backgroundPrompt(req: SceneRequest): string {
  const style = req.styleDirection?.trim();
  return [
    `An empty ${req.scene.toLowerCase()} photographed as a product-photography backdrop.`,
    'Completely empty surface in the lower-middle of the frame where a product will be placed later.',
    'No products, no objects in the centre, no people, no text, no logos.',
    'Soft natural light falling from the upper left, gentle shadows to the lower right.',
    'Shallow depth of field, photographic, realistic.',
    style ? `Art direction: ${style}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

// — Abacus (RouteLLM) —
//
// Abacus is OpenAI-compatible for chat, but images do NOT go to
// /images/generations. They go to /chat/completions with `modalities` and
// `image_config`, and come back inside the chat reply — so OPENAI_BASE_URL
// cannot reach it and this needs its own shape. One key fronts flux, imagen,
// nano_banana_pro, midjourney and the rest, so the model is a setting.

// Reduce the requested frame to the ratio strings these models accept.
export function aspectRatioFor(req: SceneRequest): string {
  const r = req.width / Math.max(1, req.height);
  const known: [string, number][] = [
    ['1:1', 1],
    ['2:3', 2 / 3],
    ['3:2', 1.5],
    ['4:5', 0.8],
    ['9:16', 9 / 16],
    ['16:9', 16 / 9],
  ];
  return known.reduce((best, cur) =>
    Math.abs(cur[1] - r) < Math.abs(best[1] - r) ? cur : best
  )[0];
}

export function abacusRequestBody(model: string, req: SceneRequest): unknown {
  return {
    model,
    modalities: ['image', 'text'],
    messages: [{ role: 'user', content: backgroundPrompt(req) }],
    // Only what the API actually accepts. `rewrite_prompt: false` used to sit
    // here, meaning to stop a rewriter from helpfully adding a product to a
    // frame whose whole job is to be empty (§7). No such control exists —
    // every spelling of it is rejected with "Invalid configuration found for
    // generation image.", which 400s the entire request, and the documented
    // fields are output type, count, aspect ratio, quality and resolution.
    // So the empty frame rests on the prompt and on review, as it does with
    // the other providers. Verified against the live API: these two are
    // accepted, that third one is not.
    image_config: {
      aspect_ratio: aspectRatioFor(req),
      num_images: 1,
    },
  };
}

// The reply carries the image in one of three places depending on which model
// answered, so check all three. Returns a source string — a data: URL or an
// http URL — rather than bytes, leaving the fetch to the guarded loader.
export function imageFromAbacusResponse(json: any): string | null {
  const message = json?.choices?.[0]?.message;

  // 1. The OpenAI-compatible shape most models answer with.
  const images = message?.images;
  if (Array.isArray(images)) {
    for (const img of images) {
      const url = img?.image_url?.url ?? img?.url;
      if (typeof url === 'string' && url) return url;
    }
  }

  // 2. A data: URI embedded in the text content.
  const content = message?.content;
  if (typeof content === 'string') {
    const match = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/.exec(content);
    if (match) return match[0];
  }

  // 3. The Gemini-style inline block, for the models that pass it through.
  const parts = Array.isArray(content) ? content : [];
  for (const part of parts) {
    const inline = part?.inline_data ?? part?.inlineData;
    const b64 = inline?.data;
    if (typeof b64 === 'string' && b64) {
      const mime = inline?.mime_type ?? inline?.mimeType ?? 'image/png';
      return `data:${mime};base64,${b64}`;
    }
  }
  return null;
}

async function generateAbacus(req: SceneRequest): Promise<SceneResult> {
  const key = process.env.ABACUS_API_KEY;
  if (!key) {
    return { ok: false, provider: 'abacus', message: 'No Abacus API key — set ABACUS_API_KEY.' };
  }
  const model = abacusModel();
  try {
    const res = await fetch(`${abacusBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(abacusRequestBody(model, req)),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      return {
        ok: false,
        provider: 'abacus',
        message: `Abacus rejected the request (${res.status}). ${detail}`.trim(),
      };
    }
    const source = imageFromAbacusResponse(await res.json());
    if (!source) {
      return { ok: false, provider: 'abacus', message: 'Abacus returned no image data.' };
    }
    // Abacus hands back a hosted URL as often as base64, so this goes through
    // the shared loader — which carries the SSRF guard rather than fetching
    // whatever address a reply happens to name.
    const image = await loadImageSource(source);
    if (!image) {
      return {
        ok: false,
        provider: 'abacus',
        message: 'Abacus returned an image that could not be read back.',
      };
    }
    return { ok: true, image, provider: 'abacus', model };
  } catch {
    return { ok: false, provider: 'abacus', message: 'Could not reach Abacus image generation.' };
  }
}

// — Google (Imagen / Gemini image, a.k.a. Nano Banana) —
//
// Google has two image protocols on the same host, and which one a model
// speaks is decided by the model, not by us:
//
//   imagen-*        POST :predict          instances[] → predictions[].bytesBase64Encoded
//   gemini-*-image  POST :generateContent  contents[]  → candidates[].content.parts[].inlineData
//
// So the model name picks the route. The pieces are split out as pure
// functions because that is the part worth testing — building the right body
// and finding the image in the reply — while fetch itself is not.

export type GoogleRoute = 'predict' | 'generateContent';

export function googleRoute(model: string): GoogleRoute {
  return /^imagen-/i.test(model) ? 'predict' : 'generateContent';
}

export function googleEndpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:${googleRoute(model)}`;
}

export function googleRequestBody(model: string, req: SceneRequest): unknown {
  const prompt = backgroundPrompt(req);
  if (googleRoute(model) === 'predict') {
    return { instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '1:1' } };
  }
  // No imageConfig: the dedicated image models default to a square image, and
  // composeMockup() sizes itself from whatever frame comes back, so there is
  // nothing to gain by pinning a ratio we would have to guess the field name for.
  return { contents: [{ parts: [{ text: prompt }] }] };
}

// Both shapes carry the image as base64 in a different place. Returns null
// rather than throwing when the reply holds no image — a model that answers
// with text instead is a normal failure, not an exception.
export function imageFromGoogleResponse(model: string, json: any): Buffer | null {
  if (googleRoute(model) === 'predict') {
    const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
    return typeof b64 === 'string' && b64 ? Buffer.from(b64, 'base64') : null;
  }
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const inline = part?.inlineData ?? part?.inline_data;
    const b64 = inline?.data;
    if (typeof b64 === 'string' && b64) return Buffer.from(b64, 'base64');
  }
  return null;
}

async function generateGoogle(req: SceneRequest): Promise<SceneResult> {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    return { ok: false, provider: 'google', message: 'No Google API key — set GEMINI_API_KEY.' };
  }
  const model = googleModel();
  try {
    const res = await fetch(googleEndpoint(model), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(googleRequestBody(model, req)),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      return { ok: false, provider: 'google', message: `Google rejected the request (${res.status}). ${detail}`.trim() };
    }
    const image = imageFromGoogleResponse(model, await res.json());
    if (!image) {
      return { ok: false, provider: 'google', message: 'Google returned no image data.' };
    }
    return { ok: true, image, provider: 'google', model };
  } catch {
    return { ok: false, provider: 'google', message: 'Could not reach Google image generation.' };
  }
}

// — OpenAI (GPT Image), and anything that imitates it —
//
// OpenAI's images API is the most widely copied one there is, so pointing the
// base URL somewhere else is the escape hatch for this whole box: Fal,
// Together, DeepInfra, Azure or a local shim all become an env change rather
// than a code change. Which matters, because Google retired an entire model
// family out from under this file once already.

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export function openAiBaseUrl(): string {
  const raw = (process.env.OPENAI_BASE_URL ?? '').trim();
  return (raw || OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, '');
}

async function generateOpenAI(req: SceneRequest): Promise<SceneResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { ok: false, provider: 'openai', message: 'No OpenAI API key — set OPENAI_API_KEY.' };
  }
  const model = openAiModel();
  try {
    const res = await fetch(`${openAiBaseUrl()}/images/generations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        prompt: backgroundPrompt(req),
        n: 1,
        size: '1024x1024',
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      return { ok: false, provider: 'openai', message: `OpenAI rejected the request (${res.status}). ${detail}`.trim() };
    }
    const json: any = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (typeof b64 !== 'string') {
      return { ok: false, provider: 'openai', message: 'OpenAI returned no image data.' };
    }
    return { ok: true, image: Buffer.from(b64, 'base64'), provider: 'openai', model };
  } catch {
    return { ok: false, provider: 'openai', message: 'Could not reach OpenAI image generation.' };
  }
}

// — Procedural (no key, no cost) —
// A soft studio gradient with the same upper-left light direction the prompt
// asks the real providers for. Keeps the whole pipeline runnable — and
// compositing verifiable — before any image-model billing is set up.

const SCENE_TONES: { match: RegExp; top: string; bottom: string }[] = [
  { match: /cozy|home|linen|window/i, top: '#efe6db', bottom: '#cdbfae' },
  { match: /desk|studio|shelf/i, top: '#eceae7', bottom: '#c6c2bd' },
  { match: /gift|holiday|wrap/i, top: '#f2e3e0', bottom: '#cfb0aa' },
  { match: /digital|screen/i, top: '#e9ecef', bottom: '#bcc3cb' },
];

async function generateProcedural(req: SceneRequest): Promise<SceneResult> {
  const tone = SCENE_TONES.find((t) => t.match.test(req.scene)) ?? {
    top: '#eeebe7',
    bottom: '#c9c4bd',
  };
  const { width, height } = req;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0%" stop-color="${tone.top}"/>
        <stop offset="100%" stop-color="${tone.bottom}"/>
      </linearGradient>
      <radialGradient id="l" cx="0.28" cy="0.18" r="0.75">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/>
    <rect width="${width}" height="${height}" fill="url(#l)"/>
    <rect y="${Math.round(height * 0.72)}" width="${width}" height="${Math.round(height * 0.28)}"
      fill="#000000" opacity="0.05"/>
  </svg>`;
  const image = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  return { ok: true, image, provider: 'procedural', model: 'built-in gradient' };
}

export async function generateBackground(req: SceneRequest): Promise<SceneResult> {
  const provider = configuredProvider();
  const settingError = providerSettingError();
  // Refusing beats rendering through a provider nobody chose.
  if (settingError) return { ok: false, provider, message: settingError };
  if (provider === 'abacus') return generateAbacus(req);
  if (provider === 'google') return generateGoogle(req);
  if (provider === 'openai') return generateOpenAI(req);
  return generateProcedural(req);
}
