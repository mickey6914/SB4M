import { useNavigate } from 'react-router-dom';
import StepRail from '../../components/StepRail';
import Tile from '../../components/Tile';
import { useRun } from '../../state/run';

export default function Hero() {
  const { run, dispatch } = useRun();
  const navigate = useNavigate();

  return (
    <>
      <StepRail current={2} />
      <section style={{ padding: '36px 32px 40px' }}>
        <h1 className="wizard-h1">Pick the hero image.</h1>
        <p className="page-lead" style={{ maxWidth: '40em', marginBottom: 12 }}>
          Six images came off the listing. Choose the one every mockup builds from — the sharpest,
          cleanest shot of the product itself.
        </p>
        <p className="stub-note" style={{ margin: '0 0 24px' }}>
          These tiles show the images pulled from the listing once ingestion lands in increment 3.
        </p>
        <div className="hero-grid">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Tile
              key={n}
              selected={run.hero === n}
              onSelect={() => dispatch({ type: 'setHero', hero: n })}
              aspect="1 / 1"
              mediaLabel={`Image ${n}`}
              caption={run.hero === n ? 'Hero' : `Listing ${n}`}
            />
          ))}
        </div>
        <div className="wizard-footer">
          <button
            className="btn btn-primary"
            type="button"
            disabled={run.hero === null}
            onClick={() => navigate('/run/volume')}
          >
            Continue
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => navigate('/run/product')}>
            Back
          </button>
        </div>
      </section>
    </>
  );
}
