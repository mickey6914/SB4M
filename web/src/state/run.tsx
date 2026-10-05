import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';
import { useNavigate } from 'react-router-dom';

// Client state for the run wizard, per the handoff's State Management table
// and selection rules: hero is single-select; mockup types are multi-select capped
// at three, FIFO; volume drives downstream counts.

export const CROPS = ['2:3', '1:1', '4:5', '9:16'] as const;
export type Crop = (typeof CROPS)[number];

export type Volume = 3 | 7 | 30;
export type FanOut = 'pinterest' | 'pinterest_facebook' | 'all';

export type Listing = {
  url: string;
  source: 'etsy' | 'shopify' | 'amazon' | 'other';
  title: string;
  description: string;
  images: string[];
  price?: string;
};

// The run's copy, written once by Claude during the Generating step from the
// hero image: three title suggestions, one description, thirteen tags. Review
// spreads it across the pins — pin 1 takes title 1, and so on.
export type RunCopy =
  | { status: 'idle' }
  | { status: 'writing' }
  | { status: 'done'; titles: string[]; description: string; tags: string[] }
  | { status: 'failed'; message: string };

export type RunState = {
  // Bumped on every new run. Anything derived from a previous run keys on it,
  // so nothing stale can leak into the next one.
  runNumber: number;
  shopId: string;
  link: string;
  // Fetched listing (increment 3) and seller-dropped photos — the two image
  // sources the hero step draws from. Uploads are the universal fallback.
  listing: Listing | null;
  uploads: string[];
  hero: number | null;
  volume: Volume;
  styleDirection: string;
  // What the design goes on: up to three of MOCKUP_CATALOG. Pins rotate
  // through them — pin 1 the first, pin 2 the second, and round again.
  mockups: string[];
  fanOut: FanOut;
  // Default crops per spec; 9:16 unchecked. Instagram's default fan-out crop
  // is 4:5 feed (DECISIONS.md #3).
  crops: Record<Crop, boolean>;
  // Whether every pin gets its own generated mockup, or pins sharing a
  // template share one image. Sharing is far cheaper and produces byte-
  // identical pins, which Pinterest treats as spam — so this defaults on and
  // the wizard shows what it costs. See DECISIONS.md §12.
  distinctPerPin: boolean;
  copy: RunCopy;
};

// What the design goes on. "Basic marketing" (art + the pin's title) and
// "Unframed wall art" are shots the server composites itself — the artwork untouched, no
// AI, no credits. The rest are
// the shop's mockup templates: each applies the artwork to a product, and the
// prompt that does it lives server-side in scenes/templates.ts, which carries
// its own setting. Labels must match those exactly: the server looks the
// template up by label.
export const MOCKUP_CATALOG = [
  'Basic marketing',
  'Unframed wall art',
  'T-shirt',
  'Sweatshirt',
  'T-shirt flat lay',
  'Sweatshirt flat lay',
  'Coffee cup',
  'Pillow',
  'Invitation card',
  'Wall art',
  'TV wall art',
  'Tote bag',
  'Sticker sheet',
  'Planner stickers',
];

// Nothing is preselected. A default tick looked like the seller's own choice,
// and a pick carried over from an earlier run went out as if it were this
// run's (DECISIONS.md §17).
export const DEFAULT_MOCKUPS: string[] = [];

export const MAX_MOCKUPS = 3;

export const STYLE_SUGGESTIONS = ['No people', 'Minimalist white', 'Fall colours', 'Bright & airy', 'Holiday'];

function styleParts(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function styleHas(text: string, chip: string): boolean {
  return styleParts(text).some((p) => p.toLowerCase() === chip.toLowerCase());
}

// A chip toggles its phrase in and out of the style text, leaving whatever
// else the seller typed alone.
export function toggleStylePhrase(text: string, chip: string): string {
  const parts = styleParts(text);
  const i = parts.findIndex((p) => p.toLowerCase() === chip.toLowerCase());
  if (i >= 0) parts.splice(i, 1);
  else parts.push(chip);
  return parts.join(', ');
}

const initial: RunState = {
  runNumber: 1,
  shopId: 'eav',
  link: '',
  listing: null,
  uploads: [],
  hero: null,
  volume: 30,
  styleDirection: '',
  mockups: DEFAULT_MOCKUPS,
  fanOut: 'all',
  crops: { '2:3': true, '1:1': true, '4:5': true, '9:16': false },
  distinctPerPin: true,
  copy: { status: 'idle' },
};

type Action =
  | { type: 'setLink'; link: string }
  | { type: 'setListing'; listing: Listing }
  | { type: 'addUploads'; uploads: string[] }
  | { type: 'setHero'; hero: number }
  | { type: 'setVolume'; volume: Volume }
  | { type: 'setStyleDirection'; text: string }
  | { type: 'toggleMockup'; mockup: string }
  | { type: 'setMockups'; mockups: string[] }
  | { type: 'setFanOut'; fanOut: FanOut }
  | { type: 'toggleCrop'; crop: Crop }
  | { type: 'setDistinctPerPin'; on: boolean }
  | { type: 'setCopy'; copy: RunCopy }
  // keepRecipe: Library's Duplicate starts a new product with the same look.
  | { type: 'reset'; keepRecipe?: boolean };

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case 'setLink':
      return { ...state, link: action.link };
    case 'setListing':
      // A new listing invalidates any previous hero choice and its copy.
      // Photo 1 is preselected when the listing is what the hero step shows.
      return {
        ...state,
        listing: action.listing,
        hero: state.uploads.length ? state.hero : action.listing.images.length ? 1 : null,
        copy: { status: 'idle' },
      };
    case 'addUploads': {
      const uploads = [...state.uploads, ...action.uploads].slice(0, 6);
      // Photo 1 is preselected, so a single upload needs no extra click.
      return { ...state, uploads, hero: state.hero ?? (uploads.length ? 1 : null) };
    }
    case 'setHero':
      // Copy is written from the hero, so a different hero needs new copy.
      return state.hero === action.hero
        ? state
        : { ...state, hero: action.hero, copy: { status: 'idle' } };
    case 'setVolume':
      return { ...state, volume: action.volume };
    case 'setStyleDirection':
      return { ...state, styleDirection: action.text };
    case 'toggleMockup': {
      if (state.mockups.includes(action.mockup)) {
        return { ...state, mockups: state.mockups.filter((m) => m !== action.mockup) };
      }
      // Capped at three: choosing a fourth drops the oldest (FIFO).
      const mockups = [...state.mockups, action.mockup];
      return { ...state, mockups: mockups.length > MAX_MOCKUPS ? mockups.slice(1) : mockups };
    }
    case 'setMockups':
      return { ...state, mockups: action.mockups.slice(0, MAX_MOCKUPS) };
    case 'setFanOut':
      return { ...state, fanOut: action.fanOut };
    case 'toggleCrop':
      return { ...state, crops: { ...state.crops, [action.crop]: !state.crops[action.crop] } };
    case 'setDistinctPerPin':
      return { ...state, distinctPerPin: action.on };
    case 'setCopy':
      return { ...state, copy: action.copy };
    case 'reset': {
      // A new run starts clean: no uploads, no listing, no hero, no copy —
      // and a new run number, so mockups and review state from the last run
      // cannot carry over.
      const fresh = { ...initial, runNumber: state.runNumber + 1 };
      return action.keepRecipe
        ? {
            ...fresh,
            mockups: state.mockups,
            styleDirection: state.styleDirection,
            volume: state.volume,
            fanOut: state.fanOut,
            crops: state.crops,
            distinctPerPin: state.distinctPerPin,
          }
        : fresh;
    }
  }
}

export function assetCount(state: RunState): number {
  const cropCount = CROPS.filter((c) => state.crops[c]).length;
  return state.volume * cropCount;
}

// The hero step's candidates: the seller's own uploads, and only those.
// Listing images used to be offered too, but the listing fetch is blocked by
// Etsy, and mixing sources put photos on the hero step the seller never chose.
export function heroImages(state: RunState): string[] {
  return state.uploads.slice(0, 6);
}

// The image every mockup and the copy build from. Photo 1 when nothing has
// been picked explicitly.
export function heroImage(state: RunState): string | undefined {
  const images = heroImages(state);
  return images[(state.hero ?? 1) - 1] ?? images[0];
}


const RunContext = createContext<{ run: RunState; dispatch: Dispatch<Action> } | null>(null);

export function RunProvider({ children }: { children: ReactNode }) {
  const [run, dispatch] = useReducer(reducer, initial);
  return <RunContext.Provider value={{ run, dispatch }}>{children}</RunContext.Provider>;
}

export function useRun() {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error('useRun outside RunProvider');
  return ctx;
}

// Every "New run" button: start clean — no uploaded photos, mockups, copy,
// selected pin or approvals from the previous run — then go to step 1.
// keepRecipe is Library's Duplicate: a new product with the same look.
export function useNewRun() {
  const { dispatch } = useRun();
  const navigate = useNavigate();
  return (opts: { keepRecipe?: boolean } = {}) => {
    dispatch({ type: 'reset', keepRecipe: opts.keepRecipe });
    navigate('/run/product');
  };
}
