import Anthropic from '@anthropic-ai/sdk';
import { NICHE_DEFAULTS } from './lexicon.js';
import { buildPrompts, clampEtsyTitle, etsyTags, NICHE_SPECS } from './prompts.js';
import type { Analysis, Idea, Niche, PaletteColor, ResearchReport, Signal, SourceReport, TrendTheme } from './types.js';

// Claude turns the analysed signals into trend themes, palettes and product
// ideas with ready-to-use image prompts. It is handed the numbers, not asked
// to invent them, and told to cite which signals each idea rests on.
//
// With "Web trend reports" on, Claude may also run a few web searches for
// current trend reporting (Pinterest Predicts, Etsy's trend pages, paint
// brands' colours of the year) — the one source here that reads articles
// rather than search boxes and listings.

const MODEL = process.env.RESEARCH_MODEL || 'claude-opus-5-5';

function apiKey(): string | undefined {
  return process.env.PIN_POST_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || undefined;
}

export function hasClaude(): boolean {
  return Boolean(apiKey());
}

const NICHE_BRIEF: Record<Niche, string> = {
  clipart:
    'digital clipart sold as PNG bundles (transparent background, commercial-use licence) on Etsy and similar marketplaces',
  wall_art: 'printable digital wall art sold as instant downloads in multiple print ratios, single prints and gallery-wall sets',
  home_decor:
    'digital home decor designs: seamless patterns / digital paper, printable decor, and art that is also sold on pillows, mugs and totes via print-on-demand',
};

function compactSignals(signals: Signal[], n: number) {
  return signals.slice(0, n).map((s) => {
    const m = s.metrics ?? {};
    const out: Record<string, unknown> = { t: s.text };
    if (m.growthMom !== undefined) out.mom = m.growthMom;
    if (m.growthYoy !== undefined) out.yoy = m.growthYoy;
    if (m.rising !== undefined) out.rising = m.rising;
    if (m.favorites !== undefined) out.fav = m.favorites;
    if (m.ageDays !== undefined) out.days = m.ageDays;
    if (m.price !== undefined) out.price = m.price;
    if (m.boughtLastMonth !== undefined) out.bought30d = m.boughtLastMonth;
    if (m.reviews !== undefined) out.reviews = m.reviews;
    if (m.searches !== undefined) out.searches = m.searches;
    if (m.competition !== undefined) out.competition = m.competition;
    if (s.imported) out.src = s.source;
    if (s.tags?.length) out.tags = s.tags.slice(0, 13);
    return out;
  });
}

// The digest Claude reads: the ranked analysis plus a sample of raw signals
// per source, sized to stay a few thousand tokens however much was collected.
export function buildDigest(niche: Niche, seeds: string[], reports: SourceReport[], a: Analysis) {
  const bySource: Record<string, unknown> = {};
  for (const r of reports) {
    if (r.status !== 'ok') continue;
    const sorted = [...r.signals].sort((x, y) => (x.metrics?.rank ?? 99) - (y.metrics?.rank ?? 99));
    bySource[r.source] = compactSignals(sorted, r.source === 'etsy' || r.source === 'shopify' ? 25 : r.source === 'manual' ? 80 : 40);
  }
  return {
    niche,
    seeds,
    unavailableSources: reports.filter((r) => r.status !== 'ok').map((r) => `${r.label}: ${r.message}`),
    rankedKeywords: a.keywords.slice(0, 40).map((k) => ({
      p: k.phrase,
      score: k.score,
      n: k.count,
      src: k.sources,
      etsyFav30d: k.etsyFavoritesPer30d,
      pinGrowth: k.pinterestGrowth,
    })),
    colors: a.colors.map((c) => ({ name: c.name, hex: c.hex, weight: c.count, src: c.sources })),
    styles: a.styles.map((s) => ({ name: s.name, weight: s.count, src: s.sources })),
    prices: a.prices,
    etsyActiveListingsForSeeds: a.etsyCompetition,
    rawSignals: bySource,
  };
}

export function buildSynthesisPrompt(niche: Niche, digest: unknown, webSearch: boolean, today: string): string {
  return `You are a product researcher for an Etsy seller who makes ${NICHE_BRIEF[niche]}. Today is ${today}.

Below is market data collected a moment ago from search-engine autocomplete (what buyers type), Pinterest and Google Trends (what is growing), and marketplace listings (Etsy favourites and prices, Amazon sales, Shopify catalogues). Scores are relative within this data set. Some sources may be unavailable; work with what is there and do not pretend to data you were not given. Data under "manual" was gathered by the seller (in their own browser, or from an Etsy analytics tool such as ProfitTree); each item's "src" says where it came from, and "sales" there is an estimated monthly figure.
${webSearch ? '\nYou may run a few web searches for current, dated trend reporting for this niche (for example Pinterest Predicts, Etsy trend reports, colour-of-the-year announcements). Prefer sources from the last 12 months and use them to confirm or add to the data, not to replace it.\n' : ''}
Produce:
1. "summary": 2–3 sentences on where demand is heading in this niche right now.
2. "themes": 4–6 trend themes. Each: "name", "summary" (1–2 sentences), "evidence" (2–4 short strings citing specific signals: phrase + source + number where there is one).
3. "palettes": 3–4 colour palettes that are trending for this niche, each 4–5 colours with "name" and "hex", plus a one-line "note" on where it fits.
4. "ideas": 8 specific, sellable product ideas. Favour combinations with clear demand and room to stand out over the most saturated head terms. Each idea:
   - "title": short working name
   - "productType": what exactly is sold (e.g. "set of 3 printable botanical prints")
   - "subject": what the art depicts, a few words
   - "styles": 1–3 style words
   - "palette": 3–5 colours {"name","hex"}
   - "why": one sentence on the opportunity
   - "evidence": 2–3 short strings citing the signals behind it
   - "demand": "high" | "medium" | "emerging"; "competition": "low" | "medium" | "high" | "unknown"
   - "priceHint": a suggested price range with the data it comes from, or omit when there is no price data
   - "prompts": {"main": one detailed text-to-image prompt that produces this product, "variations": 3 alternate prompts (different composition, colourway or set piece), "negative": comma-separated things to avoid}. Prompts are plain descriptive English that works in any image generator: subject, style, palette with hex codes, composition, lighting/texture, and the niche's production needs (clipart: isolated elements on pure white for background removal; wall art: no text, no frame, print-ready composition; patterns: seamless tileable). No tool-specific flags. No trademarked characters, brands or living artists' names.
   - "etsy": {"title": an SEO listing title, at most 140 characters, front-loading the strongest buyer phrase; "tags": exactly 13 tags, each at most 20 characters, lowercase}

Return only JSON, no markdown fence and no commentary outside it:
{"summary": string, "themes": [...], "palettes": [...], "ideas": [...]}

DATA:
${JSON.stringify(digest)}`;
}

function s(v: unknown, max = 600): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function strings(v: unknown, max = 8, len = 300): string[] {
  return Array.isArray(v) ? v.map((x) => s(x, len)).filter(Boolean).slice(0, max) : [];
}

function palette(v: unknown): PaletteColor[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => ({ name: s((c as PaletteColor)?.name, 40), hex: s((c as PaletteColor)?.hex, 9).toUpperCase() }))
    .filter((c) => c.name && /^#[0-9A-F]{6}$/.test(c.hex))
    .slice(0, 6);
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export type Synthesis = Pick<ResearchReport, 'summary' | 'themes' | 'palettes' | 'ideas'>;

// Lenient parse: slice between the outermost braces, then keep each field
// only if it has the right shape. An idea missing its prompts gets the
// built-in prompts for its subject rather than being dropped.
export function parseSynthesis(text: string, niche: Niche): Synthesis | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const themes: TrendTheme[] = (Array.isArray(raw.themes) ? raw.themes : [])
    .map((t: Record<string, unknown>) => ({ name: s(t?.name, 80), summary: s(t?.summary), evidence: strings(t?.evidence, 4) }))
    .filter((t) => t.name)
    .slice(0, 8);
  const palettes = (Array.isArray(raw.palettes) ? raw.palettes : [])
    .map((p: Record<string, unknown>) => ({ name: s(p?.name, 60), colors: palette(p?.colors), note: s(p?.note, 200) }))
    .filter((p) => p.name && p.colors.length >= 2)
    .slice(0, 6);
  const ideas: Idea[] = (Array.isArray(raw.ideas) ? raw.ideas : [])
    .map((o: Record<string, unknown>, i: number): Idea | null => {
      const title = s(o?.title, 100);
      const subject = s(o?.subject, 120) || title;
      if (!title) return null;
      const styles = strings(o?.styles, 3, 40);
      const pal = palette(o?.palette);
      const fallback = buildPrompts({ niche, subject, styles, palette: pal });
      const p = (o?.prompts ?? {}) as Record<string, unknown>;
      const etsy = (o?.etsy ?? {}) as Record<string, unknown>;
      const variations = strings(p.variations, 4, 1200);
      return {
        id: `idea-${i + 1}`,
        title,
        niche,
        productType: s(o?.productType, 140) || NICHE_DEFAULTS[niche].productType,
        subject,
        styles,
        palette: pal,
        why: s(o?.why, 400),
        evidence: strings(o?.evidence, 4),
        demand: oneOf(o?.demand, ['high', 'medium', 'emerging'] as const, 'medium'),
        competition: oneOf(o?.competition, ['low', 'medium', 'high', 'unknown'] as const, 'unknown'),
        priceHint: s(o?.priceHint, 160) || undefined,
        prompts: {
          main: s(p.main, 1500) || fallback.main,
          variations: variations.length ? variations : fallback.variations,
          negative: s(p.negative, 500) || fallback.negative,
        },
        specs: NICHE_SPECS[niche],
        etsy: {
          title: clampEtsyTitle(s(etsy.title, 200) || title),
          tags: etsyTags(strings(etsy.tags, 20, 40)),
        },
      };
    })
    .filter((x: Idea | null): x is Idea => x !== null)
    .slice(0, 12);
  if (!ideas.length) return null;
  return { summary: s(raw.summary, 800), themes, palettes, ideas };
}

export type SynthesisResult =
  | { ok: true; synthesis: Synthesis; webSources: { title: string; url: string }[] }
  | { ok: false; message: string };

export async function synthesize(opts: {
  niche: Niche;
  seeds: string[];
  reports: SourceReport[];
  analysis: Analysis;
  webSearch: boolean;
  log?: { warn: (o: unknown, m: string) => void };
}): Promise<SynthesisResult> {
  const key = apiKey();
  if (!key) return { ok: false, message: 'No Anthropic key set — ideas came from the built-in generator.' };

  const digest = buildDigest(opts.niche, opts.seeds, opts.reports, opts.analysis);
  const prompt = buildSynthesisPrompt(opts.niche, digest, opts.webSearch, new Date().toISOString().slice(0, 10));
  const client = new Anthropic({ apiKey: key });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: prompt }];
  const tools: Anthropic.Beta.BetaToolUnion[] = opts.webSearch
    ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }]
    : [];

  try {
    let response: Anthropic.Beta.BetaMessage | null = null;
    // A turn that runs web searches can pause; resend to let it finish.
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await client.beta.messages
        .stream({
          model: MODEL,
          max_tokens: 32000,
          output_config: { effort: 'medium' },
          // If a safety classifier declines, the API retries on a fallback
          // model inside the same call instead of failing the report.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          ...(tools.length ? { tools } : {}),
          messages,
        })
        .finalMessage();
      if (response.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: response.content });
    }
    if (!response || response.stop_reason === 'refusal') {
      return { ok: false, message: 'Claude declined this request — ideas came from the built-in generator.' };
    }
    const allContent = messages
      .filter((m) => m.role === 'assistant')
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .concat(response.content as Anthropic.Beta.BetaContentBlockParam[]);
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const synthesis = parseSynthesis(text, opts.niche);
    if (!synthesis) {
      return { ok: false, message: 'Claude’s answer could not be read — ideas came from the built-in generator.' };
    }
    const webSources: { title: string; url: string }[] = [];
    for (const block of allContent as { type: string; content?: unknown }[]) {
      if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
      for (const r of block.content as { type?: string; title?: string; url?: string }[]) {
        if (r.type === 'web_search_result' && r.url && !webSources.some((w) => w.url === r.url)) {
          webSources.push({ title: r.title || r.url, url: r.url });
        }
      }
    }
    return { ok: true, synthesis, webSources: webSources.slice(0, 20) };
  } catch (err) {
    opts.log?.warn({ err }, 'research synthesis failed');
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, message: 'The Anthropic key was refused — ideas came from the built-in generator.' };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, message: 'Anthropic is rate-limiting — ideas came from the built-in generator. Try again shortly.' };
    }
    return { ok: false, message: 'Claude could not be reached — ideas came from the built-in generator.' };
  }
}
