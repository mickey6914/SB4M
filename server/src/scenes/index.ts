import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { composeMockup } from './compose.js';
import { generateBackground, generateMockupFromArt, providerStatus } from './providers.js';
import { templateByLabel, TEMPLATE_LABELS } from './templates.js';
import { BASIC_MARKETING, isBasicMarketing, marketingMockup } from './marketing.js';
import { loadImageSource } from '../shared/load-image.js';

// Scene mockup route: generate an empty background for a scene, composite the
// seller's real product photo onto it, return the mockup. Cached per
// (scene, style, product) so re-selecting a scene is instant and free.

type MockupBody = {
  // The mockup type — what the design goes on (a template label). When set,
  // `scene` is the setting that pin is shot in. When absent, `scene` is read
  // the old way: a template label, or a §7 hybrid backdrop name.
  mockup?: string;
  scene?: string;
  styleDirection?: string;
  product?: string; // http(s) URL or data: URL
  scale?: number;
  // Which pin this is. It separates cache entries so two pins on one template
  // do not collapse onto a single generation, AND it moves the camera, light
  // and styling — because a fresh generation of an identical prompt came back
  // an almost identical picture. See DECISIONS.md §12.
  variant?: string | number;
};

const cache = new Map<string, { image: string; provider: string; model: string }>();
// Big enough to hold a full 30-pin run's worth of distinct mockups without
// evicting the ones it generated ten seconds ago. Each entry is a JPEG data
// URL of a few hundred KB, so this is tens of MB at worst.
const CACHE_MAX = 40;

export function registerSceneRoutes(app: FastifyInstance) {
  app.get('/api/scenes/status', async () => ({ ok: true, ...providerStatus() }));

  // The mockup templates the picker offers. Served from here so the prompts
  // stay server-side and the wizard cannot drift out of step with them.
  app.get('/api/scenes/templates', async () => ({ ok: true, templates: [BASIC_MARKETING, ...TEMPLATE_LABELS] }));

  app.post<{ Body: MockupBody }>('/api/scenes/mockup', async (req, reply) => {
    const scene = (req.body?.scene ?? '').trim();
    const mockup = (req.body?.mockup ?? '').trim();
    const product = req.body?.product;
    if (mockup && !templateByLabel(mockup) && !isBasicMarketing(mockup)) {
      return reply.status(422).send({ ok: false, message: `"${mockup}" is not a mockup type this app knows.` });
    }
    if (!scene && !mockup) {
      return reply.status(422).send({ ok: false, message: 'Pick a scene first.' });
    }
    if (typeof product !== 'string' || !product) {
      return reply.status(422).send({ ok: false, message: 'No product image to place in the scene.' });
    }

    const key = JSON.stringify([
      mockup,
      scene,
      req.body?.styleDirection ?? '',
      // The whole image, hashed. A prefix and a length let a new run's photo of
      // the same size come back with the previous run's mockups.
      createHash('sha256').update(product).digest('base64'),
      req.body?.scale ?? null,
      req.body?.variant ?? null,
    ]);
    const hit = cache.get(key);
    if (hit) return reply.send({ ok: true, ...hit, cached: true });

    const productBuf = await loadImageSource(product);
    if (!productBuf) {
      return reply.status(422).send({
        ok: false,
        message: 'Could not load that product image — it may be blocked or too large.',
      });
    }

    // Basic marketing is composited here, not generated: the seller's own
    // pixels go into the frame untouched. No provider, no credits.
    if (isBasicMarketing(mockup || scene)) {
      const variantNumber = Number(req.body?.variant);
      try {
        const image = await marketingMockup(productBuf, Number.isFinite(variantNumber) ? variantNumber : undefined);
        const payload = {
          image: `data:image/jpeg;base64,${image.toString('base64')}`,
          provider: 'composite',
          model: 'basic-marketing',
        };
        cache.set(key, payload);
        if (cache.size > CACHE_MAX) {
          const oldest = cache.keys().next().value;
          if (oldest) cache.delete(oldest);
        }
        return reply.send({ ok: true, ...payload, cached: false });
      } catch (err) {
        req.log.warn({ err }, 'basic marketing mockup failed');
        return reply.status(422).send({ ok: false, message: 'Could not read that artwork — try another photo.' });
      }
    }

    // A named mockup template applies the artwork to a product and is finished
    // when it comes back — there is nothing for the compositor to do. Anything
    // else is a §7 hybrid scene: empty backdrop, product composited on top.
    const template = templateByLabel(mockup || scene);
    if (template) {
      const variantNumber = Number(req.body?.variant);
      const built = await generateMockupFromArt(productBuf, 'image/png', template, {
        variant: Number.isFinite(variantNumber) ? variantNumber : undefined,
        scene: mockup ? scene : undefined,
        styleDirection: req.body?.styleDirection,
      });
      if (!built.ok) {
        return reply.status(502).send({ ok: false, provider: 'abacus', message: built.message });
      }
      const jpeg = await sharp(built.image).jpeg({ quality: 90 }).toBuffer();
      const payload = {
        image: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
        provider: 'abacus',
        model: built.model,
      };
      cache.set(key, payload);
      if (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      return reply.send({ ok: true, ...payload, cached: false });
    }

    const bg = await generateBackground({
      scene,
      styleDirection: req.body?.styleDirection,
      width: 1024,
      height: 1024,
    });
    if (!bg.ok) {
      return reply.status(502).send({ ok: false, provider: bg.provider, message: bg.message });
    }

    try {
      const mockup = await composeMockup(bg.image, productBuf, {
        scale: req.body?.scale,
      });
      const payload = {
        image: `data:image/jpeg;base64,${mockup.toString('base64')}`,
        provider: bg.provider,
        model: bg.model,
      };
      cache.set(key, payload);
      if (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      return reply.send({ ok: true, ...payload, cached: false });
    } catch (err) {
      req.log.warn({ err }, 'scene compose failed');
      return reply.status(502).send({
        ok: false,
        message: 'Could not place the product in that scene — try another photo.',
      });
    }
  });
}
