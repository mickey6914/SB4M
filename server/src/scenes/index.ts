import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { composeMockup } from './compose.js';
import { generateBackground, generateMockupFromArt, providerStatus } from './providers.js';
import { templateByLabel, TEMPLATE_LABELS } from './templates.js';
import { loadImageSource } from '../shared/load-image.js';

// Scene mockup route: generate an empty background for a scene, composite the
// seller's real product photo onto it, return the mockup. Cached per
// (scene, style, product) so re-selecting a scene is instant and free.

type MockupBody = {
  scene?: string;
  styleDirection?: string;
  product?: string; // http(s) URL or data: URL
  scale?: number;
};

const cache = new Map<string, { image: string; provider: string; model: string }>();
const CACHE_MAX = 30;

export function registerSceneRoutes(app: FastifyInstance) {
  app.get('/api/scenes/status', async () => ({ ok: true, ...providerStatus() }));

  // The mockup templates the picker offers. Served from here so the prompts
  // stay server-side and the wizard cannot drift out of step with them.
  app.get('/api/scenes/templates', async () => ({ ok: true, templates: TEMPLATE_LABELS }));

  app.post<{ Body: MockupBody }>('/api/scenes/mockup', async (req, reply) => {
    const scene = (req.body?.scene ?? '').trim();
    const product = req.body?.product;
    if (!scene) {
      return reply.status(422).send({ ok: false, message: 'Pick a scene first.' });
    }
    if (typeof product !== 'string' || !product) {
      return reply.status(422).send({ ok: false, message: 'No product image to place in the scene.' });
    }

    const key = JSON.stringify([
      scene,
      req.body?.styleDirection ?? '',
      product.slice(0, 200),
      product.length,
      req.body?.scale ?? null,
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

    // A named mockup template applies the artwork to a product and is finished
    // when it comes back — there is nothing for the compositor to do. Anything
    // else is a §7 hybrid scene: empty backdrop, product composited on top.
    const template = templateByLabel(scene);
    if (template) {
      const built = await generateMockupFromArt(productBuf, 'image/png', template);
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
