import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { assetCount, heroImages, SCENE_CATALOG, useRun } from '../state/run';
import { usePush } from '../state/push';

// Library, README section 9: past runs, with duplicating a run reusing its
// scenes and style direction. Rows come from real state — the run in progress
// plus any batch already pushed — rather than invented history. Persistent
// history across sessions arrives with the database.

type ServerBatch = {
  id: string;
  runId: string;
  pushedAt: string;
  counts: Record<string, number>;
  posts: { network: string; state: string }[];
};

export default function Library() {
  const { run, dispatch } = useRun();
  const { batch } = usePush();
  const navigate = useNavigate();
  const [batches, setBatches] = useState<ServerBatch[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/content360/batches');
        const json = await res.json();
        if (json.ok) setBatches(json.batches ?? []);
      } catch {
        // An unreachable server just means no pushed history to show.
      }
    })();
  }, [batch]);

  const hasRun = heroImages(run).length > 0;
  const productTitle = run.listing?.title ?? 'Uploaded product';
  const networksLabel =
    run.fanOut === 'pinterest'
      ? 'Pinterest'
      : run.fanOut === 'pinterest_facebook'
        ? 'Pinterest · Facebook'
        : 'Pinterest · Facebook · Instagram';

  // Duplicating reuses the scenes and style direction, per the spec — the
  // point is to skip re-deciding the look for a new product.
  const duplicate = () => {
    dispatch({ type: 'setLink', link: '' });
    navigate('/run/product');
  };

  const pushedRow = batches[0];

  return (
    <section className="page" style={{ padding: '28px 32px 40px' }}>
      <h1 className="calendar-h1">Library</h1>
      <p className="page-lead" style={{ maxWidth: '44em' }}>
        Past runs. Duplicating a run reuses its scenes and style direction, so a new product starts
        with the look you already settled on.
      </p>

      {!hasRun && batches.length === 0 ? (
        <div className="library-empty">
          <div className="rail-note" style={{ margin: 0 }}>
            No runs yet. Once you start one it appears here, and stays available to duplicate.
          </div>
          <button
            className="btn btn-primary"
            type="button"
            style={{ marginTop: 14 }}
            onClick={() => navigate('/run/product')}
          >
            Start a run
          </button>
        </div>
      ) : (
        <table className="table" style={{ fontSize: '13.5px', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Run</th>
              <th style={{ textAlign: 'left' }}>Product</th>
              <th style={{ textAlign: 'left' }}>Pins</th>
              <th style={{ textAlign: 'left' }}>Networks</th>
              <th style={{ textAlign: 'left' }}>State</th>
              <th style={{ textAlign: 'left' }} />
            </tr>
          </thead>
          <tbody>
            {hasRun && (
              <tr>
                <td>Run 15</td>
                <td>{productTitle}</td>
                <td>
                  {run.volume} · {assetCount(run)} assets
                </td>
                <td>{networksLabel}</td>
                <td>
                  <span className={batch ? 'tag tag-neutral' : 'tag tag-accent'}>
                    {batch ? 'Pushed' : 'In review'}
                  </span>
                </td>
                <td>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/review/15');
                    }}
                  >
                    Open
                  </a>
                  {' · '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/calendar');
                    }}
                  >
                    Calendar
                  </a>
                  {' · '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      duplicate();
                    }}
                  >
                    Duplicate
                  </a>
                </td>
              </tr>
            )}
            {pushedRow && !hasRun && (
              <tr>
                <td>Run {pushedRow.runId}</td>
                <td>Pushed batch</td>
                <td>{pushedRow.posts.length} posts</td>
                <td>
                  {[...new Set(pushedRow.posts.map((p) => p.network))]
                    .map((n) => n[0].toUpperCase() + n.slice(1))
                    .join(' · ')}
                </td>
                <td>
                  <span className={pushedRow.counts.failed ? 'tag tag-accent' : 'tag tag-neutral'}>
                    {pushedRow.counts.failed ? `Failed ${pushedRow.counts.failed}` : 'Pushed'}
                  </span>
                </td>
                <td>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/calendar');
                    }}
                  >
                    Calendar
                  </a>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <p className="rail-note" style={{ marginTop: 18, maxWidth: '44em' }}>
        Runs are held for this session. History that survives a restart arrives with the database —
        the same change that lets several runs sit side by side here.
      </p>

      {run.scenes.length > 0 && (
        <div className="library-recipe">
          <div className="rail-kicker">This run's recipe — what Duplicate reuses</div>
          <div className="rail-note" style={{ marginTop: 0 }}>
            Scenes: {run.scenes.map((s) => SCENE_CATALOG[s - 1]).join(' · ')}
            {run.styleDirection ? ` — style: ${run.styleDirection}` : ''}
          </div>
        </div>
      )}
    </section>
  );
}
