import type { FastifyInstance } from 'fastify';
import {
  detectSource,
  parseListingHtml,
  shopifyProductToListing,
  type Listing,
} from './parse.js';

// Ingestion route. Failure is a structured, honest answer — never a throw —
// because the wizard's upload zones are the universal fallback and the UI
// steers there.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const MAX_BYTES = 2_500_000;
const TIMEOUT_MS = 12_000;

type IngestError = {
  ok: false;
  error: 'invalid_url' | 'blocked' | 'unreachable' | 'not_product';
  message: string;
};

type IngestOk = { ok: true; listing: Listing };

// SSRF guard: the server fetches user-supplied URLs, so refuse anything that
// points inside our own network. Hostname-literal checks cover the common
// cases; the post-fetch check below re-validates the redirect destination.
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

function validateUrl(raw: string): URL | IngestError {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'invalid_url', message: 'That doesn’t look like a link — paste the full product URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'invalid_url', message: 'Only http(s) product links are supported.' };
  }
  if (isPrivateHost(url.hostname)) {
    return { ok: false, error: 'invalid_url', message: 'That address can’t be reached from here.' };
  }
  return url;
}

async function fetchText(url: string): Promise<{ status: number; body: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'en',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const finalUrl = res.url || url;
    if (isPrivateHost(new URL(finalUrl).hostname)) return null;
    const body = (await res.text()).slice(0, MAX_BYTES);
    return { status: res.status, body, finalUrl };
  } catch {
    return null;
  }
}

const UPLOAD_HINT = ' Drop the product photos into the upload zones instead — the run works the same either way.';

export async function ingestListing(rawUrl: string): Promise<IngestOk | IngestError> {
  const url = validateUrl(rawUrl);
  if (!(url instanceof URL)) return url;
  const source = detectSource(url);

  // Shopify special case: most public Shopify stores expose the product as
  // clean JSON at /products/<handle>.json — try it before parsing HTML.
  if (/\/products\/[^/]+\/?$/.test(url.pathname)) {
    const jsonUrl = `${url.origin}${url.pathname.replace(/\/$/, '')}.json`;
    const res = await fetchText(jsonUrl);
    if (res && res.status === 200) {
      try {
        const listing = shopifyProductToListing(JSON.parse(res.body), url.href);
        if (listing) return { ok: true, listing: { ...listing, source: 'shopify' } };
      } catch {
        // Not JSON after all — fall through to the HTML path.
      }
    }
  }

  const page = await fetchText(url.href);
  if (!page) {
    return {
      ok: false,
      error: 'unreachable',
      message: 'That link didn’t answer in time.' + UPLOAD_HINT,
    };
  }
  if (page.status === 403 || page.status === 429 || page.status === 503) {
    const who = source === 'amazon' ? 'Amazon' : 'The site';
    return {
      ok: false,
      error: 'blocked',
      message: `${who} blocked the request — that’s common for ${source === 'amazon' ? 'Amazon' : 'protected'} links.` + UPLOAD_HINT,
    };
  }
  if (page.status >= 400) {
    return {
      ok: false,
      error: 'unreachable',
      message: `The link answered with an error (${page.status}).` + UPLOAD_HINT,
    };
  }

  const listing = parseListingHtml(page.body, page.finalUrl);
  if (!listing) {
    return {
      ok: false,
      error: 'not_product',
      message: 'No product images were found at that link.' + UPLOAD_HINT,
    };
  }
  return { ok: true, listing: { ...listing, source } };
}

export function registerIngestRoutes(app: FastifyInstance) {
  app.post<{ Body: { url?: string } }>('/api/ingest', async (req, reply) => {
    const raw = req.body?.url;
    if (typeof raw !== 'string' || !raw.trim()) {
      return reply.status(400).send({
        ok: false,
        error: 'invalid_url',
        message: 'Paste a product link first.',
      } satisfies IngestError);
    }
    const result = await ingestListing(raw);
    return reply.status(result.ok ? 200 : 422).send(result);
  });
}
