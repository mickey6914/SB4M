import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';

// Client state for the run wizard, per the handoff's State Management table
// and selection rules: hero is single-select; scenes are multi-select capped
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

export type RunState = {
  shopId: string;
  link: string;
  // Fetched listing (increment 3) and seller-dropped photos — the two image
  // sources the hero step draws from. Uploads are the universal fallback.
  listing: Listing | null;
  uploads: string[];
  hero: number | null;
  volume: Volume;
  styleDirection: string;
  scenes: number[];
  fanOut: FanOut;
  // Default crops per spec; 9:16 unchecked. Instagram's default fan-out crop
  // is 4:5 feed (DECISIONS.md #3).
  crops: Record<Crop, boolean>;
};

export const SCENE_CATALOG = [
  'Cozy home setting',
  'Desk flat lay',
  'Gift box scene',
  'Digital screen mockup',
  'Linen table',
  'Window light',
  'Studio shelf',
  'Holiday wrap',
];

const initial: RunState = {
  shopId: 'eav',
  link: '',
  listing: null,
  uploads: [],
  hero: null,
  volume: 30,
  styleDirection: '',
  scenes: [],
  fanOut: 'all',
  crops: { '2:3': true, '1:1': true, '4:5': true, '9:16': false },
};

type Action =
  | { type: 'setLink'; link: string }
  | { type: 'setListing'; listing: Listing }
  | { type: 'addUploads'; uploads: string[] }
  | { type: 'setHero'; hero: number }
  | { type: 'setVolume'; volume: Volume }
  | { type: 'setStyleDirection'; text: string }
  | { type: 'toggleScene'; scene: number }
  | { type: 'setScenes'; scenes: number[] }
  | { type: 'setFanOut'; fanOut: FanOut }
  | { type: 'toggleCrop'; crop: Crop }
  | { type: 'reset' };

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case 'setLink':
      return { ...state, link: action.link };
    case 'setListing':
      // A new listing invalidates any previous hero choice.
      return { ...state, listing: action.listing, hero: null };
    case 'addUploads':
      return { ...state, uploads: [...state.uploads, ...action.uploads].slice(0, 6) };
    case 'setHero':
      return { ...state, hero: action.hero };
    case 'setVolume':
      return { ...state, volume: action.volume };
    case 'setStyleDirection':
      return { ...state, styleDirection: action.text };
    case 'toggleScene': {
      if (state.scenes.includes(action.scene)) {
        return { ...state, scenes: state.scenes.filter((s) => s !== action.scene) };
      }
      // Capped at three: choosing a fourth drops the oldest (FIFO).
      const scenes = [...state.scenes, action.scene];
      return { ...state, scenes: scenes.length > 3 ? scenes.slice(1) : scenes };
    }
    case 'setScenes':
      return { ...state, scenes: action.scenes.slice(0, 3) };
    case 'setFanOut':
      return { ...state, fanOut: action.fanOut };
    case 'toggleCrop':
      return { ...state, crops: { ...state.crops, [action.crop]: !state.crops[action.crop] } };
    case 'reset':
      return initial;
  }
}

export function assetCount(state: RunState): number {
  const cropCount = CROPS.filter((c) => state.crops[c]).length;
  return state.volume * cropCount;
}

// The hero step's six tiles: listing images first, then uploads.
export function heroImages(state: RunState): string[] {
  return [...(state.listing?.images ?? []), ...state.uploads].slice(0, 6);
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
