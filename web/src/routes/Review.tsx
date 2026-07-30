import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePush } from '../state/push';
import { assetCount, CROPS, heroImages, SCENE_CATALOG, useRun, type Crop } from '../state/run';
import {
  CROP_NETWORKS,
  ReviewProvider,
  useReview,
  type OverlayPos,
} from '../state/review';

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

// Hybrid scene mockup: the server generates an empty background for the
// pin's scene and composites the seller's real product photo onto it. The
// product is never sent through a generative model, so it cannot be altered.
// Falls back to the plain product photo whenever a mockup isn't available.
function useSceneMockup(product: string | undefined, scene: string, styleDirection: string) {
  const [mockup, setMockup] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>('');
  useEffect(() => {
    if (!product || !scene) {
      setMockup(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/scenes/mockup', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scene, styleDirection, product }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (json.ok && json.image) {
          setMockup(json.image);
          setProvider(json.provider === 'procedural' ? '' : json.provider);
        } else {
          setMockup(null);
        }
      } catch {
        if (!cancelled) setMockup(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product, scene, styleDirection]);
  return { mockup, provider };
}

// Fetch the four rendered crops whenever the source or overlay changes,
// debounced so typing in the overlay field doesn't re-render per keystroke.
function useRenderedCrops(src: string | undefined, overlay: string, pos: OverlayPos) {
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
          body: JSON.stringify({ src, overlay, overlayPos: pos }),
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
  }, [src, overlay, pos]);
  return images;
}

function CropPreview({ src, rendered }: { src?: string; rendered: Rendered | null }) {
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
          sliced. Scene: {pin.scene} · your product photo is composited unaltered.
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
                  <div className={`crop-overlay crop-overlay-${review.overlayPos}`}>
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
}: {
  src?: string;
  rendered: Rendered | null;
  networks: string[];
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
              {pin.flagged && <span className="pin-flag">Keyword flagged</span>}
              <div className="pin-media" style={{ aspectRatio: CROP_RATIOS[review.crop] }}>
                {cardSrc && <img src={cardSrc} alt="" className="crop-img" />}
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
        <span className="rewrite-note">#ad added by workspace rule.</span>
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
  const navigate = useNavigate();
  const [pushing, setPushing] = useState(false);
  const [inlinePushError, setInlinePushError] = useState('');
  const product = run.hero !== null ? heroImages(run)[run.hero - 1] : heroImages(run)[0];
  const selectedScene = review.pins[review.pin - 1]?.scene ?? '';
  const { mockup } = useSceneMockup(product, selectedScene, run.styleDirection);
  // Crops render from the scene mockup when there is one, else the raw photo.
  const src = mockup ?? product;
  const rendered = useRenderedCrops(src, review.overlay, review.overlayPos);
  const flagged = review.pins.filter((p) => p.flagged).length;

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

    const posts = review.pins.slice(0, review.approved).flatMap((pin, i) =>
      wanted.map((network) => ({
        localId: `${runId}#${i + 1}#${network}`,
        network,
        scheduledAt: new Date(Date.now() + (i + 1) * 86_400_000).toISOString(),
        caption: pin.desc,
        assetUrl: rendered?.[networkCrop[network]] ?? src ?? '',
        ...(network === 'pinterest'
          ? {
              pinterest: {
                title: pin.title,
                link: run.listing?.url ?? '',
              },
            }
          : {}),
        ...(network === 'facebook' ? { facebook: { postType: 'post' as const } } : {}),
      }))
    );

    try {
      const res = await fetch('/api/content360/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId, posts }),
      });
      const json = await res.json();
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
      <div className="review-body">
        <div className="review-left">
          <CropPreview src={src} rendered={rendered} />
          <PinGrid src={src} rendered={rendered} networks={networks} />
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
