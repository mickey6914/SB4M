import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { type Crop, type RunState } from './run';
import { copyForPin, type RunCopyResult, type Tag } from './posts';

// Review-screen state per the handoff's State Management table. Pins are
// seeded from the run's copy — written by Claude during the Generating step —
// so every pin arrives with a title, the description and thirteen tags, and
// the seller never has to type one.

export type Keyword = Tag;

export type Pin = {
  title: string;
  desc: string;
  keywords: Keyword[];
  flagged: boolean;
  mockup: string; // what the design goes on — the run's mockup types, in rotation
  // Whether this pin goes out. Approval used to be a bare count, and the push
  // took the FIRST N pins — so rejecting pin 2 and approving pin 6 still sent
  // pins 1-4. Which pins are approved is a fact about the pins.
  approved: boolean;
  // Where the pin sends someone who clicks it. Seeded from the run's listing
  // URL; editable because an upload-based run has no listing to inherit one
  // from, and a pin with no destination is a pin nobody can buy from.
  link: string;
  // Which batch of run copy filled this pin ('' for none), and whether the
  // seller has since changed its words themselves. A newer batch replaces
  // every pin it did not write and the seller has not touched — it used to
  // fill only empty pins, which let stale copy and fresh copy sit side by
  // side in one push (DECISIONS.md §21).
  copyId: string;
  handEdited: boolean;
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
  // The three title suggestions shown under the Title field.
  titleOptions: string[];
  kwNote: string;
  shown: number; // pin cards revealed in the grid
};

export const CROP_NETWORKS: Record<Crop, string> = {
  '2:3': 'Pinterest pin',
  '1:1': 'Facebook post',
  '4:5': 'Instagram feed',
  '9:16': 'Story / reel',
};

const RUN_COPY_NOTE = (n: number) =>
  `Written by Claude for all ${n} pins. Untick any tag you don't want.`;

export function seedReview(run: RunState): ReviewState {
  const copy = run.copy.status === 'done' ? run.copy : null;
  const copyId = copy?.id ?? '';
  const pins: Pin[] = Array.from({ length: run.volume }, (_, i) => ({
    // No copy yet means blank, not a placeholder: a made-up title would slip
    // past the push's missing-copy check and go out as if it were written.
    ...(copy ? copyForPin(copy, i) : { title: '', desc: '', keywords: [] }),
    // No keyword QA exists yet, so nothing is flagged. This used to mark every
    // fifth pin regardless of content — a mockup leftover that looked like a
    // verdict on the copy and always landed on the same card in the grid. The
    // field stays for when a real check arrives; inventing one is worse than
    // having none.
    flagged: false,
    // Each pin takes the next chosen mockup type in rotation: pin 1 the
    // first, pin 2 the second, and round again.
    mockup: run.mockups[i % run.mockups.length] ?? 'Wall art',
    approved: false,
    link: run.listing?.url ?? run.link ?? '',
    copyId,
    handEdited: false,
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
    titleOptions: copy?.titles ?? [],
    kwNote: copy ? RUN_COPY_NOTE(pins.length) : '',
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
  | { type: 'writeSuccess'; copy: RunCopyResult }
  // The run's copy landed after Review opened (the seller skipped ahead).
  | { type: 'applyRunCopy'; copy: RunCopyResult & { id: string } }
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

export function reviewReducer(state: ReviewState, action: Action): ReviewState {
  switch (action.type) {
    case 'selectPin':
      return { ...state, pin: action.pin };
    case 'setCrop':
      return { ...state, crop: action.crop };
    case 'setProduct':
      return { ...state, product: action.text };
    case 'setTitle':
      return updateSelected(state, { title: action.text, handEdited: true });
    case 'setDesc':
      return updateSelected(state, { desc: action.text, handEdited: true });
    case 'toggleKeyword': {
      const pin = state.pins[state.pin - 1];
      const keywords = pin.keywords.map((k, i) =>
        i === action.index ? { ...k, on: !k.on } : k
      );
      return updateSelected(state, { keywords, handEdited: true });
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
      // Rewrite with AI: the selected pin only.
      // An explicit rewrite is the seller's choice for this pin, so a later
      // batch leaves it alone.
      const next = updateSelected(state, { ...copyForPin(action.copy, state.pin - 1), handEdited: true });
      return {
        ...next,
        writing: false,
        writeError: '',
        titleOptions: action.copy.titles,
        kwNote: `Rewritten for pin ${state.pin} just now.`,
      };
    }
    case 'applyRunCopy': {
      // Replace every pin this batch did not already write, unless the seller
      // changed its words themselves — so no pin keeps another batch's copy.
      if (state.pins.every((p) => p.copyId === action.copy.id || p.handEdited)) return state;
      const pins = state.pins.map((p, i) => {
        if (p.handEdited || p.copyId === action.copy.id) return p;
        return { ...p, ...copyForPin(action.copy, i), copyId: action.copy.id };
      });
      return {
        ...state,
        pins,
        titleOptions: action.copy.titles,
        kwNote: RUN_COPY_NOTE(pins.length),
        writeError: '',
      };
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
  const [review, dispatch] = useReducer(reviewReducer, run, seedReview);
  return <ReviewContext.Provider value={{ review, dispatch }}>{children}</ReviewContext.Provider>;
}

export function useReview() {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error('useReview outside ReviewProvider');
  return ctx;
}
