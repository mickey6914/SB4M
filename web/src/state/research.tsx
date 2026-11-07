import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRun } from './run';

// Trend Research client state: the report on screen, recent reports, and the
// idea board — ideas the seller saved to make. Kept in this browser's storage
// like the workspace rules; nothing here is shared or sent anywhere else.

export type Niche = 'clipart' | 'wall_art' | 'home_decor';
export type SourceId = 'google' | 'google_trends' | 'bing' | 'pinterest' | 'etsy' | 'amazon' | 'shopify' | 'web';

export type PaletteColor = { name: string; hex: string };
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
  prompts: { main: string; variations: string[]; negative: string };
  specs: string[];
  etsy: { title: string; tags: string[] };
};

export type SavedIdea = Idea & {
  savedAt: string;
  reportId: string;
  status: 'todo' | 'making' | 'listed';
  notes: string;
};

export type SourceStatusRow = {
  source: SourceId;
  label: string;
  status: 'ok' | 'not_configured' | 'failed' | 'skipped';
  message: string;
  totalResults?: number;
};

export type KeywordSignal = {
  phrase: string;
  score: number;
  count: number;
  sources: SourceId[];
  etsyFavoritesPer30d?: number;
  pinterestGrowth?: number;
};

export type PriceStats = { min: number; median: number; p75: number; max: number; currency: string; n: number };

export type ResearchReport = {
  id: string;
  createdAt: string;
  niche: Niche;
  seeds: string[];
  sources: SourceStatusRow[];
  analysis: {
    keywords: KeywordSignal[];
    colors: { name: string; hex: string; count: number; sources: SourceId[] }[];
    styles: { name: string; count: number; sources: SourceId[] }[];
    subjects: KeywordSignal[];
    prices: Partial<Record<SourceId, PriceStats>>;
    topListings: {
      source: SourceId;
      title: string;
      url?: string;
      price?: number;
      currency?: string;
      favoritesPer30d?: number;
      reviews?: number;
      boughtLastMonth?: number;
      store?: string;
    }[];
    etsyCompetition?: number;
    signalCount: number;
  };
  summary: string;
  themes: { name: string; summary: string; evidence: string[] }[];
  palettes: { name: string; colors: PaletteColor[]; note: string }[];
  ideas: Idea[];
  writer: 'claude' | 'rules';
  writerNote?: string;
  webSources?: { title: string; url: string }[];
};

export const NICHE_LABEL: Record<Niche, string> = {
  clipart: 'Clipart',
  wall_art: 'Wall art',
  home_decor: 'Home decor',
};

export const SOURCE_SHORT: Record<SourceId, string> = {
  google: 'Google',
  google_trends: 'G Trends',
  bing: 'Bing',
  pinterest: 'Pinterest',
  etsy: 'Etsy',
  amazon: 'Amazon',
  shopify: 'Shopify',
  web: 'Web',
};

const HISTORY_KEY = 'eav.research.history';
const BOARD_KEY = 'eav.research.board';
const FORM_KEY = 'eav.research.form';
const HISTORY_MAX = 6;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the session still works, it just won't persist.
  }
}

export type ResearchForm = {
  niche: Niche;
  seeds: string;
  sources: SourceId[];
  shopifyStores: string;
};

export const DEFAULT_FORM: ResearchForm = {
  niche: 'wall_art',
  seeds: '',
  sources: ['google', 'bing', 'pinterest', 'google_trends', 'etsy', 'amazon', 'shopify', 'web'],
  shopifyStores: '',
};

type Ctx = {
  form: ResearchForm;
  setForm: (f: ResearchForm) => void;
  report: ResearchReport | null;
  setReport: (r: ResearchReport | null) => void;
  history: ResearchReport[];
  board: SavedIdea[];
  saveIdea: (idea: Idea, reportId: string) => void;
  updateIdea: (id: string, patch: Partial<SavedIdea>) => void;
  removeIdea: (id: string) => void;
  isSaved: (idea: Idea, reportId: string) => boolean;
};

const ResearchContext = createContext<Ctx | null>(null);

export function boardId(idea: Idea, reportId: string): string {
  return `${reportId}:${idea.id}`;
}

export function ResearchProvider({ children }: { children: ReactNode }) {
  const [form, setFormState] = useState<ResearchForm>(() => ({ ...DEFAULT_FORM, ...load(FORM_KEY, {}) }));
  const [history, setHistory] = useState<ResearchReport[]>(() => load(HISTORY_KEY, []));
  const [report, setReportState] = useState<ResearchReport | null>(() => history[0] ?? null);
  const [board, setBoard] = useState<SavedIdea[]>(() => load(BOARD_KEY, []));

  useEffect(() => save(BOARD_KEY, board), [board]);

  const setForm = (f: ResearchForm) => {
    setFormState(f);
    save(FORM_KEY, f);
  };

  const setReport = (r: ResearchReport | null) => {
    setReportState(r);
    if (!r) return;
    setHistory((h) => {
      const next = [r, ...h.filter((x) => x.id !== r.id)].slice(0, HISTORY_MAX);
      save(HISTORY_KEY, next);
      return next;
    });
  };

  const saveIdea = (idea: Idea, reportId: string) => {
    const id = boardId(idea, reportId);
    setBoard((b) =>
      b.some((x) => x.id === id)
        ? b
        : [{ ...idea, id, reportId, savedAt: new Date().toISOString(), status: 'todo', notes: '' }, ...b]
    );
  };
  const updateIdea = (id: string, patch: Partial<SavedIdea>) =>
    setBoard((b) => b.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeIdea = (id: string) => setBoard((b) => b.filter((x) => x.id !== id));
  const isSaved = (idea: Idea, reportId: string) => board.some((x) => x.id === boardId(idea, reportId));

  return (
    <ResearchContext.Provider
      value={{ form, setForm, report, setReport, history, board, saveIdea, updateIdea, removeIdea, isSaved }}
    >
      {children}
    </ResearchContext.Provider>
  );
}

export function useResearch() {
  const ctx = useContext(ResearchContext);
  if (!ctx) throw new Error('useResearch outside ResearchProvider');
  return ctx;
}

// Mockups that suit each niche, by the names in the run wizard's catalogue.
export const NICHE_MOCKUPS: Record<Niche, string[]> = {
  clipart: ['Sticker sheet', 'Planner stickers', 'T-shirt'],
  wall_art: ['Wall art', 'Unframed wall art', 'TV wall art'],
  home_decor: ['Pillow', 'Coffee cup', 'Tote bag'],
};

// The hand-off into Pin-Post Studio: a fresh run whose product type, style
// direction and mockups come from the idea. The seller still uploads the
// finished artwork — the run's hero is always their own image.
export function useStartRunFromIdea() {
  const { dispatch } = useRun();
  const navigate = useNavigate();
  return (idea: Idea) => {
    dispatch({ type: 'reset' });
    dispatch({ type: 'setProductType', text: idea.productType });
    const style = [...idea.styles, ...idea.palette.slice(0, 3).map((c) => c.name)].join(', ');
    dispatch({ type: 'setStyleDirection', text: style });
    dispatch({ type: 'setMockups', mockups: NICHE_MOCKUPS[idea.niche] });
    navigate('/run/product');
  };
}

// — Exports —

export function ideaAsText(idea: Idea): string {
  return [
    `# ${idea.title}`,
    `Product: ${idea.productType}`,
    `Subject: ${idea.subject} · Styles: ${idea.styles.join(', ')}`,
    `Palette: ${idea.palette.map((c) => `${c.name} ${c.hex}`).join(', ')}`,
    idea.priceHint ? `Price: ${idea.priceHint}` : '',
    '',
    `Why: ${idea.why}`,
    ...idea.evidence.map((e) => `- ${e}`),
    '',
    'PROMPT',
    idea.prompts.main,
    '',
    'VARIATIONS',
    ...idea.prompts.variations.map((v, i) => `${i + 1}. ${v}`),
    '',
    `NEGATIVE: ${idea.prompts.negative}`,
    '',
    'SPECS',
    ...idea.specs.map((s) => `- ${s}`),
    '',
    `ETSY TITLE: ${idea.etsy.title}`,
    `ETSY TAGS: ${idea.etsy.tags.join(', ')}`,
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n');
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function ideasToCsv(ideas: (Idea & Partial<SavedIdea>)[]): string {
  const head = ['title', 'niche', 'product_type', 'subject', 'styles', 'palette', 'demand', 'competition', 'price_hint', 'prompt', 'variation_1', 'variation_2', 'variation_3', 'negative_prompt', 'etsy_title', 'etsy_tags', 'status', 'notes'];
  const rows = ideas.map((i) =>
    [
      i.title,
      i.niche,
      i.productType,
      i.subject,
      i.styles.join('; '),
      i.palette.map((c) => `${c.name} ${c.hex}`).join('; '),
      i.demand,
      i.competition,
      i.priceHint ?? '',
      i.prompts.main,
      i.prompts.variations[0] ?? '',
      i.prompts.variations[1] ?? '',
      i.prompts.variations[2] ?? '',
      i.prompts.negative,
      i.etsy.title,
      i.etsy.tags.join(', '),
      i.status ?? '',
      i.notes ?? '',
    ].map(csvCell).join(',')
  );
  return [head.join(','), ...rows].join('\n');
}

export function download(filename: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
