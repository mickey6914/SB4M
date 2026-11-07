import { isPrivateHost } from '../shared/load-image.js';
import { expansionsFor } from './lexicon.js';
import {
  parseAmazonResults,
  parseAmazonSuggest,
  parseEtsyListings,
  parseGoogleTrendsRelated,
  parseOpenSearch,
  parsePinterestTrends,
  parseShopifyProducts,
} from './parse.js';
import type { Niche, Signal, SourceId, SourceReport } from './types.js';

// One collector per source. Each returns a SourceReport and never throws: a
// source that has no key says so ("not_configured"), one that errors says
// what happened ("failed"), and the report goes ahead on whatever answered.
//
// Free, keyless sources: Google / Bing / Amazon autocomplete and Shopify's
// public /products.json. Keyed: Etsy (official API), Pinterest Trends
// (official API), and SerpApi for Google Trends + Amazon product results.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TIMEOUT_MS = 10_000;

export const SOURCE_LABELS: Record<SourceId, string> = {
  google: 'Google search',
  google_trends: 'Google Trends',
  bing: 'Bing search',
  pinterest: 'Pinterest Trends',
  etsy: 'Etsy marketplace',
  amazon: 'Amazon marketplace',
  shopify: 'Shopify storefronts',
  web: 'Web trend reports (Claude web search)',
};

export type ResearchInput = {
  niche: Niche;
  seeds: string[];
  sources: SourceId[];
  shopifyStores: string[];
  region: string;
};

type FetchFn = typeof fetch;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function getJson(url: string, init: RequestInit = {}, fetchImpl: FetchFn = fetch): Promise<unknown> {
  const res = await fetchImpl(url, {
    ...init,
    headers: { 'user-agent': UA, accept: 'application/json', 'accept-language': 'en-US,en', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(res.status, 'answered with something other than JSON');
  }
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function sourceConfig() {
  return {
    google: { configured: true, note: 'Autocomplete — free, no key' },
    bing: { configured: true, note: 'Autocomplete — free, no key' },
    amazon: {
      configured: true,
      note: env('SERPAPI_API_KEY')
        ? 'Autocomplete + top products (SerpApi)'
        : 'Autocomplete only — add SERPAPI_API_KEY for products, reviews and "bought in past month"',
    },
    shopify: { configured: true, note: 'Public /products.json of the stores you list — free, no key' },
    google_trends: {
      configured: Boolean(env('SERPAPI_API_KEY')),
      note: env('SERPAPI_API_KEY') ? 'Rising related queries (SerpApi)' : 'Needs SERPAPI_API_KEY',
    },
    etsy: {
      configured: Boolean(env('ETSY_API_KEY')),
      note: env('ETSY_API_KEY') ? 'Official Open API v3' : 'Needs ETSY_API_KEY (free developer key)',
    },
    pinterest: {
      configured: Boolean(env('PINTEREST_ACCESS_TOKEN')),
      note: env('PINTEREST_ACCESS_TOKEN') ? 'Official Trends API' : 'Needs PINTEREST_ACCESS_TOKEN',
    },
    web: {
      configured: Boolean(env('PIN_POST_ANTHROPIC_KEY') || env('ANTHROPIC_API_KEY')),
      note: 'Claude searches the web for current trend reports — uses the Anthropic key',
    },
  } satisfies Record<SourceId, { configured: boolean; note: string }>;
}

function report(source: SourceId, partial: Partial<SourceReport> & Pick<SourceReport, 'status' | 'message'>): SourceReport {
  return { source, label: SOURCE_LABELS[source], signals: [], ...partial };
}

function describe(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401 || err.status === 403) return `refused the key or the request (${err.status})`;
    if (err.status === 429) return 'is rate-limiting us — try again in a few minutes';
    return err.message;
  }
  if ((err as Error)?.name === 'TimeoutError') return 'did not answer in time';
  return 'could not be reached';
}

// Runs every request, keeps whatever succeeded, and reports failure only when
// nothing did — one blocked expansion should not sink the whole source.
async function settle<T>(tasks: Promise<T>[]): Promise<{ ok: Awaited<T>[]; errors: unknown[] }> {
  const results = await Promise.allSettled(tasks);
  return {
    ok: results.filter((r): r is PromiseFulfilledResult<Awaited<T>> => r.status === 'fulfilled').map((r) => r.value),
    errors: results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason),
  };
}

function finish(source: SourceId, ok: Signal[][], errors: unknown[], what: string): SourceReport {
  const signals = ok.flat();
  if (signals.length === 0 && errors.length > 0) {
    return report(source, { status: 'failed', message: `${SOURCE_LABELS[source]} ${describe(errors[0])}.` });
  }
  const partial = errors.length ? ` (${errors.length} request${errors.length > 1 ? 's' : ''} failed)` : '';
  return report(source, { status: 'ok', message: `${signals.length} ${what}${partial}`, signals });
}

// — Google & Bing autocomplete —

async function openSearch(source: 'google' | 'bing', input: ResearchInput, f: FetchFn): Promise<SourceReport> {
  const base =
    source === 'google'
      ? 'https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q='
      : 'https://api.bing.com/osjson.aspx?query=';
  const tasks = input.seeds.flatMap((seed) =>
    expansionsFor(seed).map(async (q) => parseOpenSearch(await getJson(base + encodeURIComponent(q), {}, f), source, seed))
  );
  const { ok, errors } = await settle(tasks);
  return finish(source, ok, errors, 'search suggestions');
}

// — Amazon: autocomplete always; product results when SerpApi is set —

async function amazon(input: ResearchInput, f: FetchFn): Promise<SourceReport> {
  const suggestUrl = (q: string) =>
    'https://completion.amazon.com/api/2017/suggestions?limit=11&suggestion-type=KEYWORD&page-type=Search' +
    `&alias=aps&site-variant=desktop&mid=ATVPDKIKX0DER&lop=en_US&prefix=${encodeURIComponent(q)}`;
  const tasks: Promise<Signal[]>[] = input.seeds.flatMap((seed) =>
    expansionsFor(seed)
      .slice(0, 2)
      .map(async (q) => parseAmazonSuggest(await getJson(suggestUrl(q), {}, f), seed))
  );
  const serp = env('SERPAPI_API_KEY');
  if (serp) {
    for (const seed of input.seeds.slice(0, 3)) {
      const url = `https://serpapi.com/search.json?engine=amazon&amazon_domain=amazon.com&k=${encodeURIComponent(seed)}&api_key=${encodeURIComponent(serp)}`;
      tasks.push(getJson(url, {}, f).then((j) => parseAmazonResults(j, seed).slice(0, 20)));
    }
  }
  const { ok, errors } = await settle(tasks);
  return finish('amazon', ok, errors, serp ? 'suggestions and products' : 'search suggestions');
}

// — Google Trends via SerpApi —

async function googleTrends(input: ResearchInput, f: FetchFn): Promise<SourceReport> {
  const key = env('SERPAPI_API_KEY');
  if (!key) {
    return report('google_trends', {
      status: 'not_configured',
      message: 'Add SERPAPI_API_KEY to see rising Google searches with their growth.',
    });
  }
  const geo = input.region.toUpperCase() === 'US' ? 'US' : input.region.toUpperCase();
  const tasks = input.seeds.slice(0, 4).map(async (seed) => {
    const url =
      `https://serpapi.com/search.json?engine=google_trends&data_type=RELATED_QUERIES&date=today%203-m` +
      `&geo=${encodeURIComponent(geo)}&q=${encodeURIComponent(seed)}&api_key=${encodeURIComponent(key)}`;
    return parseGoogleTrendsRelated(await getJson(url, {}, f), seed);
  });
  const { ok, errors } = await settle(tasks);
  return finish('google_trends', ok, errors, 'rising searches (last 90 days)');
}

// — Pinterest Trends API v5 —

const PINTEREST_INTERESTS: Record<Niche, string[]> = {
  clipart: ['art', 'design', 'diy_and_crafts'],
  wall_art: ['art', 'home_decor', 'design'],
  home_decor: ['home_decor', 'design', 'architecture'],
};

async function pinterest(input: ResearchInput, f: FetchFn): Promise<SourceReport> {
  const token = env('PINTEREST_ACCESS_TOKEN');
  if (!token) {
    return report('pinterest', {
      status: 'not_configured',
      message: 'Add PINTEREST_ACCESS_TOKEN to pull Pinterest’s growing searches for this niche.',
    });
  }
  const region = encodeURIComponent(input.region.toUpperCase());
  const interests = PINTEREST_INTERESTS[input.niche].map((i) => `interests=${i}`).join('&');
  const headers = { authorization: `Bearer ${token}` };
  const urls = ['growing', 'monthly'].map(
    (t) => `https://api.pinterest.com/v5/trends/keywords/${region}/top/${t}?${interests}&limit=50`
  );
  // A second pass narrowed to the seeds' own words, so a general "home decor"
  // list does not drown out what the seller asked about.
  const words = [...new Set(input.seeds.flatMap((s) => s.toLowerCase().split(/\s+/)))].filter((w) => w.length > 3);
  if (words.length) {
    urls.push(
      `https://api.pinterest.com/v5/trends/keywords/${region}/top/growing?limit=50&` +
        words.slice(0, 10).map((w) => `include_keywords=${encodeURIComponent(w)}`).join('&')
    );
  }
  const { ok, errors } = await settle(urls.map(async (u) => parsePinterestTrends(await getJson(u, { headers }, f))));
  return finish('pinterest', ok, errors, 'trending Pinterest searches');
}

// — Etsy Open API v3 —

// Etsy's x-api-key is the app's keystring. Apps created since Etsy began
// issuing shared secrets send "keystring:shared_secret"; setting
// ETSY_SHARED_SECRET does that, and leaving it blank sends the keystring alone.
export function etsyKeyHeader(): string | undefined {
  const key = env('ETSY_API_KEY');
  if (!key) return undefined;
  const secret = env('ETSY_SHARED_SECRET');
  return secret && !key.includes(':') ? `${key}:${secret}` : key;
}

async function etsy(input: ResearchInput, f: FetchFn): Promise<SourceReport> {
  const key = etsyKeyHeader();
  if (!key) {
    return report('etsy', {
      status: 'not_configured',
      message: 'Add ETSY_API_KEY to read live Etsy listings: favourites, views, prices and competition.',
    });
  }
  let total = 0;
  const tasks = input.seeds.slice(0, 4).map(async (seed) => {
    const url =
      `https://openapi.etsy.com/v3/application/listings/active?limit=100&sort_on=score` +
      `&keywords=${encodeURIComponent(seed)}`;
    const parsed = parseEtsyListings(await getJson(url, { headers: { 'x-api-key': key } }, f), seed);
    total = Math.max(total, parsed.total);
    return parsed.signals;
  });
  const { ok, errors } = await settle(tasks);
  const r = finish('etsy', ok, errors, 'top-ranked active listings');
  return { ...r, totalResults: total || undefined };
}

// — Shopify storefronts —

export function normaliseStore(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  if (!/^https?:\/\//.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (isPrivateHost(u.hostname) || !u.hostname.includes('.')) return null;
    return u.hostname;
  } catch {
    return null;
  }
}

async function shopify(input: ResearchInput, f: FetchFn): Promise<SourceReport> {
  const stores = [...new Set(input.shopifyStores.map(normaliseStore).filter((s): s is string => Boolean(s)))].slice(0, 8);
  if (stores.length === 0) {
    return report('shopify', {
      status: 'skipped',
      message: 'List a few Shopify stores in your niche (e.g. competitor.com) to compare their catalogues.',
    });
  }
  const tasks = stores.map(async (store) => {
    const json = await getJson(`https://${store}/products.json?limit=250`, {}, f);
    return parseShopifyProducts(json, store);
  });
  const { ok, errors } = await settle(tasks);
  const r = finish('shopify', ok, errors, `products from ${stores.length - errors.length} of ${stores.length} stores`);
  if (r.status === 'ok' && errors.length) {
    r.message += ' — a store that fails is usually not on Shopify or has its feed turned off';
  }
  return r;
}

// — Orchestration —

export async function collect(input: ResearchInput, f: FetchFn = fetch): Promise<SourceReport[]> {
  const want = new Set(input.sources);
  const jobs: Promise<SourceReport>[] = [];
  const add = (id: SourceId, run: () => Promise<SourceReport>) => {
    if (want.has(id)) jobs.push(run().catch((err) => report(id, { status: 'failed', message: `${SOURCE_LABELS[id]} ${describe(err)}.` })));
  };
  add('google', () => openSearch('google', input, f));
  add('bing', () => openSearch('bing', input, f));
  add('google_trends', () => googleTrends(input, f));
  add('pinterest', () => pinterest(input, f));
  add('etsy', () => etsy(input, f));
  add('amazon', () => amazon(input, f));
  add('shopify', () => shopify(input, f));
  return Promise.all(jobs);
}
