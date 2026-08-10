import type { FastifyInstance } from 'fastify';
import {
  CROP_SIZES,
  DEFAULT_OVERLAY_SIZE,
  isOverlaySize,
  renderAll,
  type CropRatio,
  type OverlayPos,
  type OverlaySize,
} from './render.js';

// Crop rendering route. Accepts an http(s) source (a listing image) or a
// data: URL (a seller upload), renders the requested ratios with the overlay
// re-placed per ratio, and returns them as data URLs the review screen can
// drop straight into <img> tags. Small in-memory cache keyed on the exact
// request so overlay tweaks re-render only what changed.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const MAX_SOURCE_BYTES = 15_000_000;
const CACHE_MAX = 40;

type RenderBody = {
  src?: string;
  ratios?: string[];
  overlay?: string;
  overlayPos?: string;
  overlaySize?: string;
};

function isPrivateHost(hostname: string): boolean {
  if (process.env.ALLOW_PRIVATE_INGEST === '1') return false;
  const h = hostname.replace(/\.$/, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '0.0.0.0' || h === '::' || h === '::1' || h === '[::1]') return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

async function loadSource(src: string): Promise<Buffer | null> {
  if (src.startsWith('data:image/')) {
    const comma = src.indexOf(',');
    if (comma < 0) return null;
    try {
      const buf = Buffer.from(src.slice(comma + 1), 'base64');
      return buf.length > 0 && buf.length <= MAX_SOURCE_BYTES ? buf : null;
    } catch {
      return null;
    }
  }
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (isPrivateHost(url.hostname)) return null;
  try {
    const res = await fetch(url.href, {
      headers: { 'user-agent': UA, accept: 'image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    if (isPrivateHost(new URL(res.url || src).hostname)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 && buf.length <= MAX_SOURCE_BYTES ? buf : null;
  } catch {
    return null;
  }
}

// Tiny insertion-ordered cache; Map iteration order gives us LRU-ish eviction.
const cache = new Map<string, Record<string, string>>();

export function registerCropRoutes(app: FastifyInstance) {
  app.post<{ Body: RenderBody }>('/api/crops/render', async (req, reply) => {
    const src = req.body?.src;
    if (typeof src !== 'string' || !src) {
      return reply.status(422).send({ ok: false, message: 'No source image to crop yet.' });
    }
    const ratios = (req.body?.ratios ?? Object.keys(CROP_SIZES)).filter(
      (r): r is CropRatio => r in CROP_SIZES
    );
    if (ratios.length === 0) {
      return reply.status(422).send({ ok: false, message: 'No valid crop ratios requested.' });
    }
    const overlayText = typeof req.body?.overlay === 'string' ? req.body.overlay : '';
    const pos: OverlayPos = ['top', 'middle', 'bottom'].includes(req.body?.overlayPos ?? '')
      ? (req.body!.overlayPos as OverlayPos)
      : 'bottom';

    const size = isOverlaySize(req.body?.overlaySize ?? '')
      ? (req.body!.overlaySize as OverlaySize)
      : DEFAULT_OVERLAY_SIZE;
    const key = JSON.stringify([src.slice(0, 200), src.length, ratios, overlayText, pos, size]);
    const hit = cache.get(key);
    if (hit) return reply.send({ ok: true, images: hit });

    const source = await loadSource(src);
    if (!source) {
      return reply.status(422).send({
        ok: false,
        message: 'Could not load that image — it may be blocked or too large.',
      });
    }

    try {
      const rendered = await renderAll(
        source,
        ratios,
        overlayText.trim() ? { text: overlayText, pos, size } : null
      );
      const images: Record<string, string> = {};
      for (const [ratio, buf] of Object.entries(rendered)) {
        images[ratio] = `data:image/jpeg;base64,${buf.toString('base64')}`;
      }
      cache.set(key, images);
      if (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      return reply.send({ ok: true, images });
    } catch (err) {
      req.log.warn({ err }, 'crop render failed');
      return reply.status(502).send({
        ok: false,
        message: 'Could not render the crops from that image — try another photo.',
      });
    }
  });
}
