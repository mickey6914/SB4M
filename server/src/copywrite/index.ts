import Anthropic from '@anthropic-ai/sdk';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { loadImageSource } from '../shared/load-image.js';

// Claude copywriting, server-side per the handoff: a Claude subscription does
// not cover programmatic calls, so this needs ANTHROPIC_API_KEY with its own
// billing. Failure is always an inline-friendly message — the review
// inspector renders it next to the button and never throws.
//
// The contract is the seller's own listing workflow: three title suggestions,
// one description and thirteen tags, written from the DESIGN itself. The hero
// image goes to Claude as a vision input, so the copy describes what is in the
// picture rather than paraphrasing whatever title the listing already had.
// One call covers a whole run — pin 1 takes title 1, pin 2 title 2, and so on.

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5';

// Claude Code's own cloud environments warn that ANTHROPIC_API_KEY "won't be
// used to authenticate requests" — that is about how Claude Code itself signs
// in, not about us. But rather than depend on whether the variable survives
// into the container, accept a second name that nothing else lays claim to.
// Either one works; PIN_POST_ANTHROPIC_KEY wins if both are set.
function apiKey(): string | undefined {
  return process.env.PIN_POST_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || undefined;
}

const FAILURE = "Copy didn't come back. Click Rewrite with AI to try again.";

// The seller's prompt, verbatim. It is the default for the editable workspace
// setting on Connections; {product_type} is filled from the workspace's
// "Product type" field.
export const DEFAULT_COPY_PROMPT =
  'Act as an Etsy Product Listing Specialist and provide 3 seo keyword optimized title suggestions based on the product style and design, and not the current title for this product; a product description, and 13 tags that will attract buyers for this {product_type} design.';

export const DEFAULT_PRODUCT_TYPE = 'acrylic faux stained glass wall art';

export const TITLE_COUNT = 3;
export const TAG_COUNT = 13;
const TITLE_MAX = 100;

export type PinCopy = {
  titles: string[];
  description: string;
  tags: string[];
};

type CopywriteBody = {
  // The hero image: a data: URL from an upload or an http(s) listing image.
  image?: string;
  // Optional notes — a listing description, or whatever the seller typed.
  product?: string;
  productType?: string;
  prompt?: string;
  mockup?: string;
  scenes?: string[];
  styleDirection?: string;
};

// The format instruction rides after the seller's prompt so a prompt edited on
// Connections can never break parsing. #ad stays out: whether a post needs a
// disclosure is the seller's judgement, made per pin (DECISIONS.md §13).
const FORMAT = `Return only JSON, no markdown fence, no commentary: {"titles": [3 strings], "description": string, "tags": [13 strings]}.
Titles: max ${TITLE_MAX} characters, no emoji. Description: 3-5 sentences, plain text. Tags: lowercase, max 20 characters each.
Do NOT add "#ad" or any other disclosure tag — the seller adds that themselves where a pin needs it.`;

export type CopyPromptInput = {
  prompt?: string;
  productType?: string;
  mockup?: string;
  scenes?: string[];
  styleDirection?: string;
  product?: string;
  hasImage: boolean;
};

// Pure, so the exact text Claude receives is testable.
export function buildCopyPrompt(input: CopyPromptInput): string {
  const template = input.prompt?.trim() || DEFAULT_COPY_PROMPT;
  const productType = input.productType?.trim() || DEFAULT_PRODUCT_TYPE;
  const instruction = template.split('{product_type}').join(productType);

  const context = [
    input.hasImage
      ? 'Base everything on the attached product image: its subject, style, colours and design.'
      : `Product: ${productType}.`,
    input.mockup ? `It will be shown as a ${input.mockup.toLowerCase()} mockup.` : null,
    input.scenes?.length ? `Pin scenes: ${input.scenes.join(', ')}.` : null,
    input.styleDirection?.trim() ? `Style direction: ${input.styleDirection.trim()}.` : null,
    input.product?.trim() ? `Extra notes from the seller: ${input.product.trim()}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return `${instruction}\n\n${context}\n\n${FORMAT}`;
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

// Parse by slicing between the first { and last } to survive a stray
// markdown fence, then validate the contract: 3 titles, a description, 13 tags.
export function parsePinCopy(text: string): PinCopy | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  // Pinterest refuses a title over 100 characters, so one that runs long is
  // cut at a word boundary here rather than failing the post later.
  const titles = cleanList(obj.titles).map((t) =>
    t.length <= TITLE_MAX ? t : t.slice(0, TITLE_MAX).replace(/\s+\S*$/, '')
  );
  const description = typeof obj.description === 'string' ? obj.description.trim() : '';
  // cleanList already drops case-insensitive duplicates, so lowercasing here
  // cannot introduce one.
  const tags = cleanList(obj.tags).map((t) => t.toLowerCase());
  if (titles.length < TITLE_COUNT || !description || tags.length < TAG_COUNT) return null;
  // The description is returned as written — no #ad is appended. See §13.
  return {
    titles: titles.slice(0, TITLE_COUNT),
    description,
    tags: tags.slice(0, TAG_COUNT),
  };
}

// Claude reads JPEG, PNG, GIF and WebP up to 5 MB, and gains nothing past
// ~1568px on the long edge. Normalising to a modest JPEG keeps every upload
// inside those limits whatever the seller dropped in; transparent clipart is
// flattened onto white so the art reads as it would on a listing.
async function toVisionImage(source: string): Promise<string | null> {
  const buf = await loadImageSource(source);
  if (!buf) return null;
  try {
    const jpeg = await sharp(buf)
      .resize({ width: 1568, height: 1568, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer();
    return jpeg.toString('base64');
  } catch {
    return null;
  }
}

export function registerCopywriteRoutes(app: FastifyInstance) {
  app.post<{ Body: CopywriteBody }>('/api/copywrite', async (req, reply) => {
    const body = req.body ?? {};
    const image = typeof body.image === 'string' && body.image ? body.image : undefined;
    const product = typeof body.product === 'string' ? body.product.slice(0, 4000) : undefined;

    if (!image && !product?.trim()) {
      return reply.status(422).send({
        ok: false,
        message: 'Pick a hero image first — the copy is written from the design itself.',
      });
    }
    const key = apiKey();
    if (!key) {
      return reply.status(503).send({
        ok: false,
        message:
          'The server has no Anthropic API key yet — set ANTHROPIC_API_KEY (or PIN_POST_ANTHROPIC_KEY) to enable AI copywriting.',
      });
    }

    const visionData = image ? await toVisionImage(image) : null;
    if (image && !visionData && !product?.trim()) {
      return reply.status(422).send({
        ok: false,
        message: 'Could not read the hero image — try a different photo.',
      });
    }

    const text = buildCopyPrompt({
      prompt: typeof body.prompt === 'string' ? body.prompt.slice(0, 4000) : undefined,
      productType: typeof body.productType === 'string' ? body.productType.slice(0, 200) : undefined,
      mockup: typeof body.mockup === 'string' ? body.mockup.slice(0, 80) : undefined,
      scenes: (Array.isArray(body.scenes) ? body.scenes : [])
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 6),
      styleDirection: typeof body.styleDirection === 'string' ? body.styleDirection.slice(0, 400) : undefined,
      product,
      hasImage: Boolean(visionData),
    });

    const content: Anthropic.ContentBlockParam[] = visionData
      ? [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: visionData } },
          { type: 'text', text },
        ]
      : [{ type: 'text', text }];

    const client = new Anthropic({ apiKey: key });
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content }],
      });
      if (response.stop_reason === 'refusal') {
        return reply.status(502).send({ ok: false, message: FAILURE });
      }
      const out = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const copy = parsePinCopy(out);
      if (!copy) {
        return reply.status(502).send({ ok: false, message: FAILURE });
      }
      return reply.send({ ok: true, copy });
    } catch (err) {
      req.log.warn({ err }, 'copywrite failed');
      return reply.status(502).send({ ok: false, message: FAILURE });
    }
  });
}
