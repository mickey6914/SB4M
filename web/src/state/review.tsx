import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { SCENE_CATALOG, type Crop, type RunState } from './run';

// Review-screen state per the handoff's State Management table. Pin data is
// seeded from the run (real listing title when one was ingested) and stays
// illustrative until mockup generation lands in increment 5; the AI copy per
// pin is real once the server has an Anthropic key.

export type Keyword = { text: string; on: boolean };

export type Pin = {
  title: string;
  desc: string;
  keywords: Keyword[];
  kwNote: string;
  flagged: boolean;
  scene: string; // the inspiration scene this pin's mockup is built in
};

export type OverlayPos = 'top' | 'middle' | 'bottom';

export type ReviewState = {
  pins: Pin[];
  pin: number; // selected, 1-based
  crop: Crop;
  approved: number;
  product: string;
  overlay: string;
  overlayPos: OverlayPos;
  writing: boolean;
  writeError: string;
  shown: number; // pin cards revealed in the grid
};

export const CROP_NETWORKS: Record<Crop, string> = {
  '2:3': 'Pinterest pin',
  '1:1': 'Facebook post',
  '4:5': 'Instagram feed',
  '9:16': 'Story / reel',
};

export function seedReview(run: RunState): ReviewState {
  const base = run.listing?.title ?? 'Product pin';
  const sceneNames = run.scenes.length
    ? run.scenes.map((s) => SCENE_CATALOG[s - 1])
    : ['Studio'];
  const pins: Pin[] = Array.from({ length: run.volume }, (_, i) => ({
    title: `${base} — ${sceneNames[i % sceneNames.length]}`,
    desc: '',
    keywords: [],
    kwNote: '',
    // Flag every fifth pin until real keyword QA exists (illustrative).
    flagged: (i + 1) % 5 === 0,
    scene: sceneNames[i % sceneNames.length],
  }));
  return {
    pins,
    pin: 1,
    crop: '2:3',
    approved: 0,
    product: run.listing?.description ?? '',
    overlay: 'EXPRESS ART VIBE',
    overlayPos: 'bottom',
    writing: false,
    writeError: '',
    shown: Math.min(6, pins.length),
  };
}

type Action =
  | { type: 'selectPin'; pin: number }
  | { type: 'setCrop'; crop: Crop }
  | { type: 'setProduct'; text: string }
  | { type: 'setTitle'; text: string }
  | { type: 'setDesc'; text: string }
  | { type: 'toggleKeyword'; index: number }
  | { type: 'setOverlay'; text: string }
  | { type: 'setOverlayPos'; pos: OverlayPos }
  | { type: 'approve' }
  | { type: 'reject' }
  | { type: 'approveAll' }
  | { type: 'showMore' }
  | { type: 'writeStart' }
  | { type: 'writeSuccess'; title: string; desc: string; keywords: string[] }
  | { type: 'writeFailure'; message: string }
  | { type: 'reseed'; state: ReviewState };

function updateSelected(state: ReviewState, patch: Partial<Pin>): ReviewState {
  const pins = state.pins.map((p, i) => (i === state.pin - 1 ? { ...p, ...patch } : p));
  return { ...state, pins };
}

function advance(state: ReviewState): number {
  return state.pin < state.pins.length ? state.pin + 1 : state.pin;
}

function reducer(state: ReviewState, action: Action): ReviewState {
  switch (action.type) {
    case 'selectPin':
      return { ...state, pin: action.pin };
    case 'setCrop':
      return { ...state, crop: action.crop };
    case 'setProduct':
      return { ...state, product: action.text };
    case 'setTitle':
      return updateSelected(state, { title: action.text });
    case 'setDesc':
      return updateSelected(state, { desc: action.text });
    case 'toggleKeyword': {
      const pin = state.pins[state.pin - 1];
      const keywords = pin.keywords.map((k, i) =>
        i === action.index ? { ...k, on: !k.on } : k
      );
      return updateSelected(state, { keywords });
    }
    case 'setOverlay':
      return { ...state, overlay: action.text };
    case 'setOverlayPos':
      return { ...state, overlayPos: action.pos };
    case 'approve':
      return {
        ...state,
        approved: Math.min(state.pins.length, state.approved + 1),
        pin: advance(state),
      };
    case 'reject':
      return { ...state, pin: advance(state) };
    case 'approveAll':
      return { ...state, approved: state.pins.length };
    case 'showMore':
      return { ...state, shown: state.pins.length };
    case 'writeStart':
      return { ...state, writing: true, writeError: '' };
    case 'writeSuccess': {
      const next = updateSelected(state, {
        title: action.title,
        desc: action.desc,
        // First three keywords pre-checked, per the contract.
        keywords: action.keywords.map((text, i) => ({ text, on: i < 3 })),
        kwNote: 'Written by Claude just now — 3 of 5 selected by default.',
      });
      return { ...next, writing: false, writeError: '' };
    }
    case 'writeFailure':
      return { ...state, writing: false, writeError: action.message };
    case 'reseed':
      return action.state;
  }
}

const ReviewContext = createContext<{
  review: ReviewState;
  dispatch: Dispatch<Action>;
} | null>(null);

export function ReviewProvider({ run, children }: { run: RunState; children: ReactNode }) {
  const [review, dispatch] = useReducer(reducer, run, seedReview);
  return <ReviewContext.Provider value={{ review, dispatch }}>{children}</ReviewContext.Provider>;
}

export function useReview() {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error('useReview outside ReviewProvider');
  return ctx;
}
