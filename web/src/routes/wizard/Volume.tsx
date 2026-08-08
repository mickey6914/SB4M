import { useNavigate } from 'react-router-dom';
import StepRail from '../../components/StepRail';
import { assetCount, CROPS, useRun, type Crop, type FanOut, type Volume as Vol } from '../../state/run';

const VOLUMES: { value: Vol; label: string; timing: string }[] = [
  { value: 3, label: 'Quick test', timing: '~20 seconds' },
  { value: 7, label: 'One week', timing: '~40 seconds' },
  { value: 30, label: 'One month', timing: '~1 m 50 s' },
];

// Measured, not guessed: Abacus bills image work in compute points, and the
// seller's own credit log put 20 points to the credit — about 168 credits for
// a standard mockup and 337 on the pro model. Rounded to 170 here because the
// number is a guide for a decision, not an invoice.
const CREDITS_PER_MOCKUP = 170;
const SECONDS_PER_MOCKUP = 8;

function mockupCredits(images: number): string {
  return (images * CREDITS_PER_MOCKUP).toLocaleString();
}

function mockupMinutes(images: number): string {
  const secs = images * SECONDS_PER_MOCKUP;
  if (secs < 90) return `${secs} seconds`;
  return `${Math.round(secs / 60)} minutes`;
}

const SUGGESTIONS = ['No people', 'Minimalist white', 'Fall colours', 'Bright & airy', 'Holiday'];

const FAN_OUT: { value: FanOut; label: string }[] = [
  { value: 'pinterest', label: 'Pinterest only' },
  { value: 'pinterest_facebook', label: 'Pinterest + Facebook' },
  { value: 'all', label: 'All three networks' },
];

const CROP_LABELS: Record<Crop, string> = {
  '2:3': '2:3 — Pinterest pin',
  '1:1': '1:1 — Facebook post',
  '4:5': '4:5 — Instagram feed',
  '9:16': '9:16 — story / reel',
};

export default function Volume() {
  const { run, dispatch } = useRun();
  const navigate = useNavigate();

  const appendSuggestion = (tag: string) => {
    const current = run.styleDirection.trim();
    if (current.toLowerCase().includes(tag.toLowerCase())) return;
    dispatch({ type: 'setStyleDirection', text: current ? `${current}, ${tag.toLowerCase()}` : tag });
  };

  return (
    <>
      <StepRail current={3} />
      <section className="wizard-cols">
        <div>
          <h1 className="wizard-h1">How many pins?</h1>
          <p className="page-lead" style={{ maxWidth: '36em' }}>
            Thirty covers a month at one pin a day. Three is the cheap way to sanity-check a new
            product before committing.
          </p>
          <div className="vol-grid">
            {VOLUMES.map(({ value, label, timing }) => (
              <div
                key={value}
                className={run.volume === value ? 'vol-card selected' : 'vol-card'}
                onClick={() => dispatch({ type: 'setVolume', volume: value })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    dispatch({ type: 'setVolume', volume: value });
                  }
                }}
              >
                <div className="vol-figure">{value}</div>
                <div className="vol-label">{label}</div>
                <div className="vol-timing">{timing}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 32, maxWidth: 700 }}>
            <div className="rail-kicker" style={{ marginBottom: 10 }}>
              Mockup images
            </div>
            <label className="choice-row">
              <input
                type="checkbox"
                checked={run.distinctPerPin}
                onChange={(e) => dispatch({ type: 'setDistinctPerPin', on: e.target.checked })}
              />
              A different mockup for every pin
            </label>
            <div className="rail-note" style={{ marginTop: 6 }}>
              {run.distinctPerPin ? (
                <>
                  {run.volume} images, about {mockupCredits(run.volume)} Abacus credits, and roughly{' '}
                  {mockupMinutes(run.volume)} to generate. Every pin is a different picture.
                </>
              ) : (
                <>
                  {Math.max(1, run.scenes.length)} image
                  {run.scenes.length === 1 ? '' : 's'}, about{' '}
                  {mockupCredits(Math.max(1, run.scenes.length))} credits — but pins sharing a
                  template get the <strong>identical</strong> picture, and Pinterest treats repeated
                  images as spam. Fine for a quick test, risky for a month's schedule.
                </>
              )}
            </div>
          </div>
          <div style={{ marginTop: 32, maxWidth: 700 }}>
            <div className="rail-kicker" style={{ marginBottom: 10 }}>
              Style direction — optional
            </div>
            <input
              className="input"
              type="text"
              value={run.styleDirection}
              onChange={(e) => dispatch({ type: 'setStyleDirection', text: e.target.value })}
              placeholder="e.g. warm fall colours, no people"
              style={{ width: '100%', fontSize: '14.5px' }}
            />
            <div className="tag-row">
              {SUGGESTIONS.map((tag) => (
                <button key={tag} type="button" className="tag tag-outline tag-button" onClick={() => appendSuggestion(tag)}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="rail-right">
          <div className="rail-kicker">Fan-out</div>
          <div className="choice-list">
            {FAN_OUT.map(({ value, label }) => (
              <label key={value} className="choice-row">
                <input
                  type="radio"
                  name="fanout"
                  checked={run.fanOut === value}
                  onChange={() => dispatch({ type: 'setFanOut', fanOut: value })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="rail-kicker" style={{ margin: '24px 0 12px' }}>
            Crops to render
          </div>
          <div className="choice-list">
            {CROPS.map((crop) => (
              <label key={crop} className="choice-row">
                <input
                  type="checkbox"
                  checked={run.crops[crop]}
                  onChange={() => dispatch({ type: 'toggleCrop', crop })}
                />
                {CROP_LABELS[crop]}
              </label>
            ))}
          </div>
          <div className="rail-note">
            {assetCount(run)} assets in this run. Overlay text is re-placed for each crop, not
            sliced.
          </div>
        </div>
      </section>
      <div className="wizard-footer" style={{ padding: '0 32px 40px', borderTop: 0, marginTop: 0 }}>
        <button className="btn btn-primary" type="button" onClick={() => navigate('/run/scenes')}>
          Continue
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/run/hero')}>
          Back
        </button>
      </div>
    </>
  );
}
