import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAmazonResults,
  parseAmazonSuggest,
  parseBoughtCount,
  parseEtsyListings,
  parseGoogleTrendsRelated,
  parseOpenSearch,
  parsePinterestTrends,
  parseShopifyProducts,
} from '../src/research/parse.js';
import { analyze, contentChunks, phrasesOf } from '../src/research/analyze.js';
import { buildPrompts, etsyTags, ruleIdeas } from '../src/research/prompts.js';
import { buildDigest, buildSynthesisPrompt, parseSynthesis } from '../src/research/synthesize.js';
import { collect, describe as describeError, etsyKeyHeader, getSerpJson, HttpError, NoResults, normaliseStore } from '../src/research/sources.js';
import { importReport, parseFindings, parseNumber } from '../src/research/imported.js';
import { parseRunBody } from '../src/research/index.js';
import { expansionsFor } from '../src/research/lexicon.js';
import type { SourceReport } from '../src/research/types.js';

const NOW = Date.parse('2026-11-07T00:00:00Z');

// — Parsers —

test('OpenSearch suggestions parse for Google and Bing, deduped, ranked', () => {
  const s = parseOpenSearch(['boho wall art', ['boho wall art', 'boho wall art sage green', 'Boho Wall Art']], 'google', 'boho wall art');
  assert.equal(s.length, 2);
  assert.equal(s[1].text, 'boho wall art sage green');
  assert.equal(s[1].metrics?.rank, 2);
  assert.deepEqual(parseOpenSearch({ nope: 1 }, 'bing', 'x'), []);
});

test('Amazon autocomplete parses suggestions[].value', () => {
  const s = parseAmazonSuggest({ suggestions: [{ value: 'mushroom wall art' }, { value: '' }, {}] }, 'wall art');
  assert.deepEqual(s.map((x) => x.text), ['mushroom wall art']);
});

test('Pinterest trends keep growth figures', () => {
  const s = parsePinterestTrends({ trends: [{ keyword: 'cherry red decor', pct_growth_wow: 12, pct_growth_mom: 85, pct_growth_yoy: 300 }] });
  assert.equal(s[0].metrics?.growthMom, 85);
  assert.equal(s[0].metrics?.growthYoy, 300);
  assert.match(s[0].url ?? '', /pinterest\.com\/search/);
});

test('Etsy listings: price from amount/divisor, age from creation timestamp, entity-decoded titles', () => {
  const created = Math.round((NOW - 60 * 86_400_000) / 1000);
  const { total, signals } = parseEtsyListings(
    {
      count: 41234,
      results: [
        {
          title: 'Sage Green Botanical Print &amp; Set of 3',
          tags: ['sage green', 'botanical print'],
          url: 'https://www.etsy.com/listing/1',
          num_favorers: 600,
          views: 9000,
          original_creation_timestamp: created,
          price: { amount: 1299, divisor: 100, currency_code: 'USD' },
        },
        { nope: true },
      ],
    },
    'botanical print',
    NOW
  );
  assert.equal(total, 41234);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].text, 'Sage Green Botanical Print & Set of 3');
  assert.equal(signals[0].metrics?.price, 12.99);
  assert.equal(signals[0].metrics?.ageDays, 60);
  assert.deepEqual(signals[0].tags, ['sage green', 'botanical print']);
});

test('Shopify products: array or comma-string tags, product_type kept, lowest variant price', () => {
  const s = parseShopifyProducts(
    {
      products: [
        { title: 'Retro Mushroom Print', handle: 'retro-mushroom', product_type: 'Art Print', tags: 'retro, mushroom', created_at: '2026-10-01T00:00:00Z', variants: [{ price: '24.00' }, { price: '18.00' }] },
        { title: 'Checkered Pillow', handle: 'pillow', tags: ['checkered'], variants: [] },
      ],
    },
    'example-store.com',
    NOW
  );
  assert.deepEqual(s[0].tags, ['retro', 'mushroom', 'Art Print']);
  assert.equal(s[0].metrics?.price, 18);
  assert.equal(s[0].metrics?.ageDays, 37);
  assert.equal(s[0].url, 'https://example-store.com/products/retro-mushroom');
  assert.deepEqual(s[1].tags, ['checkered']);
});

test('SerpApi: Google Trends rising queries and Amazon organic results', () => {
  const t = parseGoogleTrendsRelated({ related_queries: { rising: [{ query: 'bow clipart', extracted_value: 5000 }] } }, 'clipart');
  assert.equal(t[0].metrics?.rising, 5000);
  const a = parseAmazonResults(
    { organic_results: [{ title: 'Abstract Canvas', link: 'https://amazon.com/x', extracted_price: 29.99, rating: 4.6, reviews: 1200, bought_last_month: '2K+ bought in past month' }] },
    'wall art'
  );
  assert.equal(a[0].metrics?.boughtLastMonth, 2000);
  assert.equal(parseBoughtCount('500+ bought in past month'), 500);
  assert.equal(parseBoughtCount('1.5K+ bought'), 1500);
  assert.equal(parseBoughtCount(null), undefined);
});

// — Analysis —

test('phrases never straddle product words or stopwords', () => {
  assert.deepEqual(contentChunks('Boho Sage Green Wall Art for Living Room'), [['boho', 'sage', 'green']]);
  const p = phrasesOf('vintage mushroom wall art print');
  assert.ok(p.includes('vintage mushroom'));
  assert.ok(!p.some((x) => x.includes('art')));
});

function fixtureReports(): SourceReport[] {
  const mk = (source: SourceReport['source'], signals: SourceReport['signals']): SourceReport => ({
    source,
    label: source,
    status: 'ok',
    message: '',
    signals,
  });
  return [
    mk('google', [
      { source: 'google', kind: 'suggestion', text: 'vintage mushroom wall art', metrics: { rank: 1 } },
      { source: 'google', kind: 'suggestion', text: 'sage green botanical wall art', metrics: { rank: 2 } },
      { source: 'google', kind: 'suggestion', text: 'wall art for bedroom', metrics: { rank: 3 } },
    ]),
    mk('bing', [{ source: 'bing', kind: 'suggestion', text: 'vintage mushroom print', metrics: { rank: 1 } }]),
    mk('pinterest', [{ source: 'pinterest', kind: 'trend', text: 'mushroom decor', metrics: { growthMom: 120 } }]),
    mk('etsy', [
      { source: 'etsy', kind: 'listing', text: 'Vintage Mushroom Print, Cottagecore Decor', tags: ['mushroom print', 'cottagecore'], metrics: { favorites: 900, ageDays: 90, price: 6 } },
      { source: 'etsy', kind: 'listing', text: 'Sage Green Botanical Set of 3', tags: ['botanical', 'sage green'], metrics: { favorites: 50, ageDays: 400, price: 9 } },
      { source: 'etsy', kind: 'listing', text: 'Abstract Line Art', metrics: { favorites: 10, ageDays: 300, price: 4 } },
    ]),
  ];
}

test('analysis ranks the cross-source subject first and finds colours and styles', () => {
  const reports = fixtureReports();
  reports[3].totalResults = 41000;
  const a = analyze(reports, ['wall art']);
  assert.equal(a.subjects[0].phrase.includes('mushroom'), true, `top subject was ${a.subjects[0]?.phrase}`);
  const mush = a.keywords.find((k) => k.phrase === 'mushroom')!;
  assert.ok(mush.sources.length >= 3);
  assert.ok(mush.pinterestGrowth === 120);
  assert.ok((mush.etsyFavoritesPer30d ?? 0) > 100);
  assert.equal(a.colors[0].name, 'sage green');
  assert.equal(a.colors[0].hex, '#9CAF88');
  assert.ok(a.styles.some((s) => s.name === 'vintage'));
  assert.ok(a.styles.some((s) => s.name === 'cottagecore'));
  // "green" must not be counted separately from "sage green".
  assert.ok(!a.colors.some((c) => c.name === 'green'));
  assert.equal(a.prices.etsy?.median, 6);
  assert.equal(a.etsyCompetition, 41000);
  assert.equal(a.topListings[0].title, 'Vintage Mushroom Print, Cottagecore Decor');
  // Pure product words never become keywords.
  assert.ok(!a.keywords.some((k) => k.phrase === 'bedroom'));
});

test('analysis of nothing is empty, not an error', () => {
  const a = analyze([], []);
  assert.equal(a.signalCount, 0);
  assert.deepEqual(a.keywords, []);
});

// — Prompts & ideas —

test('clipart prompts ask for isolated elements on white; wall art for no text or frame', () => {
  const pal = [{ name: 'sage green', hex: '#9CAF88' }];
  const c = buildPrompts({ niche: 'clipart', subject: 'mushrooms', styles: ['watercolor'], palette: pal });
  assert.match(c.main, /isolated/);
  assert.match(c.main, /white background/);
  assert.match(c.main, /#9CAF88/);
  assert.equal(c.variations.length, 3);
  const w = buildPrompts({ niche: 'wall_art', subject: 'mushrooms', styles: [], palette: [] });
  assert.match(w.main, /no text, no frame/);
  assert.match(buildPrompts({ niche: 'home_decor', subject: 'x', styles: [], palette: [] }).main, /[Ss]eamless/);
});

test('Etsy tags: at most 13, each at most 20 characters, lowercase and unique', () => {
  const tags = etsyTags(['Vintage Mushroom', 'vintage mushroom', 'a very long tag that is over twenty', ...Array.from({ length: 20 }, (_, i) => `tag ${i}`)]);
  assert.equal(tags.length, 13);
  assert.equal(tags[0], 'vintage mushroom');
  assert.ok(tags.every((t) => t.length <= 20 && t === t.toLowerCase()));
});

test('rule ideas are built from real signals and carry prompts, specs and copy', () => {
  const a = analyze(fixtureReports(), ['wall art']);
  const ideas = ruleIdeas('wall_art', a, 3);
  assert.ok(ideas.length >= 1);
  assert.match(ideas[0].subject, /mushroom/);
  assert.ok(ideas[0].evidence[0].includes('across'));
  assert.ok(ideas[0].prompts.main.length > 40);
  assert.ok(ideas[0].specs.some((s) => s.includes('2:3')));
  assert.ok(ideas[0].etsy.title.length <= 140);
  assert.ok(ideas[0].etsy.tags.length > 5);
});

// — Synthesis —

const CLAUDE_REPLY = JSON.stringify({
  summary: 'Mushrooms and sage are rising.',
  themes: [{ name: 'Forest floor', summary: 'Fungi everywhere.', evidence: ['mushroom decor +120% Pinterest'] }],
  palettes: [{ name: 'Moss', colors: [{ name: 'sage', hex: '#9caf88' }, { name: 'cream', hex: '#F3EAD3' }, { name: 'bad', hex: 'green' }], note: 'Calm.' }],
  ideas: [
    {
      title: 'Vintage Mushroom Trio',
      productType: 'set of 3 printable prints',
      subject: 'vintage mushrooms',
      styles: ['vintage', 'cottagecore'],
      palette: [{ name: 'sage', hex: '#9CAF88' }],
      why: 'High favourites, few sets.',
      evidence: ['900 favourites in 90 days'],
      demand: 'high',
      competition: 'banana',
      prompts: { main: 'A vintage mushroom print', variations: ['v1', 'v2', 'v3'], negative: 'text' },
      etsy: { title: 'Vintage Mushroom Print Set of 3', tags: ['Mushroom Print', 'cottagecore decor', 'way too long tag for etsy limits'] },
    },
    { title: 'No prompts idea', subject: 'checkered bows', styles: ['coquette'] },
  ],
});

test('a Claude reply parses, invalid hexes and enums are cleaned, missing prompts are filled', () => {
  const s = parseSynthesis('```json\n' + CLAUDE_REPLY + '\n```', 'wall_art');
  assert.ok(s);
  assert.equal(s.palettes[0].colors.length, 2);
  assert.equal(s.palettes[0].colors[0].hex, '#9CAF88');
  assert.equal(s.ideas[0].competition, 'unknown');
  assert.equal(s.ideas[0].demand, 'high');
  assert.deepEqual(s.ideas[0].etsy.tags, ['mushroom print', 'cottagecore decor']);
  assert.ok(s.ideas[0].specs.length > 0);
  assert.match(s.ideas[1].prompts.main, /checkered bows/);
  assert.equal(parseSynthesis('not json', 'clipart'), null);
  assert.equal(parseSynthesis('{"ideas": []}', 'clipart'), null);
});

test('the synthesis prompt carries the data and mentions web search only when enabled', () => {
  const reports = fixtureReports();
  const digest = buildDigest('clipart', ['clipart'], reports, analyze(reports, ['clipart']));
  const withWeb = buildSynthesisPrompt('clipart', digest, true, '2026-11-07');
  const without = buildSynthesisPrompt('clipart', digest, false, '2026-11-07');
  assert.match(withWeb, /web searches/);
  assert.doesNotMatch(without, /web searches/);
  assert.match(without, /vintage mushroom wall art/);
  assert.match(without, /exactly 13 tags/);
});

// — Inputs & sources —

test('run body: niche required, defaults filled, sources filtered', () => {
  assert.ok('error' in parseRunBody({ niche: 'mugs' }));
  const r = parseRunBody({ niche: 'clipart', sources: ['google', 'myspace'], seeds: ['  bow  clipart ', 'bow clipart'] });
  assert.ok(!('error' in r));
  if ('error' in r) return;
  assert.deepEqual(r.sources, ['google']);
  assert.deepEqual(r.seeds, ['bow clipart']);
  assert.equal(r.webSearch, false);
  const d = parseRunBody({ niche: 'wall_art' });
  if ('error' in d) return assert.fail();
  assert.ok(d.seeds.length > 0);
  assert.ok(d.sources.includes('etsy'));
});

test('autocomplete expansions look at next year from September', () => {
  assert.ok(expansionsFor('wall art', new Date('2026-11-07')).includes('wall art trends 2027'));
  assert.ok(expansionsFor('wall art', new Date('2026-03-01')).includes('wall art trends 2026'));
});

test('Shopify store input is normalised and private hosts are refused', () => {
  assert.equal(normaliseStore('https://Shop.Example.com/collections/all'), 'shop.example.com');
  assert.equal(normaliseStore('example.com'), 'example.com');
  assert.equal(normaliseStore('localhost'), null);
  assert.equal(normaliseStore('192.168.1.10'), null);
  assert.equal(normaliseStore(''), null);
});

test('Etsy key header joins keystring and shared secret when both are set', () => {
  const saved = { k: process.env.ETSY_API_KEY, s: process.env.ETSY_SHARED_SECRET };
  process.env.ETSY_API_KEY = 'abc';
  process.env.ETSY_SHARED_SECRET = 'xyz';
  assert.equal(etsyKeyHeader(), 'abc:xyz');
  delete process.env.ETSY_SHARED_SECRET;
  assert.equal(etsyKeyHeader(), 'abc');
  if (saved.k === undefined) delete process.env.ETSY_API_KEY;
  else process.env.ETSY_API_KEY = saved.k;
  if (saved.s !== undefined) process.env.ETSY_SHARED_SECRET = saved.s;
});

test('collect: keyless sources run, keyed ones say not configured, failures are reported not thrown', async () => {
  const saved = { e: process.env.ETSY_API_KEY, p: process.env.PINTEREST_ACCESS_TOKEN, s: process.env.SERPAPI_API_KEY };
  delete process.env.ETSY_API_KEY;
  delete process.env.PINTEREST_ACCESS_TOKEN;
  delete process.env.SERPAPI_API_KEY;
  const fake = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes('suggestqueries.google.com')) return new Response(JSON.stringify(['q', ['bow clipart png', 'bow clipart watercolor']]));
    if (u.includes('api.bing.com')) return new Response('nope', { status: 503 });
    if (u.includes('completion.amazon.com')) return new Response(JSON.stringify({ suggestions: [{ value: 'bow stickers' }] }));
    if (u.includes('good-store.com')) return new Response(JSON.stringify({ products: [{ title: 'Pink Bow Clipart', tags: ['bow'] }] }));
    return new Response('<html>', { status: 200 });
  }) as typeof fetch;
  try {
    const reports = await collect(
      { niche: 'clipart', seeds: ['bow clipart'], sources: ['google', 'bing', 'amazon', 'etsy', 'pinterest', 'google_trends', 'shopify'], shopifyStores: ['good-store.com', 'not-shopify.com'], region: 'US' },
      fake
    );
    const by = Object.fromEntries(reports.map((r) => [r.source, r]));
    assert.equal(by.google.status, 'ok');
    assert.ok(by.google.signals.length >= 2);
    assert.equal(by.bing.status, 'failed');
    assert.equal(by.amazon.status, 'ok');
    assert.equal(by.etsy.status, 'not_configured');
    assert.equal(by.pinterest.status, 'not_configured');
    assert.equal(by.google_trends.status, 'not_configured');
    assert.equal(by.shopify.status, 'ok');
    assert.match(by.shopify.message, /1 of 2 stores/);
  } finally {
    if (saved.e !== undefined) process.env.ETSY_API_KEY = saved.e;
    if (saved.p !== undefined) process.env.PINTEREST_ACCESS_TOKEN = saved.p;
    if (saved.s !== undefined) process.env.SERPAPI_API_KEY = saved.s;
  }
});

test('nouns that double as colour or style aliases stay eligible as subjects', () => {
  const a = analyze(fixtureReports(), ['wall art']);
  assert.ok(a.subjects.some((k) => k.phrase === 'mushroom'));
  const reports = fixtureReports();
  reports[0].signals.push(
    { source: 'google', kind: 'suggestion', text: 'cherry wall art', metrics: { rank: 4 } },
    { source: 'google', kind: 'suggestion', text: 'cherry print kitchen', metrics: { rank: 5 } }
  );
  reports[1].signals.push({ source: 'bing', kind: 'suggestion', text: 'cherry wall art', metrics: { rank: 2 } });
  assert.ok(analyze(reports, ['wall art']).subjects.some((k) => k.phrase === 'cherry'));
});

test('rule ideas never repeat an overlapping subject or a style the subject already names', () => {
  const ideas = ruleIdeas('wall_art', analyze(fixtureReports(), ['wall art']), 6);
  const subjects = ideas.map((i) => i.subject);
  for (const a of subjects) for (const b of subjects) if (a !== b) assert.ok(!` ${b} `.includes(` ${a} `), `${a} overlaps ${b}`);
  for (const i of ideas) assert.ok(!i.styles.some((s) => ` ${i.subject} `.includes(` ${s} `)));
});


// — Pasted findings —

const PASTED = `Here are the findings:
\`\`\`
pinterest | cherry red kitchen decor | growth +120% | yoy 340%
pinterest | mushroom decor | monthly growth 85%
etsy | Vintage Mushroom Print Set of 3 | price $6.50 | monthly sales 45 | favorites 1.2k | age 90 days | https://www.etsy.com/listing/123
etsy | mushroom wall art | searches 5,400 | competition 41000
profittree | cottagecore mushroom poster | sales: 30 | price=12
- amazon | cherry kitchen sign | reviews 2300 | bought 1k | tags cherry; kitchen
nonsense line without fields
myspace | something | rank 1
\`\`\``;

test('pasted findings: sources, names before numbers, k/$/% and bullets are all read', () => {
  const { signals, skipped } = parseFindings(PASTED);
  assert.equal(signals.length, 6);
  assert.equal(skipped, 3); // the intro sentence, the line with no fields, the unknown source
  const [cherry, mush, listing, keyword, profit, amazon] = signals;
  assert.equal(cherry.source, 'pinterest');
  assert.equal(cherry.kind, 'trend');
  assert.equal(cherry.metrics?.growthMom, 120);
  assert.equal(cherry.metrics?.growthYoy, 340);
  assert.equal(mush.metrics?.growthMom, 85);
  assert.equal(listing.kind, 'listing');
  assert.equal(listing.metrics?.price, 6.5);
  // "monthly sales 45" is sales, not monthly growth.
  assert.equal(listing.metrics?.boughtLastMonth, 45);
  assert.equal(listing.metrics?.growthMom, undefined);
  assert.equal(listing.metrics?.favorites, 1200);
  assert.equal(listing.metrics?.ageDays, 90);
  assert.equal(listing.url, 'https://www.etsy.com/listing/123');
  assert.equal(keyword.kind, 'suggestion');
  assert.equal(keyword.metrics?.searches, 5400);
  assert.equal(keyword.metrics?.competition, 41000);
  assert.equal(profit.source, 'etsy');
  assert.equal(profit.metrics?.boughtLastMonth, 30);
  assert.equal(profit.metrics?.price, 12);
  assert.equal(amazon.kind, 'product');
  assert.deepEqual(amazon.tags, ['cherry', 'kitchen']);
  assert.ok(signals.every((x) => x.imported));
});

test('pasted findings never take a non-http link', () => {
  const { signals } = parseFindings('etsy | x print | url javascript:alert(1) | price 5');
  assert.equal(signals[0].url, undefined);
});

test('parseNumber reads the shapes people paste', () => {
  assert.equal(parseNumber('$1,299.50'), 1299.5);
  assert.equal(parseNumber('+85%'), 85);
  assert.equal(parseNumber('2.5K'), 2500);
  assert.equal(parseNumber('n/a'), undefined);
});

test('the pasted-findings row says what was read and from where', () => {
  const r = importReport(parseFindings(PASTED));
  assert.equal(r.source, 'manual');
  assert.equal(r.status, 'ok');
  assert.match(r.message, /6 findings: 2 Pinterest, 3 Etsy, 1 Amazon \(3 lines not understood\)/);
  const bad = importReport(parseFindings('just some words\nmore words'));
  assert.equal(bad.status, 'failed');
});

test('pasted Pinterest and Etsy data counts in the ranking under its own source', () => {
  const reports = fixtureReports().filter((r) => r.source !== 'pinterest' && r.source !== 'etsy');
  reports.push(importReport(parseFindings(PASTED)));
  const a = analyze(reports, ['wall art']);
  const mush = a.keywords.find((k) => k.phrase === 'mushroom')!;
  assert.ok(mush.sources.includes('pinterest'));
  assert.ok(mush.sources.includes('etsy'));
  assert.equal(mush.pinterestGrowth, 85);
  assert.equal(a.topListings[0].title, 'Vintage Mushroom Print Set of 3');
  assert.ok(a.keywords.some((k) => k.phrase.includes('cherry')));
});

test('run body keeps pasted findings, capped', () => {
  const r = parseRunBody({ niche: 'clipart', findings: 'x'.repeat(40_000) });
  if ('error' in r) return assert.fail();
  assert.equal(r.findings.length, 30_000);
  const pasteOnly = parseRunBody({ niche: 'clipart', sources: [], findings: 'etsy | bow clipart' });
  if ('error' in pasteOnly) return assert.fail();
  assert.deepEqual(pasteOnly.sources, []);
  assert.equal(pasteOnly.webSearch, false);
});

// — SerpApi and error messages —

test('SerpApi: an error inside a 200 answer is surfaced; "no results" is not a failure', async () => {
  const answer = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  await assert.rejects(getSerpJson('https://serpapi.com/x', answer({ error: "Google Trends hasn't returned any results for this query." })), NoResults);
  await assert.rejects(getSerpJson('https://serpapi.com/x', answer({ error: 'Your account has run out of searches.' })), /run out of searches/);
  await assert.rejects(getSerpJson('https://serpapi.com/x', answer({ error: 'Invalid API key.' }, 401)), (e: unknown) => e instanceof HttpError && e.status === 401);
  assert.deepEqual(await getSerpJson('https://serpapi.com/x', answer({ related_queries: {} })), { related_queries: {} });
});

test('SerpApi: a dropped connection gets one retry; a refusal does not', async () => {
  let calls = 0;
  const flaky = (async () => {
    calls++;
    if (calls === 1) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
    return new Response(JSON.stringify({ ok: 1 }));
  }) as unknown as typeof fetch;
  assert.deepEqual(await getSerpJson('https://serpapi.com/x', flaky), { ok: 1 });
  assert.equal(calls, 2);
  let refusals = 0;
  const refuse = (async () => {
    refusals++;
    return new Response(JSON.stringify({ error: 'Invalid API key.' }), { status: 401 });
  }) as unknown as typeof fetch;
  await assert.rejects(getSerpJson('https://serpapi.com/x', refuse));
  assert.equal(refusals, 1);
});

test('failure messages carry the low-level reason', () => {
  assert.equal(describeError(new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })), 'could not be reached (ECONNRESET)');
  const timeout = new Error('timed out');
  timeout.name = 'TimeoutError';
  assert.equal(describeError(timeout), 'did not answer in time');
  assert.equal(describeError(new HttpError(400, 'said: “Bad geo” (HTTP 400)')), 'said: “Bad geo” (HTTP 400)');
});

test('Google Trends: seeds with nothing rising read as OK with a hint, not a failure', async () => {
  const saved = process.env.SERPAPI_API_KEY;
  process.env.SERPAPI_API_KEY = 'test';
  const empty = (async () =>
    new Response(JSON.stringify({ error: "Google Trends hasn't returned any results for this query." }))) as unknown as typeof fetch;
  try {
    const [r] = await collect({ niche: 'clipart', seeds: ['bow clipart'], sources: ['google_trends'], shopifyStores: [], region: 'US' }, empty);
    assert.equal(r.status, 'ok');
    assert.match(r.message, /Nothing rising/);
  } finally {
    if (saved === undefined) delete process.env.SERPAPI_API_KEY;
    else process.env.SERPAPI_API_KEY = saved;
  }
});
