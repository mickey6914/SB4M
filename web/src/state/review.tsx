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
  // Whether this pin goes out. Approval used to be a bare count, and the push
  // took the FIRST N pins — so rejecting pin 2 and approving pin 6 still sent
  // pins 1-4. Which pins are approved is a fact about the pins.
  approved: boolean;
  // Where the pin sends someone who clicks it. Seeded from the run's listing
  // URL; editable because an upload-based run has no listing to inherit one
  // from, and a pin with no destination is a pin nobody can buy from.
  link: string;
};

export type OverlaySize = 'small' | 'medium' | 'large';

export type OverlayPos = 'top' | 'middle' | 'bottom';

export type ReviewState = {
  pins: Pin[];
  pin: number; // selected, 1-based
  crop: Crop;
  // Derived from the pins on every change, so the many places that read a
  // count keep working while the pins stay the source of truth.
  approved: number;
  product: string;
  overlay: string;
  overlayPos: OverlayPos;
  overlaySize: OverlaySize;
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
    // No keyword QA exists yet, so nothing is flagged. This used to mark every
    // fifth pin regardless of content — a mockup leftover that looked like a
    // verdict on the copy and always landed on the same card in the grid. The
    // field stays for when a real check arrives; inventing one is worse than
    // having none.
    flagged: false,
    scene: sceneNames[i % sceneNames.length],
    approved: false,
    link: run.listing?.url ?? run.link ?? '',
  }));
  return {
    pins,
    pin: 1,
    crop: '2:3',
    approved: 0,
    product: run.listing?.description ?? '',
    overlay: 'EXPRESS ART VIBE',
    overlayPos: 'bottom',
    overlaySize: 'medium',
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
  | { type: 'setOverlaySize'; size: OverlaySize }
  | { type: 'approve' }
  | { type: 'reject' }
  | { type: 'toggleApproved'; pin: number }
  | { type: 'rejectAll' }
  | { type: 'setLink'; url: string }
  | { type: 'setLinkAll'; url: string }
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

function setApproved(state: ReviewState, pin: number, on: boolean): Pin[] {
  return state.pins.map((p, i) => (i === pin - 1 ? { ...p, approved: on } : p));
}

// One place recomputes the count, so it can never drift from the pins.
function withCount(state: ReviewState): ReviewState {
  return { ...state, approved: state.pins.filter((p) => p.approved).length };
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
    case 'setOverlaySize':
      return { ...state, overlaySize: action.size };
    case 'approve':
      return withCount({ ...state, pins: setApproved(state, state.pin, true), pin: advance(state) });
    case 'reject':
      return withCount({
        ...state,
        pins: setApproved(state, state.pin, false),
        pin: advance(state),
      });
    case 'toggleApproved':
      return withCount({
        ...state,
        pins: setApproved(state, action.pin, !state.pins[action.pin - 1]?.approved),
      });
    case 'approveAll':
      return withCount({ ...state, pins: state.pins.map((p) => ({ ...p, approved: true })) });
    case 'rejectAll':
      return withCount({ ...state, pins: state.pins.map((p) => ({ ...p, approved: false })) });
    case 'setLink':
      return {
        ...state,
        pins: state.pins.map((p, i) => (i === state.pin - 1 ? { ...p, link: action.url } : p)),
      };
    case 'setLinkAll':
      return { ...state, pins: state.pins.map((p) => ({ ...p, link: action.url })) };
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
