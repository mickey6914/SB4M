import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { requestCopy } from '../../state/copy';
import { assetCount, heroImage, sceneNames, useRun } from '../../state/run';
import { useWorkspace } from '../../state/workspace';

// The stages users read as an explanation of where their money and time go.
// Mockups and crops are simulated here (they are generated on Review, one at
// a time, as they land); the copy row is real — it is the call that writes
// the whole run's titles, description and tags from the hero image.
const MOCKUP_UNTIL = 55;
const CROPS_FROM = 90;

// One copy request per run and hero, even if this screen mounts twice
// (StrictMode, or the seller leaving and coming back while it is in flight).
const inFlight = new Set<string>();

export default function Progress() {
  const { run, dispatch } = useRun();
  const { rules } = useWorkspace();
  const { id } = useParams();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const started = useRef(Date.now());
  const [elapsed, setElapsed] = useState('0 s');

  // Copywriting runs automatically for the whole run. The seller should never
  // have to type a title or a description.
  useEffect(() => {
    if (run.copy.status === 'done' || run.copy.status === 'writing') return;
    const image = heroImage(run);
    const key = `${run.runNumber}|${run.hero ?? 1}`;
    if (inFlight.has(key)) return;
    inFlight.add(key);
    dispatch({ type: 'setCopy', copy: { status: 'writing' } });
    requestCopy({
      image,
      product: run.listing?.description,
      mockup: run.mockup,
      scenes: sceneNames(run),
      styleDirection: run.styleDirection,
      rules,
    }).then((res) => {
      inFlight.delete(key);
      dispatch({
        type: 'setCopy',
        copy: res.ok
          ? { status: 'done', ...res.copy }
          : { status: 'failed', message: res.message },
      });
    });
    // Deliberately once per mount: the inputs are fixed by the time the
    // seller reaches this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writing = run.copy.status === 'writing' || run.copy.status === 'idle';

  // Simulated progress per the prototype (+3 every 140ms), held just short of
  // the end while the copy is still being written.
  useEffect(() => {
    const tick = setInterval(() => {
      setProgress((p) => Math.min(100, p + 3));
      const s = Math.floor((Date.now() - started.current) / 1000);
      setElapsed(s >= 60 ? `${Math.floor(s / 60)} m ${s % 60} s` : `${s} s`);
    }, 140);
    return () => clearInterval(tick);
  }, []);
  const shown = writing ? Math.min(progress, 95) : progress;

  // Auto-route to review 600ms after 100% — and only once the copy has come
  // back (or failed), so the pins arrive with their words on.
  useEffect(() => {
    if (shown >= 100 && !writing) {
      const t = setTimeout(() => navigate(`/review/${id ?? 15}`), 600);
      return () => clearTimeout(t);
    }
  }, [shown, writing, id, navigate]);

  const simulated = (from: number, until: number) =>
    shown >= until ? 'Done' : shown >= from ? 'Working…' : 'Queued';

  const copyState =
    run.copy.status === 'done'
      ? 'Done'
      : run.copy.status === 'failed'
        ? 'Failed'
        : 'Writing…';
  const applyState =
    run.copy.status === 'done'
      ? shown >= CROPS_FROM
        ? 'Done'
        : 'Queued'
      : run.copy.status === 'failed'
        ? 'Skipped'
        : 'Queued';

  const sceneCount = Math.max(1, run.scenes.length);
  const stages = [
    {
      label: `Rendering ${run.mockup.toLowerCase()} mockups in ${sceneCount} scene${sceneCount > 1 ? 's' : ''}`,
      state: simulated(0, MOCKUP_UNTIL),
    },
    { label: 'Writing 3 titles, description + 13 tags', state: copyState },
    { label: `Applying copy to all ${run.volume} pins`, state: applyState },
    { label: 'Cutting 1:1 and 4:5 crops', state: simulated(CROPS_FROM, 100) },
  ];

  return (
    <section className="progress-page">
      <div className="page-kicker">Run {id ?? 15}</div>
      <h1 className="wizard-h1" style={{ fontSize: 44 }}>
        Building {run.volume} pins.
      </h1>
      <p className="page-lead" style={{ maxWidth: '36em', marginBottom: 28 }}>
        {run.volume} pins, {assetCount(run)} assets. You can leave this screen — the run keeps
        going and lands in your review queue when it's done.
      </p>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${shown}%` }} />
      </div>
      <div className="progress-meta">
        <span>{shown}% complete</span>
        <span>{elapsed} elapsed</span>
      </div>
      <div className="stage-list">
        {stages.map(({ label, state }) => (
          <div key={label} className="stage-row">
            <span>{label}</span>
            <span className="stage-state">{state}</span>
          </div>
        ))}
      </div>
      {run.copy.status === 'failed' && (
        <p className="ingest-error" style={{ marginTop: 16 }}>
          {run.copy.message}
        </p>
      )}
      <div className="wizard-footer" style={{ borderTop: 0, paddingTop: 0, marginTop: 36 }}>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/')}>
          Back to dashboard
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => navigate(`/review/${id ?? 15}`)}>
          Skip ahead to review
        </button>
      </div>
    </section>
  );
}
