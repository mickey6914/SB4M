import Anthropic from '@anthropic-ai/sdk';
import type { FastifyInstance } from 'fastify';

// Claude copywriting, server-side per the handoff: a Claude subscription does
// not cover programmatic calls, so this needs ANTHROPIC_API_KEY with its own
// billing. The prompt contract and JSON shape come from the README's "AI
// copywriting" section. Failure is always an inline-friendly message — the
// review inspector renders it next to the button and never throws.

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5';

const FAILURE = 'Could not write that one — try again.';

export type PinCopy = {
  title: string;
  desc: string;
  keywords: string[];
};

type CopywriteBody = {
  product?: string;
  scenes?: string[];
  styleDirection?: string;
};

const SYSTEM = `You write Pinterest pin copy for product listings. Respond with minified JSON only, exactly this shape: {"title":...,"desc":...,"keywords":[...]}.
Rules:
- "title": under 60 characters, keyword-led, no emoji, Title Case.
- "desc": exactly two short, warm sentences, and the whole string must end with " #ad".
- "keywords": exactly five lowercase Pinterest search phrases, each 2-4 words.
No markdown fences, no commentary, nothing outside the JSON object.`;

// Parse by slicing between the first { and last } to survive a stray
// markdown fence, then validate the contract.
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
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  const desc = typeof obj.desc === 'string' ? obj.desc.trim() : '';
  const keywords = Array.isArray(obj.keywords)
    ? obj.keywords.filter((k): k is string => typeof k === 'string' && k.trim() !== '').map((k) => k.trim().toLowerCase())
    : [];
  if (!title || !desc || keywords.length < 5) return null;
  return { title, desc: desc.endsWith(' #ad') ? desc : `${desc} #ad`, keywords: keywords.slice(0, 5) };
}

export function registerCopywriteRoutes(app: FastifyInstance) {
  app.post<{ Body: CopywriteBody }>('/api/copywrite', async (req, reply) => {
    const product = req.body?.product?.trim();
    const scenes = (req.body?.scenes ?? []).filter((s) => typeof s === 'string');
    const styleDirection = req.body?.styleDirection?.trim();

    if (!product) {
      return reply.status(422).send({ ok: false, message: 'Add a product description first — it is what the copy is written from.' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return reply.status(503).send({
        ok: false,
        message: 'The server has no Anthropic API key yet — set ANTHROPIC_API_KEY to enable AI copywriting.',
      });
    }

    const client = new Anthropic();
    const user = [
      `Product: ${product}`,
      scenes.length ? `Inspiration scenes: ${scenes.join(', ')}` : null,
      styleDirection ? `Style direction: ${styleDirection}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        output_config: { effort: 'low' },
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
      });
      if (response.stop_reason === 'refusal') {
        return reply.status(502).send({ ok: false, message: FAILURE });
      }
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const copy = parsePinCopy(text);
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
