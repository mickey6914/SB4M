import { COLORS, PRODUCT_WORDS, STOPWORDS, STYLES } from './lexicon.js';
import type {
  Analysis,
  ColorSignal,
  KeywordSignal,
  PriceStats,
  Signal,
  SourceId,
  SourceReport,
  StyleSignal,
  TopListing,
} from './types.js';

// Turns raw signals into ranked keywords, colours, styles and price ranges.
// Pure and deterministic, so the ranking is testable without any network.
//
// What "profitable" can honestly mean here: none of these sources publishes
// sales. What they do publish is demand — what buyers type (autocomplete),
// what is growing (Pinterest, Google Trends), what buyers save and buy on
// listings (Etsy favourites, Amazon "bought in past month") — and supply
// (how many listings compete). The score is a weighted count of those demand
// signals across sources, and a phrase seen on several sources outranks one
// seen many times on a single source.

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/(^|\s)['-]+|['-]+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  return ` ${haystack} `.includes(` ${phrase} `);
}

// How much one signal counts. Suggestions are a buyer's own words; a trend
// with measured growth counts more; an Etsy listing counts by how much it is
// favourited for its age; an Amazon product by how much it sells.
export function signalWeight(s: Signal): number {
  const m = s.metrics ?? {};
  const rankBoost = m.rank ? 1 + 0.5 / Math.sqrt(m.rank) : 1;
  switch (s.source) {
    case 'google':
    case 'bing':
      return 1 * rankBoost;
    case 'amazon':
      if (s.kind === 'suggestion') return 1 * rankBoost;
      return 1 + Math.log10(1 + (m.boughtLastMonth ?? 0) / 50) + Math.log10(1 + (m.reviews ?? 0) / 500);
    case 'pinterest': {
      const growth = Math.max(m.growthMom ?? 0, (m.growthYoy ?? 0) / 4, m.growthWow ?? 0);
      return 2 + Math.min(3, Math.log10(1 + Math.max(0, growth) / 10));
    }
    case 'google_trends':
      return 2 + Math.min(3, Math.log10(1 + Math.max(0, m.rising ?? 0) / 50));
    case 'etsy':
      return 0.5 + Math.min(3, Math.log10(1 + favoritesPer30d(s) / 5));
    case 'shopify':
      // Newer products mean a store is still investing in the theme.
      return m.ageDays !== undefined && m.ageDays < 120 ? 0.8 : 0.4;
    default:
      return 1;
  }
}

export function favoritesPer30d(s: Signal): number {
  const fav = s.metrics?.favorites ?? 0;
  const age = Math.max(14, s.metrics?.ageDays ?? 365);
  return (fav / age) * 30;
}

// Text that is about the design: the title plus tags, minus product words.
function signalTexts(s: Signal): string[] {
  return [s.text, ...(s.tags ?? [])].map(normalise).filter(Boolean);
}

// Splits on product words and stopwords so a phrase never straddles one:
// "boho sage green wall art for living room" → ["boho sage green"].
export function contentChunks(text: string): string[][] {
  const chunks: string[][] = [];
  let cur: string[] = [];
  for (const w of normalise(text).split(' ')) {
    if (!w || STOPWORDS.has(w) || PRODUCT_WORDS.has(w) || /^\d+$/.test(w) || w.length < 3) {
      if (cur.length) chunks.push(cur);
      cur = [];
    } else {
      cur.push(w);
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

export function phrasesOf(text: string, maxN = 3): string[] {
  const out = new Set<string>();
  for (const chunk of contentChunks(text)) {
    for (let n = 1; n <= maxN; n++) {
      for (let i = 0; i + n <= chunk.length; i++) out.add(chunk.slice(i, i + n).join(' '));
    }
  }
  return [...out];
}

type Tally = { score: number; count: number; sources: Set<SourceId> };

function bump(map: Map<string, Tally>, key: string, w: number, source: SourceId) {
  const t = map.get(key) ?? { score: 0, count: 0, sources: new Set<SourceId>() };
  t.score += w;
  t.count += 1;
  t.sources.add(source);
  map.set(key, t);
}

// Longest names first, each match blanked so "sage green" is not also "green".
function matchLexicon<T extends { name: string; aliases?: string[] }>(text: string, lexicon: T[]): T[] {
  const entries = lexicon
    .flatMap((e) => [e.name, ...(e.aliases ?? [])].map((term) => ({ term: normalise(term), e })))
    .sort((a, b) => b.term.length - a.term.length);
  let t = ` ${text} `;
  const found = new Set<T>();
  for (const { term, e } of entries) {
    if (!term) continue;
    if (t.includes(` ${term} `)) {
      found.add(e);
      t = t.split(` ${term} `).join('  ');
    }
  }
  return [...found];
}

function crossSourceFactor(n: number): number {
  return 1 + 0.6 * (n - 1);
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}

function priceStats(signals: Signal[]): PriceStats | undefined {
  const prices = signals
    .map((s) => s.metrics?.price)
    .filter((p): p is number => typeof p === 'number' && p > 0)
    .sort((a, b) => a - b);
  if (prices.length < 3) return undefined;
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    min: r(prices[0]),
    median: r(percentile(prices, 0.5)),
    p75: r(percentile(prices, 0.75)),
    max: r(prices[prices.length - 1]),
    currency: signals.find((s) => s.metrics?.currency)?.metrics?.currency ?? 'USD',
    n: prices.length,
  };
}

export function analyze(reports: SourceReport[], seeds: string[]): Analysis {
  const signals = reports.flatMap((r) => r.signals);
  const seedWords = new Set(seeds.flatMap((s) => normalise(s).split(' ')).filter(Boolean));
  // Canonical names only: aliases such as "cherry", "sage" or "bow" are also
  // things a design can depict, so they must stay eligible as subjects.
  const colorNames = new Set(COLORS.map((c) => normalise(c.name)));
  const styleNames = new Set(STYLES.map((c) => normalise(c.name)));

  const phraseMap = new Map<string, Tally>();
  const colorMap = new Map<string, Tally>();
  const styleMap = new Map<string, Tally>();

  for (const s of signals) {
    const w = signalWeight(s);
    // A phrase counts once per signal however many of its tags repeat it.
    const phrases = new Set(signalTexts(s).flatMap((t) => phrasesOf(t)));
    for (const p of phrases) {
      const words = p.split(' ');
      if (words.every((x) => seedWords.has(x))) continue;
      bump(phraseMap, p, w, s.source);
    }
    const joined = signalTexts(s).join(' | ');
    for (const c of matchLexicon(joined, COLORS)) bump(colorMap, c.name, w, s.source);
    for (const st of matchLexicon(joined, STYLES)) bump(styleMap, st.name, w, s.source);
  }

  const etsy = signals.filter((s) => s.source === 'etsy');
  const pins = signals.filter((s) => s.source === 'pinterest');

  let ranked = [...phraseMap.entries()]
    .filter(([, t]) => t.count >= 2 || t.sources.size >= 2 || t.score >= 3)
    .map(([phrase, t]) => {
      const len = phrase.split(' ').length;
      const lengthBonus = len === 1 ? 1 : len === 2 ? 1.35 : 1.5;
      return { phrase, raw: t.score * crossSourceFactor(t.sources.size) * lengthBonus, t };
    })
    .sort((a, b) => b.raw - a.raw);

  // A short phrase that only ever appears inside a longer one adds nothing:
  // drop "sage" when "sage green" carries nearly all of its weight.
  ranked = ranked.filter(
    (r, _i, all) =>
      !all.some(
        (o) => o !== r && o.phrase.length > r.phrase.length && containsPhrase(o.phrase, r.phrase) && o.t.count >= r.t.count * 0.8
      )
  );

  const top = ranked.slice(0, 60);
  const max = top[0]?.raw || 1;
  const keywords: KeywordSignal[] = top.map(({ phrase, raw, t }) => {
    const matchingEtsy = etsy.filter((s) => signalTexts(s).some((x) => containsPhrase(x, phrase)));
    const matchingPins = pins.filter((s) => containsPhrase(normalise(s.text), phrase));
    const fav = matchingEtsy.length
      ? matchingEtsy.reduce((sum, s) => sum + favoritesPer30d(s), 0) / matchingEtsy.length
      : undefined;
    const growth = matchingPins.length
      ? Math.max(...matchingPins.map((s) => Math.max(s.metrics?.growthMom ?? 0, s.metrics?.growthYoy ?? 0)))
      : undefined;
    return {
      phrase,
      score: Math.max(1, Math.round((raw / max) * 100)),
      count: t.count,
      sources: [...t.sources],
      etsyFavoritesPer30d: fav !== undefined ? Math.round(fav * 10) / 10 : undefined,
      pinterestGrowth: growth || undefined,
    };
  });

  const isDesignWord = (p: string) => p.split(' ').every((w) => colorNames.has(w) || styleNames.has(w)) || colorNames.has(p) || styleNames.has(p);
  const subjects = keywords.filter((k) => !isDesignWord(k.phrase)).slice(0, 25);

  const toColor = ([name, t]: [string, Tally]): ColorSignal => ({
    name,
    hex: COLORS.find((c) => c.name === name)?.hex ?? '#999999',
    count: Math.round(t.score * 10) / 10,
    sources: [...t.sources],
  });
  const colors = [...colorMap.entries()]
    .sort((a, b) => b[1].score * crossSourceFactor(b[1].sources.size) - a[1].score * crossSourceFactor(a[1].sources.size))
    .slice(0, 16)
    .map(toColor);
  const styles: StyleSignal[] = [...styleMap.entries()]
    .sort((a, b) => b[1].score * crossSourceFactor(b[1].sources.size) - a[1].score * crossSourceFactor(a[1].sources.size))
    .slice(0, 16)
    .map(([name, t]) => ({ name, count: Math.round(t.score * 10) / 10, sources: [...t.sources] }));

  const prices: Analysis['prices'] = {};
  for (const id of ['etsy', 'amazon', 'shopify'] as SourceId[]) {
    const stats = priceStats(signals.filter((s) => s.source === id && s.kind !== 'suggestion'));
    if (stats) prices[id] = stats;
  }

  const listing = (s: Signal): TopListing => ({
    source: s.source,
    title: s.text,
    url: s.url,
    price: s.metrics?.price,
    currency: s.metrics?.currency,
    favoritesPer30d: s.source === 'etsy' ? Math.round(favoritesPer30d(s) * 10) / 10 : undefined,
    reviews: s.metrics?.reviews,
    boughtLastMonth: s.metrics?.boughtLastMonth,
    store: s.store,
  });
  const topEtsy = [...etsy].sort((a, b) => favoritesPer30d(b) - favoritesPer30d(a)).slice(0, 6);
  const topAmazon = signals
    .filter((s) => s.source === 'amazon' && s.kind === 'product')
    .sort((a, b) => (b.metrics?.boughtLastMonth ?? 0) - (a.metrics?.boughtLastMonth ?? 0) || (b.metrics?.reviews ?? 0) - (a.metrics?.reviews ?? 0))
    .slice(0, 6);
  const newestShopify = signals
    .filter((s) => s.source === 'shopify')
    .sort((a, b) => (a.metrics?.ageDays ?? 1e9) - (b.metrics?.ageDays ?? 1e9))
    .slice(0, 6);

  return {
    keywords,
    colors,
    styles,
    subjects,
    prices,
    topListings: [...topEtsy, ...topAmazon, ...newestShopify].map(listing),
    etsyCompetition: reports.find((r) => r.source === 'etsy')?.totalResults,
    signalCount: signals.length,
  };
}
