// Shared shapes for Trend Research.
//
// Every source — search-engine autocomplete, Pinterest Trends, the Etsy API,
// Amazon, Shopify storefronts — is boiled down to the same thing: a list of
// Signals, each a phrase a buyer typed or a product a seller listed, with
// whatever numbers that source honestly has. The analysis never needs to know
// which API a signal came from beyond its id and weight.

export const NICHES = ['clipart', 'wall_art', 'home_decor'] as const;
export type Niche = (typeof NICHES)[number];

export const SOURCE_IDS = [
  'google',
  'google_trends',
  'bing',
  'pinterest',
  'etsy',
  'amazon',
  'shopify',
  'web',
] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export type SignalKind = 'suggestion' | 'trend' | 'listing' | 'product';

export type SignalMetrics = {
  // Etsy
  favorites?: number;
  views?: number;
  // Days since the listing / product was first created.
  ageDays?: number;
  // Amazon (via SerpApi)
  reviews?: number;
  rating?: number;
  boughtLastMonth?: number;
  // Pinterest Trends, percent change week/month/year over the period before.
  growthWow?: number;
  growthMom?: number;
  growthYoy?: number;
  // Google Trends rising-query value (percent; 5000 = "Breakout").
  rising?: number;
  // Position in the source's own list, 1 = first.
  rank?: number;
  price?: number;
  currency?: string;
};

export type Signal = {
  source: SourceId;
  kind: SignalKind;
  text: string;
  url?: string;
  tags?: string[];
  // The seed keyword this signal was found for, when there was one.
  seed?: string;
  // Shopify: which store it came from.
  store?: string;
  metrics?: SignalMetrics;
};

export type SourceStatus = 'ok' | 'not_configured' | 'failed' | 'skipped';

export type SourceReport = {
  source: SourceId;
  label: string;
  status: SourceStatus;
  message: string;
  signals: Signal[];
  // Etsy only: how many active listings match the seeds — a competition gauge.
  totalResults?: number;
};

export type ColorSignal = { name: string; hex: string; count: number; sources: SourceId[] };
export type StyleSignal = { name: string; count: number; sources: SourceId[] };

export type KeywordSignal = {
  phrase: string;
  score: number; // 0–100, relative within this report
  count: number;
  sources: SourceId[];
  // Etsy engagement on listings containing the phrase, favorites per 30 days.
  etsyFavoritesPer30d?: number;
  // Pinterest's strongest growth figure for a matching trend, if any.
  pinterestGrowth?: number;
};

export type PriceStats = { min: number; median: number; p75: number; max: number; currency: string; n: number };

export type TopListing = {
  source: SourceId;
  title: string;
  url?: string;
  price?: number;
  currency?: string;
  favoritesPer30d?: number;
  reviews?: number;
  boughtLastMonth?: number;
  store?: string;
};

export type Analysis = {
  keywords: KeywordSignal[];
  colors: ColorSignal[];
  styles: StyleSignal[];
  subjects: KeywordSignal[];
  prices: Partial<Record<SourceId, PriceStats>>;
  topListings: TopListing[];
  etsyCompetition?: number;
  signalCount: number;
};

export type PaletteColor = { name: string; hex: string };

export type IdeaPrompts = {
  // The main text-to-image prompt.
  main: string;
  // Two or three alternates: a different composition / colourway / set.
  variations: string[];
  // What to steer away from, for generators that take a negative prompt.
  negative: string;
};

export type Idea = {
  id: string;
  title: string;
  niche: Niche;
  productType: string;
  subject: string;
  styles: string[];
  palette: PaletteColor[];
  why: string;
  evidence: string[];
  demand: 'high' | 'medium' | 'emerging';
  competition: 'low' | 'medium' | 'high' | 'unknown';
  priceHint?: string;
  prompts: IdeaPrompts;
  // File / format specs for producing the product (sizes, DPI, ratios).
  specs: string[];
  etsy: { title: string; tags: string[] };
};

export type TrendTheme = { name: string; summary: string; evidence: string[] };

export type ResearchReport = {
  id: string;
  createdAt: string;
  niche: Niche;
  seeds: string[];
  sources: Omit<SourceReport, 'signals'>[];
  analysis: Analysis;
  summary: string;
  themes: TrendTheme[];
  palettes: { name: string; colors: PaletteColor[]; note: string }[];
  ideas: Idea[];
  // 'claude' when Claude wrote the themes and ideas; 'rules' when the
  // built-in generator did because no Anthropic key is set or the call failed.
  writer: 'claude' | 'rules';
  writerNote?: string;
  webSources?: { title: string; url: string }[];
};
