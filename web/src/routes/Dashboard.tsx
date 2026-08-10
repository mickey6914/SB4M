import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightIcon, CheckIcon } from '../components/icons';
import { assetCount, heroImages, useRun, type FanOut } from '../state/run';
import { usePush } from '../state/push';

// Dashboard home, README section 1: run starter, stat row, the alert /
// confirmation band, "Waiting on you" with the Content360 sync table, and the
// week strip. Counts come from live state; the sync table reflects the real
// push result (increment 7).

const FAN_OUT: { value: FanOut; label: string }[] = [
  { value: 'pinterest', label: 'Pinterest only' },
  { value: 'pinterest_facebook', label: 'Pinterest + Facebook' },
  { value: 'all', label: 'All three networks' },
];

const STATE_TAG: Record<string, string> = {
  queued: 'tag tag-neutral',
  pushed: 'tag tag-neutral',
  published: 'tag tag-neutral',
  failed: 'tag tag-accent',
};

export default function Dashboard() {
  const { run, dispatch } = useRun();
  const { batch, setBatch, pushError } = usePush();
  const navigate = useNavigate();
  const [link, setLink] = useState(run.link);
  const [retrying, setRetrying] = useState(false);

  const hasRun = heroImages(run).length > 0;
  const productTitle = run.listing?.title ?? 'your uploads';

  const start = () => {
    dispatch({ type: 'setLink', link });
    navigate('/run/product');
  };

  const retryFailed = async () => {
    if (!batch || retrying) return;
    setRetrying(true);
    try {
      const res = await fetch('/api/content360/retry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batchId: batch.id, posts: [] }),
      });
      const json = await res.json();
      if (json.ok && json.batch) setBatch(json.batch);
    } catch {
      // The inline message below already covers a failed retry.
    } finally {
      setRetrying(false);
    }
  };

  // Distinct failure reasons with counts. One expired token can fail every
  // post in a batch; listing thirty identical lines would bury the one fact
  // that matters.
  const failureReasons = (() => {
    if (!batch) return [] as { reason: string; count: number }[];
    const counts = new Map<string, number>();
    for (const post of batch.posts) {
      if (post.state !== 'failed') continue;
      const reason = post.error?.trim() || 'Content360 did not say why.';
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  })();

  const byNetwork = batch
    ? (['pinterest', 'facebook', 'instagram'] as const)
        .map((network) => {
          const posts = batch.posts.filter((p) => p.network === network);
          if (posts.length === 0) return null;
          const failed = posts.filter((p) => p.state === 'failed').length;
          const state = failed > 0 ? 'failed' : posts[0].state;
          return { network, count: posts.length, state, failed };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
    : [];

  return (
    <>
      <section className="dash-starter">
        <div>
          <div className="page-kicker">Step one of one</div>
          <h1 className="dash-h1">Paste a product link.</h1>
          <p className="page-lead" style={{ maxWidth: '38em' }}>
            Etsy, Shopify or Amazon. Pin-Post Studio pulls the listing images, then asks you four
            short questions — nothing else on this screen needs you today.
          </p>
          <div className="link-row" style={{ maxWidth: 720 }}>
            <input
              className="input"
              type="text"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Paste an Etsy, Shopify or Amazon product link"
              style={{ flex: 1, fontSize: '14.5px' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') start();
              }}
            />
            <button className="btn btn-primary" type="button" style={{ gap: 10 }} onClick={start}>
              Generate pins
              <ArrowRightIcon />
            </button>
          </div>
          <div className="dash-meta">
            <span>or drop an image</span>
            <span className="dash-meta-rule" />
            <span>
              {hasRun ? `this run: ${run.volume} pins · ${assetCount(run)} assets` : 'no run yet'}
            </span>
          </div>
        </div>
        <div className="rail-right">
          <div className="rail-kicker">Fan-out pattern</div>
          <div className="choice-list">
            {FAN_OUT.map(({ value, label }) => (
              <label key={value} className="choice-row">
                <input
                  type="radio"
                  name="dash-fanout"
                  checked={run.fanOut === value}
                  onChange={() => dispatch({ type: 'setFanOut', fanOut: value })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="rail-note">
            Sets the default for every pin in the run. Fanned-out posts are re-cropped 1:1, 4:5 and
            9:16 from the same mockup.
          </div>
          <div className="dash-rule-block">
            <div className="dash-rule-title">Workspace rule active</div>
            <div className="rail-note" style={{ marginTop: 4 }}>
              #ad is added to every affiliate description automatically, and a push is blocked
              without it.
            </div>
          </div>
        </div>
      </section>

      <section className="dash-stats">
        <div className="dash-stat">
          <div className="page-kicker">Pins this run</div>
          <div className="dash-figure">{hasRun ? run.volume : 0}</div>
          <div className="dash-sub">{hasRun ? productTitle : 'from no product links yet'}</div>
        </div>
        <div className="dash-stat">
          <div className="page-kicker">Scheduled</div>
          <div className="dash-figure">{batch ? batch.posts.length : 0}</div>
          <div className="dash-sub">
            across{' '}
            {run.fanOut === 'all' ? 3 : run.fanOut === 'pinterest_facebook' ? 2 : 1} networks
          </div>
        </div>
        <div className="dash-stat">
          <div className="page-kicker">Pushed</div>
          <div className="dash-figure">{batch ? batch.counts.pushed + batch.counts.published : 0}</div>
          <div className="dash-sub">
            {batch && batch.counts.failed > 0 ? `${batch.counts.failed} failed` : 'none failed'}
          </div>
        </div>
        <div className="dash-stat">
          <div className="page-kicker">Assets rendered</div>
          <div className="dash-figure" style={{ color: 'var(--color-accent-700)' }}>
            {hasRun ? assetCount(run) : 0}
          </div>
          <div className="dash-sub">2:3 · 1:1 · 4:5 · 9:16</div>
        </div>
      </section>

      {batch && batch.counts.failed === 0 && (
        <div className="band band-confirm">
          <div className="band-message">
            <CheckIcon size={18} />
            Run {batch.runId} pushed to Content360 — {batch.posts.length} posts queued across your
            networks.
          </div>
          <button className="btn band-btn-light" type="button" onClick={() => navigate('/calendar')}>
            See the calendar
          </button>
        </div>
      )}

      {pushError && (
        <div className="band band-alert">
          <div className="band-message">{pushError}</div>
          <button className="btn band-btn-light" type="button" onClick={() => navigate('/review/15')}>
            Back to review
          </button>
        </div>
      )}

      <section className="dash-section">
        <div className="dash-section-head">
          <h2 className="dash-h2">Waiting on you</h2>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate('/review/15');
            }}
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            Open review queue
          </a>
        </div>
        <div className="dash-cards">
          <div className="dash-card">
            <div className="dash-card-head">
              <div>
                <div className="page-kicker">
                  {hasRun ? `Run 15 · ${productTitle}` : 'No run yet'}
                </div>
                <div className="dash-card-title">
                  {hasRun ? `${run.volume} pins ready` : 'Paste a link to start'}
                </div>
                <div className="rail-note" style={{ marginTop: 3 }}>
                  {assetCount(run)} assets · 2:3 · 1:1 · 4:5 · 9:16
                </div>
              </div>
              {hasRun && <span className="tag tag-accent">Needs review</span>}
            </div>
            <div className="dash-actions">
              <button
                className="btn btn-primary"
                type="button"
                disabled={!hasRun}
                onClick={() => navigate('/review/15')}
              >
                Review {run.volume} pins
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => navigate('/run/product')}>
                New run
              </button>
            </div>
          </div>

          <div className="dash-card">
            <div className="page-kicker" style={{ marginBottom: 14 }}>
              Content360 sync
            </div>
            {batch ? (
              <>
                <table className="table" style={{ fontSize: 13, width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Batch</th>
                      <th style={{ textAlign: 'left' }}>Network</th>
                      <th style={{ textAlign: 'left' }}>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byNetwork.map((row) => (
                      <tr key={row.network}>
                        <td>
                          Run {batch.runId} · {row.count} posts
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>{row.network}</td>
                        <td>
                          <span className={STATE_TAG[row.state]}>
                            {row.state === 'failed'
                              ? `Failed ${row.failed}`
                              : row.state[0].toUpperCase() + row.state.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Why a post failed, not just that it did. The reason has
                    always been carried on the post — the push records it and
                    the sync refreshes it from Content360 — and was then never
                    shown, so the only way to learn that a token had expired was
                    to go and read Content360's own dashboard. Grouped, because
                    thirty posts failing for one reason is one problem. */}
                {failureReasons.length > 0 && (
                  <div className="dash-failures">
                    {failureReasons.map(({ reason, count }) => (
                      <div key={reason} className="dash-failure">
                        <span className="dash-failure-count">{count}</span>
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="rail-note" style={{ marginTop: 14 }}>
                  {batch.counts.failed > 0
                    ? 'Failed posts stay in this batch — fix the cause above, then Retry failed.'
                    : 'Content360 owns publishing from here; states update as it publishes.'}
                </div>
              </>
            ) : (
              <div className="rail-note" style={{ marginTop: 0 }}>
                Nothing pushed yet. Approve pins in review, then use Push to Content360 — the batch
                and its per-post state appear here.
              </div>
            )}
            <div className="dash-actions" style={{ marginTop: 'auto', paddingTop: 16 }}>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={!batch || batch.counts.failed === 0 || retrying}
                onClick={retryFailed}
              >
                {retrying ? 'Retrying…' : 'Retry failed'}
              </button>
              <a
                className="btn btn-ghost"
                href="https://app.content360.io/os/34b00c5d-265d-4c55-92b7-ebbc57669d39"
                target="_blank"
                rel="noreferrer"
              >
                Open in Content360
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
