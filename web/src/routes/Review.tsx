import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePush } from '../state/push';
import { requestCopy } from '../state/copy';
import {
  buildPosts,
  missingCopyMessage,
  networksFor,
  NETWORK_CROP,
  pinsMissingCopy,
  PINTEREST_DESC_MAX,
  pushSummary,
  TAG_TOTAL,
} from '../state/posts';
import { assetCount, CROPS, heroImage, productTypeFor, useRun, type Crop } from '../state/run';
import {
  CROP_NETWORKS,
  ReviewProvider,
  useReview,
  type Pin,
  type OverlayPos,
  type OverlaySize,
} from '../state/review';
import { useWorkspace } from '../state/workspace';

// Review screen, README section 7: crop preview panel, pin grid with crop
// tabs, and the inspector with live Claude copywriting. The four crops are
// real server-rendered assets (increment 5): one source image cover-cropped
// to each network's native size with the overlay bar composited per ratio.

const CROP_RATIOS: Record<Crop, string> = {
  '2:3': '2 / 3',
  '1:1': '1 / 1',
  '4:5': '4 / 5',
  '9:16': '9 / 16',
};

type Rendered = Record<string, string>;

// Mockups are generated one at a time, on purpose. Firing them together made
// the small instance compete with itself for memory, and a failure there was
// invisible. Each lands as it is ready, and a failure shows on its own card.
//
// A job is one mockup to generate: the mockup type the design goes on and the
// key it is stored under. With one image per mockup type the key is the type,
// so pins sharing a type share it. With one per pin the key carries the pin
// number, which also becomes the `variant` the server folds into its cache
// key — the only thing stopping two pins collapsing onto one generation.
type MockupJob = { key: string; mockup: string; variant?: string };

function mockupKeyFor(pin: Pick<Pin, 'mockup'>, n: number, distinct: boolean): string {
  return distinct ? `${pin.mockup}#${n}` : pin.mockup;
}

// One mockup request, with one automatic retry when the server could not be
// reached or answered with something that isn't the app (a restart on the
// host shows up as an HTML error page, not JSON). The failure message says
// which of those happened instead of a generic "could not reach".
async function postMockup(
  body: Record<string, unknown>,
  isCancelled: () => boolean
): Promise<{ ok: true; image: string } | { ok: false; message: string }> {
  let last = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 4000));
      if (isCancelled()) return { ok: false, message: 'Cancelled.' };
    }
    let res: Response;
    try {
      res = await fetch('/api/scenes/mockup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      last = 'Lost the connection to the server while building this mockup — it may have restarted.';
      continue;
    }
    let json: { ok?: boolean; image?: string; message?: string };
    try {
      json = await res.json();
    } catch {
      last = `The server answered ${res.status} instead of a mockup — it may have been restarting.`;
      continue;
    }
    if (json.ok && json.image) return { ok: true, image: json.image };
    // A real refusal from the app (a bad key, a provider error) is not
    // retried: the same request would get the same answer.
    return { ok: false, message: json.message || `The server refused this mockup (${res.status}).` };
  }
  return { ok: false, message: last };
}

function useSceneMockups(
  product: string | undefined,
  jobs: MockupJob[],
  styleDirection: string,
  // Bumped by "Try again". Mockups that already succeeded come back from the
  // server's cache at no cost; only the failed ones are generated again.
  retry: number
) {
  const [mockups, setMockups] = useState<Record<string, string>>({});
  // Why each failed mockup failed, by key — shown on that pin's card rather
  // than silently swapping in the raw photo.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [done, setDone] = useState(0);
  const signature = JSON.stringify(jobs);

  useEffect(() => {
    const wanted: MockupJob[] = JSON.parse(signature);
    setMockups({});
    setErrors({});
    setFailure('');
    setDone(0);
    if (!product || wanted.length === 0) return;
    let cancelled = false;
    (async () => {
      const found: Record<string, string> = {};
      const failed: Record<string, string> = {};
      for (const job of wanted) {
        if (cancelled) return;
        const result = await postMockup(
          { mockup: job.mockup, styleDirection, product, variant: job.variant },
          () => cancelled
        );
        if (result.ok) found[job.key] = result.image;
        else failed[job.key] = result.message;
        if (cancelled) return;
        // Publish each one as it lands rather than making the seller wait for
        // the whole set — on a 30-pin run that is minutes of staring at nothing.
        setMockups({ ...found });
        setErrors({ ...failed });
        setDone((n) => n + 1);
      }
      if (cancelled) return;
      const missing = Object.keys(failed);
      setFailure(
        missing.length
          ? `${missing.length} of ${wanted.length} mockup${
              wanted.length > 1 ? 's' : ''
            } could not be generated — ${failed[missing[0]]}`
          : ''
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [product, signature, styleDirection, retry]);

  // total is 0 when there is nothing to generate FROM. Without this the banner
  // sat at "0 of 30" forever on a Review opened with no run behind it — the
  // effect returns early for want of a product and never counts anything.
  return { mockups, errors, failure, done, total: product && jobs.length ? jobs.length : 0 };
}

// Basic marketing prints the pin's title under the artwork, so its image has
// to follow the title. It is kept apart from the AI mockups on purpose: those
// cost credits, and if a title edit re-ran that loop, a generation still in
// flight would be requested again. These are composited locally, so redrawing
// one after the seller stops typing is free and quick.
const BASIC_MARKETING = 'Basic marketing';

function useTitledMockups(
  product: string | undefined,
  pins: Pin[],
  distinct: boolean,
  retry: number
) {
  const [mockups, setMockups] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const wanted = useMemo(() => {
    const out: { key: string; title: string; variant?: string }[] = [];
    const seen = new Set<string>();
    pins.forEach((p, i) => {
      if (p.mockup !== BASIC_MARKETING) return;
      const key = mockupKeyFor(p, i + 1, distinct);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ key, title: p.title, ...(distinct ? { variant: String(i + 1) } : {}) });
    });
    return out;
  }, [pins, distinct]);
  const signature = JSON.stringify(wanted);

  useEffect(() => {
    const jobs: { key: string; title: string; variant?: string }[] = JSON.parse(signature);
    if (!product || jobs.length === 0) return;
    let cancelled = false;
    // Wait for the seller to stop typing before redrawing.
    const t = setTimeout(async () => {
      for (const job of jobs) {
        if (cancelled) return;
        const result = await postMockup(
          { mockup: BASIC_MARKETING, product, title: job.title, variant: job.variant },
          () => cancelled
        );
        if (cancelled) return;
        if (result.ok) {
          setMockups((m) => ({ ...m, [job.key]: result.image }));
          setErrors((e) => {
            const { [job.key]: _gone, ...rest } = e;
            return rest;
          });
        } else {
          setErrors((e) => ({ ...e, [job.key]: result.message }));
        }
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [product, signature, retry]);

  return { mockups, errors };
}

// Which of the accounts this run will post to are no longer authorized.
//
// Content360 refuses a post to an expired account, and so does our push — but
// both of those happen after the seller has committed. Worse, a token can
// expire BETWEEN scheduling and the publish time, so a batch that pushed
// cleanly still fails days later, silently, in someone else's dashboard. The
// state is on the accounts record; asking for it before the push turns a
// discovery into a warning.
function useAccountHealth(networks: string[], chosen: Record<string, { id: number } | undefined>) {
  const [stale, setStale] = useState<string[]>([]);
  const key = networks.join('|');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/content360/accounts');
        const json = await res.json();
        if (cancelled || !json.ok || !Array.isArray(json.accounts)) return;
        const bad: string[] = [];
        for (const network of key ? key.split('|') : []) {
          const pick = chosen[network]?.id;
          // The account this run will actually use: the chosen one, or the
          // first on that network when nothing is chosen.
          const account = pick
            ? json.accounts.find((a: any) => a.id === pick)
            : json.accounts.find((a: any) => a.network === network);
          if (account && !account.authorized) {
            bad.push(`${network} (${account.username || account.name})`);
          }
        }
        setStale(bad);
      } catch {
        // Silence here is right: a check that cannot run is not a problem to
        // report, and the push has its own guard.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return stale;
}

// Fetch the four rendered crops whenever the source or overlay changes,
// debounced so typing in the overlay field doesn't re-render per keystroke.
function useRenderedCrops(
  src: string | undefined,
  overlay: string,
  pos: OverlayPos,
  size: OverlaySize,
  // Set for a Basic marketing pin: src is then the raw artwork, and each crop
  // is drawn at its own shape with this title (DECISIONS.md §19).
  promo?: { title: string; variant?: number }
) {
  const [images, setImages] = useState<Rendered | null>(null);
  const promoKey = promo ? JSON.stringify(promo) : '';
  useEffect(() => {
    if (!src) {
      setImages(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/crops/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            src,
            overlay,
            overlayPos: pos,
            overlaySize: size,
            ...(promoKey ? { promo: JSON.parse(promoKey) } : {}),
          }),
        });
        const json = await res.json();
        if (!cancelled && json.ok && json.images) setImages(json.images);
      } catch {
        // Keep the CSS fallback preview on failure.
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [src, overlay, pos, size, promoKey]);
  return images;
}

function CropPreview({
  src,
  rendered,
  hasScene,
  sceneError,
}: {
  src?: string;
  rendered: Rendered | null;
  // Whether what is on screen really is a mockup. The caption used to
  // assert one unconditionally, including when generating it had failed.
  hasScene: boolean;
  sceneError?: string;
}) {
  const { review } = useReview();
  const pin = review.pins[review.pin - 1];
  return (
    <div className="crop-panel">
      <div className="crop-panel-header">
        <div>
          <div className="page-kicker" style={{ marginBottom: 4 }}>
            All four crops · Pin {review.pin}
          </div>
          <div className="crop-panel-title">{pin.title || 'No title yet'}</div>
        </div>
        <div className="crop-panel-note">
          Overlay sits at the {review.overlayPos} of every crop — re-placed per ratio, never
          sliced.{' '}
          {hasScene
            ? `${pin.mockup} mockup.`
            : sceneError
              ? `The ${pin.mockup.toLowerCase()} mockup failed — ${sceneError} Showing your original artwork.`
              : 'Mockup still generating — showing your original artwork for now.'}
        </div>
      </div>
      <div className="crop-panel-body">
        {CROPS.map((crop) => (
          <div key={crop}>
            <div className="crop-frame" style={{ aspectRatio: CROP_RATIOS[crop] }}>
              {rendered?.[crop] ? (
                // Server-rendered asset: the overlay is baked into the pixels.
                <img src={rendered[crop]} alt="" className="crop-img" />
              ) : (
                <>
                  {src && <img src={src} alt="" className="crop-img" />}
                  <div
                    className={`crop-overlay crop-overlay-${review.overlayPos} crop-overlay-${review.overlaySize}`}
                  >
                    {review.overlay}
                  </div>
                </>
              )}
            </div>
            <div className="crop-caption">
              {crop} · {CROP_NETWORKS[crop]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PinGrid({
  rendered,
  networks,
  mockups,
  errors,
  product,
  mockupKey,
  onRetry,
}: {
  rendered: Rendered | null;
  networks: string[];
  // Per-pin mockups, so a card can show its own rather than the selected
  // pin's, and why any failed.
  mockups: Record<string, string>;
  errors: Record<string, string>;
  product?: string;
  // How a pin finds its own image. Depends on whether the run generates one
  // mockup per type or one per pin, so it is passed in rather than guessed.
  mockupKey: (pin: Pin, pinNumber: number) => string;
  // Re-request failed mockups. Absent while generation is still running, so
  // a retry can never re-request one already in flight.
  onRetry?: () => void;
}) {
  const { review, dispatch } = useReview();
  const hidden = review.pins.length - review.shown;
  const included = review.pins.slice(0, review.shown).filter((p) => p.approved).length;
  return (
    <>
      <div className="pin-grid">
        {review.pins.slice(0, review.shown).map((pin, i) => {
          const n = i + 1;
          const key = mockupKey(pin, n);
          const own = mockups[key];
          const error = errors[key];
          // The selected card shows the server render, where the bar is baked
          // into the pixels — once it exists. Every other card, and the
          // selected one until its render lands, carries a CSS bar sized by
          // the same fractions the renderer uses, so the band is on every card.
          const baked = review.pin === n && own && rendered?.[review.crop];
          const image = baked || own || (error ? undefined : product);
          return (
            <div
              key={n}
              className={review.pin === n ? 'pin-card selected' : 'pin-card'}
              onClick={() => dispatch({ type: 'selectPin', pin: n })}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  dispatch({ type: 'selectPin', pin: n });
                }
              }}
            >
              <div className="pin-media" style={{ aspectRatio: CROP_RATIOS[review.crop] }}>
                {image && <img src={image} alt="" className="crop-img" />}
                {/* A failed mockup says so, on the card, instead of quietly
                    showing the untouched photo under a mockup caption. */}
                {error && (
                  <div className="pin-failed">
                    <strong>Mockup failed</strong>
                    <span>{error}</span>
                    <span>Until it's made, this pin would push your original artwork.</span>
                    {onRetry && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRetry();
                        }}
                      >
                        Try again
                      </button>
                    )}
                  </div>
                )}
                {!baked && (
                  <div
                    className={`crop-overlay crop-overlay-${review.overlayPos} crop-overlay-${review.overlaySize}`}
                  >
                    {review.overlay}
                  </div>
                )}
                {/* Include sits top-left of the image. Only included pins are
                    pushed. Approval used to be a bare count and the push took
                    the first N pins, so a rejected pin still went out. */}
                <label
                  className={pin.approved ? 'pin-check is-on' : 'pin-check'}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={pin.approved}
                    onChange={() => dispatch({ type: 'toggleApproved', pin: n })}
                  />
                  Include
                </label>
                {/* Above the band, so it never covers the checkbox or the brand. */}
                {pin.flagged && (
                  <div
                    className={`pin-flag ${
                      review.overlayPos === 'bottom' ? `pin-flag-above-${review.overlaySize}` : 'pin-flag-bottom'
                    }`}
                  >
                    Keyword flagged
                  </div>
                )}
              </div>
              <div className="pin-title">{pin.title || <em>No title yet</em>}</div>
              <div className="pin-sub">
                {pin.mockup}
              </div>
              <div className="pin-chips">
                {networks.map((net, j) => (
                  <span key={net} className={j === 0 ? 'tag tag-accent' : 'tag tag-neutral'}>
                    {net}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {hidden > 0 && (
        <button className="btn btn-ghost" type="button" style={{ marginTop: 16 }} onClick={() => dispatch({ type: 'showMore' })}>
          Show {hidden} more pins
        </button>
      )}
      <p className="rail-note">
        {included} of {Math.min(review.shown, review.pins.length)} included. Only included pins go to
        Content360.
      </p>
    </>
  );
}

function Inspector() {
  const { run } = useRun();
  const { rules } = useWorkspace();
  const { review, dispatch } = useReview();
  const pin = review.pins[review.pin - 1];
  const tagsOn = pin.keywords.filter((k) => k.on).length;

  // Re-runs the same prompt as the Generating step, for the selected pin only.
  const rewrite = async () => {
    if (review.writing) return;
    dispatch({ type: 'writeStart' });
    const res = await requestCopy({
      image: heroImage(run),
      product: review.product,
      mockups: [pin.mockup],
      styleDirection: run.styleDirection,
      rules,
      productType: productTypeFor(run, rules.productType),
    });
    if (res.ok) dispatch({ type: 'writeSuccess', copy: res.copy });
    else dispatch({ type: 'writeFailure', message: res.message });
  };

  return (
    <aside className="inspector">
      <div className="page-kicker">
        Pin {review.pin} of {review.pins.length} · {review.crop} crop
      </div>

      <div className="field-block">
        <div className="field-label">Notes for the copywriter — optional</div>
        <textarea
          className="input"
          style={{ minHeight: 70 }}
          value={review.product}
          onChange={(e) => dispatch({ type: 'setProduct', text: e.target.value })}
          placeholder="Anything the image doesn't show — size, material, who it's for"
        />
      </div>

      <div className="field-block">
        <div className="field-label">Destination link</div>
        <input
          className="input"
          type="url"
          value={pin.link}
          onChange={(e) => dispatch({ type: 'setLink', url: e.target.value })}
          placeholder="https://expressartvibe.etsy.com/listing/..."
        />
        <div className="rail-note" style={{ marginTop: 6 }}>
          Pinterest carries this as the pin's destination. Facebook and Instagram
          have no link field, so it is added to the end of the caption — clickable
          on Facebook, visible but not clickable on Instagram.
        </div>
        <button
          className="btn btn-ghost"
          type="button"
          style={{ marginTop: 6 }}
          onClick={() => dispatch({ type: 'setLinkAll', url: pin.link })}
        >
          Use this link for every pin
        </button>
      </div>

      <div className="field-block">
        <div className="field-label">Title</div>
        <input
          className="input"
          type="text"
          value={pin.title}
          onChange={(e) => dispatch({ type: 'setTitle', text: e.target.value })}
        />
        {review.titleOptions.length > 0 && (
          <>
            <div className="rail-note" style={{ margin: '10px 0 6px' }}>
              Suggestions — click to use
            </div>
            <div className="title-options">
              {review.titleOptions.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={pin.title === t ? 'title-option is-on' : 'title-option'}
                  onClick={() => dispatch({ type: 'setTitle', text: t })}
                >
                  {t}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="field-block">
        <div className="field-label">Description</div>
        <textarea
          className="input"
          style={{ minHeight: 110 }}
          value={pin.desc}
          onChange={(e) => dispatch({ type: 'setDesc', text: e.target.value })}
        />
        {/* Pinterest cuts a description at 500 characters, and its caption
            adds hashtags after the description inside that same limit. */}
        <div className={pin.desc.length > PINTEREST_DESC_MAX ? 'desc-count is-over' : 'desc-count'}>
          {pin.desc.length} / {PINTEREST_DESC_MAX} · Pinterest's limit
          {pin.desc.length > PINTEREST_DESC_MAX ? ' — Pinterest will cut this short' : ''}
        </div>
      </div>

      <div className="rewrite-row">
        <span className="rewrite-note">
          {rules.requireAd && pin.desc && !/#ad\b/i.test(pin.desc)
            ? 'No #ad in this description — add it if this pin promotes an affiliate link.'
            : ''}
        </span>
        <button
          className="btn btn-secondary btn-small"
          type="button"
          disabled={review.writing}
          onClick={rewrite}
        >
          {review.writing ? 'Writing…' : 'Rewrite with AI'}
        </button>
      </div>
      {review.writeError && <p className="ingest-error">{review.writeError}</p>}

      <div className="field-block">
        <div className="field-label">
          Tags · {tagsOn} of {pin.keywords.length || TAG_TOTAL}
        </div>
        {pin.keywords.length === 0 ? (
          <p className="rail-note" style={{ margin: '4px 0 0' }}>
            No tags yet — they are written with the titles and description. Rewrite with AI to try
            again.
          </p>
        ) : (
          <div className="tag-checklist">
            {pin.keywords.map((k, i) => (
              <label key={`${k.text}-${i}`} className="tag-check">
                <input
                  type="checkbox"
                  checked={k.on}
                  onChange={() => dispatch({ type: 'toggleKeyword', index: i })}
                />
                <span>{k.text}</span>
              </label>
            ))}
          </div>
        )}
        {review.kwNote && <p className="kw-note">{review.kwNote}</p>}
      </div>

      <div className="field-block">
        <div className="field-label">Text overlay</div>
        <div className="seg" style={{ marginBottom: 10 }}>
          {(['top', 'middle', 'bottom'] as OverlayPos[]).map((pos) => (
            <label key={pos} className="seg-opt">
              <input
                type="radio"
                name="overlay-pos"
                checked={review.overlayPos === pos}
                onChange={() => dispatch({ type: 'setOverlayPos', pos })}
              />
              {pos[0].toUpperCase() + pos.slice(1)}
            </label>
          ))}
        </div>
        {/* Bar size. Guessed at twice, wrong twice — how prominent a brand mark
            should be is a matter of taste, so it is a setting rather than a
            constant. The four crops above re-render as this changes. */}
        <div className="seg" style={{ marginBottom: 10 }}>
          {(['small', 'medium', 'large'] as OverlaySize[]).map((size) => (
            <label key={size} className="seg-opt">
              <input
                type="radio"
                name="overlay-size"
                checked={review.overlaySize === size}
                onChange={() => dispatch({ type: 'setOverlaySize', size })}
              />
              {size[0].toUpperCase() + size.slice(1)}
            </label>
          ))}
        </div>
        <input
          className="input"
          type="text"
          value={review.overlay}
          onChange={(e) => dispatch({ type: 'setOverlay', text: e.target.value })}
        />
      </div>

      <div className="inspector-actions">
        <button className="btn btn-primary" type="button" onClick={() => dispatch({ type: 'approve' })}>
          Approve pin
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => dispatch({ type: 'reject' })}>
          Reject
        </button>
      </div>
    </aside>
  );
}

function ReviewBody({ runId }: { runId: string }) {
  const { run } = useRun();
  const { review, dispatch } = useReview();
  const { setBatch, setPushError, setSummary } = usePush();
  const { rules } = useWorkspace();
  const navigate = useNavigate();
  const [pushing, setPushing] = useState(false);
  const [inlinePushError, setInlinePushError] = useState('');
  // #ad is a reminder, not a gate — the push proceeds and this says what was
  // left unlabelled, so the seller can judge which pins actually needed it.
  const [adNotice, setAdNotice] = useState('');
  const [pushProgress, setPushProgress] = useState('');
  const [retryMockups, setRetryMockups] = useState(0);
  const pushNetworks = useMemo(() => networksFor(run.fanOut), [run.fanOut]);
  const staleAccounts = useAccountHealth(pushNetworks, rules.accountByNetwork);
  const product = heroImage(run);

  // The seller can skip ahead to Review before the copy comes back. When it
  // lands, fill every pin that is still empty.
  useEffect(() => {
    if (run.copy.status === 'done') dispatch({ type: 'applyRunCopy', copy: run.copy });
    else if (run.copy.status === 'failed')
      dispatch({ type: 'writeFailure', message: run.copy.message });
  }, [run.copy, dispatch]);

  // What to generate. Off, that is one image per mockup type and pins
  // sharing a type share it; on, it is one per pin. The key is what a card
  // looks its own image up by, so it is computed the same way in both places.
  const mockupKey = (pin: Pin, n: number) => mockupKeyFor(pin, n, run.distinctPerPin);
  const jobs = useMemo<MockupJob[]>(() => {
    const seen = new Set<string>();
    const out: MockupJob[] = [];
    review.pins.forEach((p, i) => {
      // Basic marketing carries the pin's title, so it has its own pass below.
      if (p.mockup === BASIC_MARKETING) return;
      const key = mockupKeyFor(p, i + 1, run.distinctPerPin);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        key,
        mockup: p.mockup,
        ...(run.distinctPerPin ? { variant: String(i + 1) } : {}),
      });
    });
    return out;
    // Only the mockup type of each pin matters — not its copy, which
    // changes on every keystroke in the inspector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.pins.map((p) => p.mockup).join('\n'), run.distinctPerPin]);

  const {
    mockups: generatedMockups,
    errors: generatedErrors,
    failure: sceneFailure,
    done: mockupsDone,
    total: mockupsTotal,
  } = useSceneMockups(product, jobs, run.styleDirection, retryMockups);

  const titled = useTitledMockups(product, review.pins, run.distinctPerPin, retryMockups);
  const generatingMockups = mockupsTotal > 0 && mockupsDone < mockupsTotal;
  const mockups = useMemo(
    () => ({ ...generatedMockups, ...titled.mockups }),
    [generatedMockups, titled.mockups]
  );
  const sceneErrors = useMemo(
    () => ({ ...generatedErrors, ...titled.errors }),
    [generatedErrors, titled.errors]
  );

  const selectedPin = review.pins[review.pin - 1];
  const selectedKey = selectedPin ? mockupKey(selectedPin, review.pin) : '';
  const mockup = mockups[selectedKey];
  // How a pin's crops are made. A Basic marketing pin is drawn at each crop's
  // own shape from the raw artwork; every other pin is cut from its mockup.
  const cropSourceFor = (pin: Pin, n: number) =>
    pin.mockup === BASIC_MARKETING
      ? {
          src: product,
          promo: { title: pin.title, variant: run.distinctPerPin ? n : undefined },
        }
      : { src: mockups[mockupKey(pin, n)] ?? product, promo: undefined };
  const selectedSource = selectedPin
    ? cropSourceFor(selectedPin, review.pin)
    : { src: product, promo: undefined };
  // Crops render from the mockup when there is one, else the raw photo.
  const src = mockup ?? product;
  const rendered = useRenderedCrops(
    selectedSource.src,
    review.overlay,
    review.overlayPos,
    review.overlaySize,
    selectedSource.promo
  );
  const flagged = review.pins.filter((p) => p.flagged).length;

  // Build the outgoing batch: one post per included pin per fanned-out
  // network, each carrying that pin's own copy and that network's crop.
  const push = async () => {
    if (pushing) return;
    setInlinePushError('');
    if (review.approved === 0) {
      setInlinePushError('Tick Include on at least one pin before pushing to Content360.');
      return;
    }
    // Every post needs its words. Testing sent six image-only posts out of
    // nine; an included pin with no copy now stops the push, by number.
    const missing = pinsMissingCopy(review.pins);
    if (missing.length) {
      setInlinePushError(missingCopyMessage(missing));
      return;
    }
    setPushing(true);

    // The times we push have to be the times the calendar showed. They come
    // from the scheduling engine — the workspace window, the per-network
    // stagger and the daily caps all live there, and none of it can be
    // reconstructed here. Asking for exactly the included pins is safe: the
    // engine fills slots in pin order, so the first N are the same either way.
    let slots: Map<string, string>;
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productId: run.listing?.url ?? 'uploads',
          productTitle: run.listing?.title ?? 'Uploaded product',
          pinCount: review.approved,
          fanOut: run.fanOut,
          rules: {
            windowStart: rules.windowStart,
            windowEnd: rules.windowEnd,
            maxPerNetworkPerDay: rules.maxPerNetworkPerDay,
          },
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message);
      slots = new Map<string, string>(
        json.posts.map((p: { pinIndex: number; network: string; date: string; time: string }) => [
          `${p.pinIndex}#${p.network}`,
          `${p.date}T${p.time}:00.000Z`,
        ])
      );
    } catch {
      // Falling back to an invented time is what made the push disagree with
      // the calendar in the first place. Refuse instead — nothing is sent.
      setInlinePushError(
        'Could not work out the posting schedule, so nothing was pushed. Check the workspace rules in Connections and try again.'
      );
      setPushing(false);
      return;
    }

    // Each pin's OWN crops. Rendering is local sharp work with no API cost, so
    // it is done per pin, here, at the moment of pushing.
    const includedPins = review.pins
      .map((pin, i) => ({ pin, n: i + 1 }))
      .filter(({ pin }) => pin.approved);

    const assets = new Map<number, Rendered>();
    for (const { pin, n } of includedPins) {
      setPushProgress(`Preparing assets — ${assets.size + 1} of ${includedPins.length}…`);
      const { src: source, promo } = cropSourceFor(pin, n);
      if (!source) continue;
      try {
        const res = await fetch('/api/crops/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            src: source,
            overlay: review.overlay,
            overlayPos: review.overlayPos,
            overlaySize: review.overlaySize,
            ...(promo ? { promo } : {}),
          }),
        });
        const json = await res.json();
        if (json.ok && json.images) assets.set(n, json.images);
      } catch {
        // Left out of the map; the guard below refuses rather than sending a
        // post with no picture.
      }
    }
    setPushProgress('');

    const missingAsset = includedPins.find(({ n }) => !assets.get(n)?.[NETWORK_CROP.pinterest]);
    if (missingAsset) {
      setInlinePushError(
        `Could not render the assets for pin ${missingAsset.n}, so nothing was pushed. Try again.`
      );
      setPushing(false);
      return;
    }

    const posts = buildPosts({
      runId,
      pins: review.pins,
      networks: pushNetworks,
      slots,
      assets,
      accountByNetwork: rules.accountByNetwork,
      board: rules.pinterestBoardId || undefined,
    });

    // The engine returns a slot for every pin on every fanned-out network, so
    // a gap here means the two disagree about the run. Push nothing rather
    // than a post with no time on it.
    if (posts.some((p) => !p.scheduledAt)) {
      setInlinePushError(
        'The schedule came back incomplete, so nothing was pushed. Reload the run and try again.'
      );
      setPushing(false);
      return;
    }

    try {
      const res = await fetch('/api/content360/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId, posts }),
      });
      const json = await res.json();
      setAdNotice(json.adWarning ?? '');
      if (json.ok && json.batch) {
        setBatch(json.batch);
        setSummary(pushSummary(includedPins.length, pushNetworks));
        setPushError('');
        navigate('/');
      } else {
        setInlinePushError(json.message ?? 'The push did not go through — try again.');
      }
    } catch {
      setInlinePushError('Could not reach the server — the batch was not pushed.');
    } finally {
      setPushing(false);
    }
  };
  const networks =
    run.fanOut === 'pinterest'
      ? ['Pinterest']
      : run.fanOut === 'pinterest_facebook'
        ? ['Pinterest', 'FB']
        : ['Pinterest', 'FB', 'IG'];

  return (
    <>
      <div className="review-bar">
        <div className="review-bar-summary">
          Run {runId} · {review.pins.length} pins · {assetCount(run)} assets
        </div>
        <div className="crop-tabs">
          {CROPS.map((crop) => (
            <button
              key={crop}
              type="button"
              className={review.crop === crop ? 'crop-tab active' : 'crop-tab'}
              onClick={() => dispatch({ type: 'setCrop', crop })}
            >
              {crop}
            </button>
          ))}
        </div>
        <div className="review-bar-actions">
          <span className="review-counts">
            {review.approved} included · {flagged} flagged
          </span>
          <button className="btn btn-secondary" type="button" onClick={() => dispatch({ type: 'approveAll' })}>
            Approve all
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => dispatch({ type: 'rejectAll' })}>
            Clear all
          </button>
          <button className="btn btn-primary" type="button" disabled={pushing} onClick={push}>
            {pushing ? 'Pushing…' : 'Push to Content360'}
          </button>
        </div>
      </div>
      {inlinePushError && (
        <div className="push-error-bar">{inlinePushError}</div>
      )}
      {adNotice && <div className="push-error-bar">{adNotice}</div>}
      {pushProgress && <div className="push-error-bar">{pushProgress}</div>}
      {staleAccounts.length > 0 && (
        <div className="push-error-bar">
          {staleAccounts.join(' and ')} {staleAccounts.length > 1 ? 'need' : 'needs'} reconnecting in
          Content360 — the access token has expired. Posts to{' '}
          {staleAccounts.length > 1 ? 'those accounts' : 'that account'} will fail. Reconnect under
          Configuration → Social Accounts, then push.
        </div>
      )}
      {mockupsTotal > 1 && mockupsDone < mockupsTotal && (
        <div className="push-error-bar">
          Generating mockups — {mockupsDone} of {mockupsTotal} done. Pins still waiting show your
          original artwork.
        </div>
      )}
      {/* A scene that failed to generate used to be invisible: the pin quietly
          showed the untouched photo. Say it plainly instead — the pins are
          still usable, they just are not the mockups that were asked for. */}
      {(sceneFailure || Object.keys(titled.errors).length > 0) && !generatingMockups && (
        <div className="push-error-bar push-error-row">
          <span>{sceneFailure || 'A Basic marketing image could not be made.'}</span>
          <button type="button" className="btn band-btn-light" onClick={() => setRetryMockups((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
      {/* Every run reaches Pinterest, and Pinterest will not publish a pin
          without a board. The push is still allowed — Content360 accepts the
          post and holds it — but saying so here beats a silent failure. */}
      {!rules.pinterestBoardId && (
        <div className="push-warn-bar">
          No Pinterest board chosen yet — pins will reach Content360 but cannot publish until one
          is set.{' '}
          <Link to="/connections" className="push-warn-link">
            Choose a board
          </Link>
        </div>
      )}
      <div className="review-body">
        <div className="review-left">
          <CropPreview
            src={src}
            rendered={rendered}
            hasScene={Boolean(mockup)}
            sceneError={sceneErrors[selectedKey]}
          />
          <PinGrid
            rendered={rendered}
            networks={networks}
            mockups={mockups}
            errors={sceneErrors}
            product={product}
            mockupKey={mockupKey}
            onRetry={generatingMockups ? undefined : () => setRetryMockups((n) => n + 1)}
          />
        </div>
        <Inspector />
      </div>
    </>
  );
}

export default function Review() {
  const { run } = useRun();
  const { runId } = useParams();
  return (
    <ReviewProvider run={run}>
      <ReviewBody runId={runId ?? '15'} />
    </ReviewProvider>
  );
}
