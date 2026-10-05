import { useNavigate } from 'react-router-dom';
import StepRail from '../../components/StepRail';
import Tile from '../../components/Tile';
import { assetCount, MAX_MOCKUPS, MOCKUP_CATALOG, useRun } from '../../state/run';

// Step 4: what the design goes on. Up to three mockup types; pins take them in
// turn. Each AI mockup carries its own setting, so there is no separate scene
// choice — that competed with the mockup's own room and made the result
// unpredictable. The look is steered by Style direction on the previous step.
export default function Scenes() {
  const { run, dispatch } = useRun();
  const navigate = useNavigate();

  // "Surprise me": three distinct random mockup types.
  const surprise = () => {
    const pool = [...MOCKUP_CATALOG];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    dispatch({ type: 'setMockups', mockups: pool.slice(0, MAX_MOCKUPS) });
  };

  return (
    <>
      <StepRail current={4} />
      <section style={{ padding: '36px 32px 40px' }}>
        <div className="scenes-header">
          <div>
            <h1 className="wizard-h1">Choose up to three mockups.</h1>
            <p className="page-lead" style={{ maxWidth: '40em', margin: 0 }}>
              What the design goes on. Pins take them in turn — pin 1 the first, pin 2 the second,
              and round again. Basic marketing (your artwork with the pin's title underneath) and
              Unframed wall art are made exactly from your file, with no AI.
            </p>
          </div>
          <div className="scenes-header-actions">
            <button className="btn btn-secondary" type="button" onClick={surprise}>
              Surprise me
            </button>
          </div>
        </div>
        <div className="mockup-grid">
          {MOCKUP_CATALOG.map((label) => {
            const order = run.mockups.indexOf(label);
            return (
              <Tile
                key={label}
                selected={order >= 0}
                onSelect={() => dispatch({ type: 'toggleMockup', mockup: label })}
                aspect="4 / 3"
                mediaLabel={label}
                caption={order >= 0 ? `${order + 1} · ${label}` : label}
              />
            );
          })}
        </div>
        <div className="wizard-footer">
          <button
            className="btn btn-primary"
            type="button"
            disabled={run.mockups.length === 0}
            title={run.mockups.length === 0 ? 'Pick at least one mockup first' : undefined}
            onClick={() => navigate('/run/15/progress')}
          >
            Generate pins
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => navigate('/run/volume')}>
            Back
          </button>
          <span className="wizard-status">
            {run.mockups.length === 0
              ? 'Pick at least one mockup'
              : `${run.mockups.join(' · ')} · ${run.mockups.length} of ${MAX_MOCKUPS} chosen`}{' '}
            · {run.volume} pins · {assetCount(run)} assets
          </span>
        </div>
      </section>
    </>
  );
}
