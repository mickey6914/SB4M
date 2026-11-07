import type { Signal } from './types.js';

// Pure parsers, one per source response. Each takes the decoded JSON exactly
// as the service returns it and yields Signals, ignoring anything malformed —
// these are unofficial or loosely documented shapes, so nothing here throws.

const DAY = 86_400_000;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function dedupe(signals: Signal[]): Signal[] {
  const seen = new Set<string>();
  return signals.filter((s) => {
    const k = `${s.source}|${s.text.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Google (client=firefox) and Bing (osjson) both answer in the OpenSearch
// suggestions format: ["query", ["suggestion 1", "suggestion 2", ...]].
export function parseOpenSearch(json: unknown, source: 'google' | 'bing', seed: string): Signal[] {
  if (!Array.isArray(json) || !Array.isArray(json[1])) return [];
  return dedupe(
    (json[1] as unknown[])
      .map(str)
      .filter((s): s is string => Boolean(s))
      .map((text, i) => ({ source, kind: 'suggestion' as const, text, seed, metrics: { rank: i + 1 } }))
  );
}

// completion.amazon.com: { suggestions: [{ value: "..." }, ...] }
export function parseAmazonSuggest(json: unknown, seed: string): Signal[] {
  const list = (json as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(list)) return [];
  return dedupe(
    list
      .map((s) => str((s as { value?: unknown })?.value))
      .filter((s): s is string => Boolean(s))
      .map((text, i) => ({ source: 'amazon' as const, kind: 'suggestion' as const, text, seed, metrics: { rank: i + 1 } }))
  );
}

// Pinterest API v5, GET /trends/keywords/{region}/top/{trend_type}:
// { trends: [{ keyword, pct_growth_wow, pct_growth_mom, pct_growth_yoy }] }
export function parsePinterestTrends(json: unknown): Signal[] {
  const list = (json as { trends?: unknown })?.trends;
  if (!Array.isArray(list)) return [];
  return dedupe(
    list
      .map((t, i): Signal | null => {
        const o = t as Record<string, unknown>;
        const text = str(o.keyword);
        if (!text) return null;
        return {
          source: 'pinterest',
          kind: 'trend',
          text,
          url: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(text)}`,
          metrics: {
            rank: i + 1,
            growthWow: num(o.pct_growth_wow),
            growthMom: num(o.pct_growth_mom),
            growthYoy: num(o.pct_growth_yoy),
          },
        };
      })
      .filter((s): s is Signal => s !== null)
  );
}

// Etsy Open API v3, GET /application/listings/active:
// { count, results: [{ title, tags, url, num_favorers, views,
//   original_creation_timestamp (seconds), price: { amount, divisor, currency_code } }] }
export function parseEtsyListings(json: unknown, seed: string, now = Date.now()): { total: number; signals: Signal[] } {
  const o = json as { count?: unknown; results?: unknown };
  const list = Array.isArray(o?.results) ? o.results : [];
  const signals = list
    .map((r, i): Signal | null => {
      const l = r as Record<string, unknown>;
      const text = str(l.title);
      if (!text) return null;
      const created = num(l.original_creation_timestamp) ?? num(l.creation_timestamp);
      const price = l.price as { amount?: unknown; divisor?: unknown; currency_code?: unknown } | undefined;
      const amount = num(price?.amount);
      const divisor = num(price?.divisor) || 100;
      return {
        source: 'etsy',
        kind: 'listing',
        text: decodeEntities(text),
        url: str(l.url),
        seed,
        tags: Array.isArray(l.tags) ? (l.tags as unknown[]).map(str).filter((t): t is string => Boolean(t)) : [],
        metrics: {
          rank: i + 1,
          favorites: num(l.num_favorers),
          views: num(l.views),
          ageDays: created ? Math.max(1, Math.round((now - created * 1000) / DAY)) : undefined,
          price: amount !== undefined ? amount / divisor : undefined,
          currency: str(price?.currency_code),
        },
      };
    })
    .filter((s): s is Signal => s !== null);
  return { total: num(o?.count) ?? signals.length, signals };
}

// Shopify's public storefront feed, GET /products.json:
// { products: [{ title, handle, product_type, tags, created_at, variants: [{ price }] }] }
// Tags arrive as an array on current stores and a comma string on older ones.
export function parseShopifyProducts(json: unknown, store: string, now = Date.now()): Signal[] {
  const list = (json as { products?: unknown })?.products;
  if (!Array.isArray(list)) return [];
  return list
    .map((p, i): Signal | null => {
      const o = p as Record<string, unknown>;
      const text = str(o.title);
      if (!text) return null;
      const rawTags = o.tags;
      const tags = Array.isArray(rawTags)
        ? (rawTags as unknown[]).map(str).filter((t): t is string => Boolean(t))
        : typeof rawTags === 'string'
          ? rawTags.split(',').map((t) => t.trim()).filter(Boolean)
          : [];
      const type = str(o.product_type);
      if (type) tags.push(type);
      const created = str(o.created_at) ?? str(o.published_at);
      const createdMs = created ? Date.parse(created) : NaN;
      const variants = Array.isArray(o.variants) ? (o.variants as Record<string, unknown>[]) : [];
      const prices = variants.map((v) => num(v.price)).filter((n): n is number => n !== undefined);
      const handle = str(o.handle);
      return {
        source: 'shopify',
        kind: 'product',
        text: decodeEntities(text),
        url: handle ? `https://${store}/products/${handle}` : undefined,
        store,
        tags,
        metrics: {
          rank: i + 1,
          ageDays: Number.isFinite(createdMs) ? Math.max(1, Math.round((now - createdMs) / DAY)) : undefined,
          price: prices.length ? Math.min(...prices) : undefined,
        },
      };
    })
    .filter((s): s is Signal => s !== null);
}

// SerpApi engine=google_trends, data_type=RELATED_QUERIES:
// { related_queries: { rising: [{ query, extracted_value }], top: [...] } }
export function parseGoogleTrendsRelated(json: unknown, seed: string): Signal[] {
  const rq = (json as { related_queries?: { rising?: unknown; top?: unknown } })?.related_queries;
  const rising = Array.isArray(rq?.rising) ? rq.rising : [];
  return dedupe(
    rising
      .map((q, i): Signal | null => {
        const o = q as Record<string, unknown>;
        const text = str(o.query);
        if (!text) return null;
        return {
          source: 'google_trends',
          kind: 'trend',
          text,
          seed,
          url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(text)}`,
          metrics: { rank: i + 1, rising: num(o.extracted_value) },
        };
      })
      .filter((s): s is Signal => s !== null)
  );
}

// SerpApi engine=amazon: { organic_results: [{ title, link, extracted_price,
//   rating, reviews, bought_last_month: "2K+ bought in past month" }] }
export function parseAmazonResults(json: unknown, seed: string): Signal[] {
  const list = (json as { organic_results?: unknown })?.organic_results;
  if (!Array.isArray(list)) return [];
  return list
    .map((r, i): Signal | null => {
      const o = r as Record<string, unknown>;
      const text = str(o.title);
      if (!text) return null;
      return {
        source: 'amazon',
        kind: 'product',
        text,
        url: str(o.link),
        seed,
        metrics: {
          rank: i + 1,
          price: num(o.extracted_price),
          rating: num(o.rating),
          reviews: num(o.reviews),
          boughtLastMonth: parseBoughtCount(o.bought_last_month),
        },
      };
    })
    .filter((s): s is Signal => s !== null);
}

// "2K+ bought in past month" → 2000; "500+ bought" → 500.
export function parseBoughtCount(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return undefined;
  const m = /([\d.,]+)\s*([km])?\+?/i.exec(v);
  if (!m) return undefined;
  const base = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return undefined;
  const mult = m[2]?.toLowerCase() === 'k' ? 1000 : m[2]?.toLowerCase() === 'm' ? 1_000_000 : 1;
  return Math.round(base * mult);
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
