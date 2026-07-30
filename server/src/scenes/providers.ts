import sharp from 'sharp';

// Scene-background providers. The hybrid rule: a provider only ever
// generates an EMPTY background. The seller's product photograph is
// composited on top afterwards (see compose.ts) and is never sent through a
// generative model, so the product cannot be altered.
//
// Which provider runs is a setting (SCENE_PROVIDER), so switching between
// Google and OpenAI is an env change, not a rebuild.

export type ProviderName = 'google' | 'openai' | 'procedural';

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
  const raw = (process.env.SCENE_PROVIDER ?? '').toLowerCase();
  if (raw === 'google' || raw === 'openai' || raw === 'procedural') return raw;
  // Fall back to whichever key exists; procedural keeps the app usable with
  // no keys at all.
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return 'google';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'procedural';
}

export function providerStatus() {
  return {
    active: configuredProvider(),
    google: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    models: {
      google: process.env.GOOGLE_IMAGE_MODEL ?? 'imagen-4.0-fast-generate-001',
      openai: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1-mini',
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

// — Google (Imagen / Gemini image, a.k.a. Nano Banana) —

async function generateGoogle(req: SceneRequest): Promise<SceneResult> {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    return { ok: false, provider: 'google', message: 'No Google API key — set GEMINI_API_KEY.' };
  }
  const model = process.env.GOOGLE_IMAGE_MODEL ?? 'imagen-4.0-fast-generate-001';
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          instances: [{ prompt: backgroundPrompt(req) }],
          parameters: { sampleCount: 1, aspectRatio: '1:1' },
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      return { ok: false, provider: 'google', message: `Google rejected the request (${res.status}). ${detail}`.trim() };
    }
    const json: any = await res.json();
    const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
    if (typeof b64 !== 'string') {
      return { ok: false, provider: 'google', message: 'Google returned no image data.' };
    }
    return { ok: true, image: Buffer.from(b64, 'base64'), provider: 'google', model };
  } catch {
    return { ok: false, provider: 'google', message: 'Could not reach Google image generation.' };
  }
}

// — OpenAI (GPT Image) —

async function generateOpenAI(req: SceneRequest): Promise<SceneResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { ok: false, provider: 'openai', message: 'No OpenAI API key — set OPENAI_API_KEY.' };
  }
  const model = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1-mini';
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
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
  if (provider === 'google') return generateGoogle(req);
  if (provider === 'openai') return generateOpenAI(req);
  return generateProcedural(req);
}
