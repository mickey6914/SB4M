import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePush } from '../state/push';
import { assetCount, CROPS, heroImages, SCENE_CATALOG, useRun, type Crop } from '../state/run';
import {
  CROP_NETWORKS,
  ReviewProvider,
  useReview,
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

// Hybrid scene mockups: the server generates an empty background per scene and
// composites the seller's real product photo onto it. The product is never sent
// through a generative model, so it cannot be altered.
//
// One request per DISTINCT scene, not per pin — a run reuses its three
// backgrounds across all its pins, and the server caches by (scene, style,
// product), so a 30-pin run still costs three images.
//
// They run one at a time on purpose. Firing them together made the small
// instance compete with itself for memory while sharp was compositing, and a
// failure there was invisible: the UI quietly showed the untouched photo under
// a caption still claiming a scene. Failures are now surfaced, not swallowed.
// A job is one mockup to generate: which template, and the key it is stored
// under. With one image per template the key IS the template, so every pin on
// that template shares it. With one per pin the key carries the pin number,
// which also becomes the `variant` the server folds into its cache key — the
// only thing stopping two pins collapsing onto one generation.
type MockupJob = { key: string; scene: string; variant?: string };

function useSceneMockups(
  product: string | undefined,
  jobs: MockupJob[],
  styleDirection: string
) {
  const [mockups, setMockups] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [done, setDone] = useState(0);
  const signature = jobs.map((j) => `${j.key}\u0000${j.scene}\u0000${j.variant ?? ''}`).join('|');

  useEffect(() => {
    const wanted: MockupJob[] = signature
      ? signature.split('|').map((row) => {
          const [key, scene, variant] = row.split('\u0000');
          return { key, scene, variant: variant || undefined };
        })
      : [];
    if (!product || wanted.length === 0) {
      setMockups({});
      setFailure('');
      setDone(0);
      return;
    }
    let cancelled = false;
    (async () => {
      setFailure('');
      setDone(0);
      const found: Record<string, string> = {};
      let firstError = '';
      for (const job of wanted) {
        if (cancelled) return;
        try {
          const res = await fetch('/api/scenes/mockup', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              scene: job.scene,
              styleDirection,
              product,
              variant: job.variant,
            }),
          });
          const json = await res.json();
          if (json.ok && json.image) found[job.key] = json.image;
          else if (!firstError)
            firstError = json.message || `The server refused the "${job.scene}" mockup.`;
        } catch {
          if (!firstError) firstError = 'Could not reach the server to build the mockups.';
        }
        if (cancelled) return;
        // Publish each one as it lands rather than making the seller wait for
        // the whole set — on a 30-pin run that is minutes of staring at nothing.
        setMockups({ ...found });
        setDone((n) => n + 1);
      }
      if (cancelled) return;
      const missing = wanted.filter((j) => !found[j.key]);
      setFailure(
        missing.length
          ? `${missing.length} of ${wanted.length} mockup${
              wanted.length > 1 ? 's' : ''
            } could not be generated${
              firstError ? ` — ${firstError}` : '.'
            } Showing your original artwork for those.`
          : ''
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [product, signature, styleDirection]);

  // total is 0 when there is nothing to generate FROM. Without this the banner
  // sat at "0 of 30" forever on a Review opened with no run behind it — the
  // effect returns early for want of a product and never counts anything.
  return { mockups, failure, done, total: product && jobs.length ? jobs.length : 0 };
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
  size: OverlaySize
) {
  const [images, setImages] = useState<Rendered | null>(null);
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
          body: JSON.stringify({ src, overlay, overlayPos: pos, overlaySize: size }),
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
  }, [src, overlay, pos, size]);
  return images;
}

function CropPreview({
  src,
  rendered,
  hasScene,
}: {
  src?: string;
  rendered: Rendered | null;
  // Whether what is on screen really is a scene mockup. The caption used to
  // assert one unconditionally, including when generating it had failed.
  hasScene: boolean;
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
          <div className="crop-panel-title">{pin.title}</div>
        </div>
        <div className="crop-panel-note">
          Overlay sits at the {review.overlayPos} of every crop — re-placed per ratio, never
          sliced.{' '}
          {hasScene
            ? `Scene: ${pin.scene} · your product photo is composited unaltered.`
            : 'No scene background — showing your original photo unaltered.'}
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
  src,
  rendered,
  networks,
  mockups,
  product,
  mockupKey,
}: {
  src?: string;
  rendered: Rendered | null;
  networks: string[];
  // Per-scene backgrounds, so a card can show its own rather than the
  // selected pin's, and the raw photo to fall back to when a scene failed.
  mockups: Record<string, string>;
  product?: string;
  // How a pin finds its own image. Depends on whether the run generates one
  // mockup per template or one per pin, so it is passed in rather than guessed.
  mockupKey: (scene: string, pinNumber: number) => string;
}) {
  const { review, dispatch } = useReview();
  const hidden = review.pins.length - review.shown;
  const cardSrc = rendered?.[review.crop] ?? src;
  return (
    <>
      <div className="pin-grid">
        {review.pins.slice(0, review.shown).map((pin, i) => {
          const n = i + 1;
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
              {/* Approve here, without stepping through every pin. Approval used
                  to be a bare count and the push took the first N pins, so a
                  rejected pin still went out and an approved one further down
                  did not. */}
              <label
                className={pin.approved ? 'pin-check is-on' : 'pin-check'}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={pin.approved}
                  onChange={() => dispatch({ type: 'toggleApproved', pin: n })}
                />
                {pin.approved ? 'Approved' : 'Include'}
              </label>
              <div className="pin-media" style={{ aspectRatio: CROP_RATIOS[review.crop] }}>
                {/* Each card shows ITS OWN scene. It used to show the selected
                    pin's render, so every card in the grid was the same picture
                    no matter which scenes the run had chosen. */}
                {(() => {
                  // The selected card shows the server render, where the bar is
                  // baked into the pixels. The rest showed the bare mockup with
                  // no bar at all, so the grid could not tell you whether the
                  // overlay read — which is the thing being judged. They now
                  // carry a CSS bar sized by the same fractions the renderer
                  // uses, so the row is consistent.
                  if (review.pin === n) {
                    return cardSrc ? <img src={cardSrc} alt="" className="crop-img" /> : null;
                  }
                  const own = mockups[mockupKey(pin.scene, n)] ?? product;
                  if (!own) return null;
                  return (
                    <>
                      <img src={own} alt="" className="crop-img" />
                      <div
                        className={`crop-overlay crop-overlay-${review.overlayPos} crop-overlay-${review.overlaySize}`}
                      >
                        {review.overlay}
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="pin-title">{pin.title}</div>
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
      <p className="rail-note">Rejecting one crop keeps the rest of the pin.</p>
    </>
  );
}

function Inspector() {
  const { run } = useRun();
  const { rules } = useWorkspace();
  const { review, dispatch } = useReview();
  const pin = review.pins[review.pin - 1];

  const rewrite = async () => {
    if (review.writing) return;
    dispatch({ type: 'writeStart' });
    try {
      const res = await fetch('/api/copywrite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          product: review.product,
          scenes: run.scenes.map((s) => SCENE_CATALOG[s - 1]),
          styleDirection: run.styleDirection || undefined,
        }),
      });
      const json = await res.json();
      if (json.ok && json.copy) {
        dispatch({
          type: 'writeSuccess',
          title: json.copy.title,
          desc: json.copy.desc,
          keywords: json.copy.keywords,
        });
      } else {
        dispatch({
          type: 'writeFailure',
          message: json.message ?? 'Could not write that one — try again.',
        });
      }
    } catch {
      dispatch({ type: 'writeFailure', message: 'Could not write that one — try again.' });
    }
  };

  return (
    <aside className="inspector">
      <div className="page-kicker">
        Pin {review.pin} of {review.pins.length} · {review.crop} crop
      </div>

      <div className="field-block">
        <div className="field-label">Product</div>
        <textarea
          className="input"
          style={{ minHeight: 70 }}
          value={review.product}
          onChange={(e) => dispatch({ type: 'setProduct', text: e.target.value })}
          placeholder="The product description handed to the model"
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
      </div>

      <div className="field-block">
        <div className="field-label">Description</div>
        <textarea
          className="input"
          style={{ minHeight: 110 }}
          value={pin.desc}
          onChange={(e) => dispatch({ type: 'setDesc', text: e.target.value })}
        />
      </div>

      <div className="rewrite-row">
        <span className="rewrite-note">
          {rules.requireAd && !/#ad\b/i.test(pin.desc)
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
        <div className="field-label">Keywords</div>
        {pin.keywords.length === 0 ? (
          <p className="rail-note" style={{ margin: '4px 0 0' }}>
            No keywords yet — Rewrite with AI drafts five.
          </p>
        ) : (
          <div className="choice-list" style={{ marginTop: 6 }}>
            {pin.keywords.map((k, i) => (
              <label key={k.text} className="choice-row" style={{ fontSize: 13.5 }}>
                <input
                  type="checkbox"
                  checked={k.on}
                  onChange={() => dispatch({ type: 'toggleKeyword', index: i })}
                />
                {k.text}
              </label>
            ))}
          </div>
        )}
        {pin.kwNote && <p className="kw-note">{pin.kwNote}</p>}
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
  const { setBatch, setPushError } = usePush();
  const { rules } = useWorkspace();
  const navigate = useNavigate();
  const [pushing, setPushing] = useState(false);
  const [inlinePushError, setInlinePushError] = useState('');
  // #ad is a reminder, not a gate — the push proceeds and this says what was
  // left unlabelled, so the seller can judge which pins actually needed it.
  const [adNotice, setAdNotice] = useState('');
  const [pushProgress, setPushProgress] = useState('');
  const pushNetworks = useMemo(
    () =>
      run.fanOut === 'pinterest'
        ? ['pinterest']
        : run.fanOut === 'pinterest_facebook'
          ? ['pinterest', 'facebook']
          : ['pinterest', 'facebook', 'instagram'],
    [run.fanOut]
  );
  const staleAccounts = useAccountHealth(pushNetworks, rules.accountByNetwork);
  const product = run.hero !== null ? heroImages(run)[run.hero - 1] : heroImages(run)[0];
  const selectedScene = review.pins[review.pin - 1]?.scene ?? '';
  // What to generate. Off, that is one image per template and pins sharing a
  // template share it; on, it is one per pin. The key is what a card looks its
  // own image up by, so it has to be computed the same way in both places —
  // hence mockupKey().
  const jobs = useMemo<MockupJob[]>(() => {
    if (!run.distinctPerPin) {
      const seen: string[] = [];
      for (const p of review.pins) if (p.scene && !seen.includes(p.scene)) seen.push(p.scene);
      return seen.map((scene) => ({ key: scene, scene }));
    }
    return review.pins
      .map((p, i) => ({ key: `${p.scene}#${i + 1}`, scene: p.scene, variant: String(i + 1) }))
      .filter((j) => j.scene);
  }, [review.pins, run.distinctPerPin]);

  const {
    mockups,
    failure: sceneFailure,
    done: mockupsDone,
    total: mockupsTotal,
  } = useSceneMockups(product, jobs, run.styleDirection);

  const mockupKey = (scene: string, pinNumber: number) =>
    run.distinctPerPin ? `${scene}#${pinNumber}` : scene;
  const mockup = selectedScene ? mockups[mockupKey(selectedScene, review.pin)] : undefined;
  // Crops render from the scene mockup when there is one, else the raw photo.
  const src = mockup ?? product;
  const rendered = useRenderedCrops(src, review.overlay, review.overlayPos, review.overlaySize);
  const flagged = review.pins.filter((p) => p.flagged).length;

  // Facebook turns a bare URL in the body into a clickable link. Instagram does
  // not — captions there are never clickable, whatever they contain — but the
  // address is still visible and copyable, which beats no address at all.
  const captionFor = (pin: { desc: string; link: string }, network: string) => {
    if (network === 'pinterest' || !pin.link.trim()) return pin.desc;
    if (pin.desc.includes(pin.link.trim())) return pin.desc;
    return `${pin.desc}\n\n${pin.link.trim()}`;
  };

  // Build the outgoing batch: one post per approved pin per fanned-out
  // network, each carrying the asset at that network's crop.
  const push = async () => {
    if (pushing) return;
    setPushing(true);
    setInlinePushError('');
    const networkCrop: Record<string, Crop> = {
      pinterest: '2:3',
      facebook: '1:1',
      instagram: '4:5',
    };
    const wanted =
      run.fanOut === 'pinterest'
        ? (['pinterest'] as const)
        : run.fanOut === 'pinterest_facebook'
          ? (['pinterest', 'facebook'] as const)
          : (['pinterest', 'facebook', 'instagram'] as const);

    // The times we push have to be the times the calendar showed. They come
    // from the scheduling engine — the workspace window, the per-network
    // stagger and the daily caps all live there, and none of it can be
    // reconstructed here. Asking for exactly the approved pins is safe: the
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

    // Each pin's OWN crops. This used to read `rendered`, which is the crops of
    // whichever pin happened to be selected — so every post in the batch went
    // out carrying the same picture. Rendering is local sharp work with no API
    // cost, so it is done per pin, here, at the moment of pushing.
    const approvedPins = review.pins
      .map((pin, i) => ({ pin, n: i + 1 }))
      .filter(({ pin }) => pin.approved);

    const assets = new Map<number, Rendered>();
    for (const { pin, n } of approvedPins) {
      setPushProgress(`Preparing assets — ${assets.size + 1} of ${approvedPins.length}…`);
      const source = mockups[mockupKey(pin.scene, n)] ?? product;
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
          }),
        });
        const json = await res.json();
        if (json.ok && json.images) assets.set(n, json.images);
      } catch {
        // Left out of the map; the guard below refuses rather than sending the
        // wrong pin's picture, which is the fault this whole block fixes.
      }
    }
    setPushProgress('');

    const missingAsset = approvedPins.find(({ n }) => !assets.get(n));
    if (missingAsset) {
      setInlinePushError(
        `Could not render the assets for pin ${missingAsset.n}, so nothing was pushed. Try again.`
      );
      setPushing(false);
      return;
    }

    const posts = approvedPins.flatMap(({ pin, n }, i) =>
      wanted.map((network) => ({
        localId: `${runId}#${n}#${network}`,
        network,
        scheduledAt: slots.get(`${i + 1}#${network}`)!,
        // Pinterest carries the destination as a real field on the post, so
        // its caption stays clean. Facebook and Instagram have no such field —
        // the only way a viewer ever sees the link is in the caption text, so
        // it goes on the end there.
        caption: captionFor(pin, network),
        assetUrl: assets.get(n)![networkCrop[network]],
        // The account chosen in Connections. Sent explicitly so a workspace
        // with two accounts on one network never depends on list order.
        ...(rules.accountByNetwork[network]
          ? { accountId: rules.accountByNetwork[network]!.id }
          : {}),
        ...(network === 'pinterest'
          ? {
              pinterest: {
                title: pin.title,
                // The pin's own destination. An upload-based run has no
                // listing to inherit a URL from, so this was empty on every
                // post — a pin nobody could buy from.
                link: pin.link,
                // The board picked once in Connections. Content360 keys it
                // per account, so this is the only destination we supply.
                ...(rules.pinterestBoardId ? { board: rules.pinterestBoardId } : {}),
              },
            }
          : {}),
        ...(network === 'facebook' ? { facebook: { postType: 'post' as const } } : {}),
      }))
    );

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
            {review.approved} approved · {flagged} flagged
          </span>
          <button className="btn btn-secondary" type="button" onClick={() => dispatch({ type: 'approveAll' })}>
            Approve all
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => dispatch({ type: 'rejectAll' })}>
            Clear all
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={pushing || review.approved === 0}
            title={review.approved === 0 ? 'Approve at least one pin first' : undefined}
            onClick={push}
          >
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
      {sceneFailure && <div className="push-error-bar">{sceneFailure}</div>}
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
          <CropPreview src={src} rendered={rendered} hasScene={Boolean(mockup)} />
          <PinGrid
            src={src}
            rendered={rendered}
            networks={networks}
            mockups={mockups}
            product={product}
            mockupKey={mockupKey}
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
