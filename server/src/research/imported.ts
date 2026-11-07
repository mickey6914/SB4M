import type { Signal, SignalKind, SignalMetrics, SourceId, SourceReport } from './types.js';

// Findings the seller pastes in: what Claude in Chrome read on Pinterest and
// Etsy with their own logins, what ProfitTree reported, or their own notes.
// One finding per line, fields separated by "|":
//
//   pinterest | cherry red kitchen decor | growth 120% | yoy 340%
//   etsy | vintage mushroom print | price 6.50 | sales 45 | favorites 900
//   etsy | mushroom wall art | searches 5400 | competition 41000
//
// The first field names the source, the second is the phrase or listing
// title, and every later field is "name value". Unknown names are ignored and
// a line that cannot be read is skipped and counted, never fatal — the text
// comes from a chat window and will not always be tidy.

const SOURCE_ALIASES: Record<string, SourceId> = {
  pinterest: 'pinterest',
  'pinterest trends': 'pinterest',
  pin: 'pinterest',
  etsy: 'etsy',
  profittree: 'etsy',
  'profit tree': 'etsy',
  amazon: 'amazon',
  google: 'google',
  'google trends': 'google_trends',
  trends: 'google_trends',
  bing: 'bing',
  shopify: 'shopify',
  web: 'web',
  other: 'web',
  note: 'web',
};

const METRIC_ALIASES: [RegExp, keyof SignalMetrics][] = [
  [/^(growth|mom|monthly|month|monthly growth)$/, 'growthMom'],
  [/^(yoy|yearly|year|yearly growth)$/, 'growthYoy'],
  [/^(wow|weekly|week|weekly growth)$/, 'growthWow'],
  [/^(rising|breakout)$/, 'rising'],
  [/^(favorites|favourites|favs|fav|faves|hearts|saves|likes)$/, 'favorites'],
  [/^views?$/, 'views'],
  [/^(age|days|age days|days listed|listed)$/, 'ageDays'],
  [/^price$/, 'price'],
  [/^(reviews?|ratings?)$/, 'reviews'],
  [/^(sales|sold|bought|monthly sales|sales\/month|orders)$/, 'boughtLastMonth'],
  [/^rank$/, 'rank'],
  [/^(searches|search volume|volume|monthly searches)$/, 'searches'],
  [/^(competition|listings|results|competing)$/, 'competition'],
];

// "1.2k" → 1200, "$6.50" → 6.5, "+120%" → 120, "41,000" → 41000.
export function parseNumber(raw: string): number | undefined {
  const m = /(-?[\d.,]+)\s*([km])?/i.exec(raw.replace(/[$£€+%]/g, ''));
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return undefined;
  const mult = m[2]?.toLowerCase() === 'k' ? 1000 : m[2]?.toLowerCase() === 'm' ? 1_000_000 : 1;
  return n * mult;
}

function kindFor(source: SourceId, m: SignalMetrics): SignalKind {
  if (source === 'pinterest' || source === 'google_trends') return 'trend';
  if (source === 'shopify') return 'product';
  if (source === 'etsy' && (m.price !== undefined || m.favorites !== undefined || m.boughtLastMonth !== undefined)) return 'listing';
  if (source === 'amazon' && (m.price !== undefined || m.reviews !== undefined || m.boughtLastMonth !== undefined)) return 'product';
  return 'suggestion';
}

export type ImportResult = { signals: Signal[]; skipped: number };

export function parseFindings(text: string): ImportResult {
  const signals: Signal[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/).slice(0, 400)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
    if (!line || line.startsWith('#') || /^```/.test(line)) continue;
    const parts = line.split(/\s*[|\t]\s*/).map((p) => p.trim());
    if (parts.length < 2) {
      skipped++;
      continue;
    }
    const source = SOURCE_ALIASES[parts[0].toLowerCase().replace(/[:]/g, '').trim()];
    const phrase = parts[1].replace(/^["“]|["”]$/g, '').trim().slice(0, 200);
    if (!source || !phrase) {
      skipped++;
      continue;
    }
    const metrics: SignalMetrics = {};
    let url: string | undefined;
    let tags: string[] | undefined;
    for (const field of parts.slice(2)) {
      if (/^https?:\/\//i.test(field)) {
        url = field;
        continue;
      }
      const tagMatch = /^tags?\s*[:=]?\s*(.+)$/i.exec(field);
      if (tagMatch) {
        tags = tagMatch[1].split(/[;,]/).map((t) => t.trim()).filter(Boolean).slice(0, 13);
        continue;
      }
      const urlMatch = /^(?:url|link)\s*[:=]?\s*(https?:\/\/\S+)$/i.exec(field);
      if (urlMatch) {
        url = urlMatch[1];
        continue;
      }
      // The name is everything before the first number, so "monthly sales 45"
      // reads as "monthly sales", not "monthly".
      const m = /^([^\d$£€+\-.]+?)\s*[:=]?\s*([$£€+\-]?[\d.].*)$/.exec(field);
      if (!m) continue;
      const name = m[1].trim().toLowerCase();
      const value = m[2].trim();
      const key = METRIC_ALIASES.find(([re]) => re.test(name))?.[1];
      if (!key || key === 'currency') continue;
      const n = parseNumber(value);
      if (n !== undefined) (metrics as Record<string, number>)[key] = n;
    }
    signals.push({ source, kind: kindFor(source, metrics), text: phrase, url, tags, metrics, imported: true });
  }
  return { signals, skipped };
}

const LABEL: Partial<Record<SourceId, string>> = {
  pinterest: 'Pinterest',
  etsy: 'Etsy',
  amazon: 'Amazon',
  google: 'Google',
  google_trends: 'Google Trends',
  bing: 'Bing',
  shopify: 'Shopify',
  web: 'other',
};

// The report row for pasted findings: how many lines, from where.
export function importReport(result: ImportResult): SourceReport {
  const counts = new Map<SourceId, number>();
  for (const s of result.signals) counts.set(s.source, (counts.get(s.source) ?? 0) + 1);
  const breakdown = [...counts.entries()].map(([src, n]) => `${n} ${LABEL[src] ?? src}`).join(', ');
  const skipped = result.skipped ? ` (${result.skipped} line${result.skipped > 1 ? 's' : ''} not understood)` : '';
  return {
    source: 'manual',
    label: 'Your pasted findings',
    status: result.signals.length ? 'ok' : 'failed',
    message: result.signals.length
      ? `${result.signals.length} findings: ${breakdown}${skipped}`
      : `None of the ${result.skipped} pasted lines could be read — use “source | phrase | name value”.`,
    signals: result.signals,
  };
}
