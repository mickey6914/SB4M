import { useNavigate } from 'react-router-dom';
import StepRail from '../../components/StepRail';
import Tile from '../../components/Tile';
import { heroImages, useRun } from '../../state/run';

export default function Hero() {
  const { run, dispatch } = useRun();
  const navigate = useNavigate();
  const images = heroImages(run);

  return (
    <>
      <StepRail current={2} />
      <section style={{ padding: '36px 32px 40px' }}>
        <h1 className="wizard-h1">Pick the hero image.</h1>
        <p className="page-lead" style={{ maxWidth: '40em', marginBottom: 12 }}>
          {images.length > 0
            ? `${images.length === 1 ? 'One image' : `${images.length} images`} came off ${
                run.listing ? 'the listing' : 'your uploads'
              }. Choose the one every mockup builds from — the sharpest, cleanest shot of the product itself.`
            : 'Choose the one image every mockup builds from — the sharpest, cleanest shot of the product itself.'}
        </p>
        {run.listing && (
          <p className="stub-note" style={{ margin: '0 0 24px' }}>
            {run.listing.title}
            {run.listing.price ? ` · ${run.listing.price}` : ''} · pulled from {run.listing.source}
          </p>
        )}
        {images.length === 0 && (
          <p className="ingest-error" style={{ margin: '0 0 24px' }}>
            Nothing came across yet — go back and pull the listing, or drop your own photos.
          </p>
        )}
        <div className="hero-grid">
          {Array.from({ length: 6 }, (_, i) => {
            const n = i + 1;
            const src = images[i];
            return (
              <Tile
                key={n}
                selected={run.hero === n}
                onSelect={src ? () => dispatch({ type: 'setHero', hero: n }) : () => {}}
                aspect="1 / 1"
                media={src ? <img src={src} alt={`Listing image ${n}`} className="tile-img" /> : undefined}
                mediaLabel={`Image ${n}`}
                caption={run.hero === n ? 'Hero' : src ? `Listing ${n}` : '—'}
              />
            );
          })}
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
