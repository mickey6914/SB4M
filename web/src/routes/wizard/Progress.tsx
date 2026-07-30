import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { assetCount, useRun } from '../../state/run';

// The four named stages users read as an explanation of where their money and
// time go. The percentage split is simulation-only; real job checkpoints
// replace it when the queue lands (increment 5), keeping these exact labels.
const STAGES = [
  { label: 'Rendering mockups in 3 scenes', until: 55 },
  { label: 'Writing pin titles', until: 75 },
  { label: 'Drafting SEO descriptions + keywords', until: 90 },
  { label: 'Cutting 1:1 and 4:5 crops', until: 100 },
];

export default function Progress() {
  const { run } = useRun();
  const { id } = useParams();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const started = useRef(Date.now());
  const [elapsed, setElapsed] = useState('0 s');

  // Simulated progress per the prototype (+3 every 140ms, auto-route 600ms
  // after 100%) until real jobs replace it.
  useEffect(() => {
    const tick = setInterval(() => {
      setProgress((p) => Math.min(100, p + 3));
      const s = Math.floor((Date.now() - started.current) / 1000);
      setElapsed(s >= 60 ? `${Math.floor(s / 60)} m ${s % 60} s` : `${s} s`);
    }, 140);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (progress >= 100) {
      const t = setTimeout(() => navigate(`/review/${id ?? 15}`), 600);
      return () => clearTimeout(t);
    }
  }, [progress, id, navigate]);

  const stageState = (i: number) => {
    const start = i === 0 ? 0 : STAGES[i - 1].until;
    if (progress >= STAGES[i].until) return 'Done';
    if (progress >= start) return 'Working…';
    return 'Queued';
  };

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
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="progress-meta">
        <span>{progress}% complete</span>
        <span>{elapsed} elapsed</span>
      </div>
      <div className="stage-list">
        {STAGES.map(({ label }, i) => (
          <div key={label} className="stage-row">
            <span>{label}</span>
            <span className="stage-state">{stageState(i)}</span>
          </div>
        ))}
      </div>
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
