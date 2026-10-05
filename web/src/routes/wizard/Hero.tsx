import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StepRail from '../../components/StepRail';
import Tile from '../../components/Tile';
import { heroImages, useRun } from '../../state/run';

export default function Hero() {
  const { run, dispatch } = useRun();
  const navigate = useNavigate();
  // Only the photos the seller uploaded. Empty tiles are not drawn.
  const images = heroImages(run);

  // Photo 1 is preselected, so a one-photo run is a single click to Continue.
  useEffect(() => {
    if (images.length > 0 && (run.hero === null || run.hero > images.length)) {
      dispatch({ type: 'setHero', hero: 1 });
    }
  }, [images.length, run.hero, dispatch]);

  return (
    <>
      <StepRail current={2} />
      <section style={{ padding: '36px 32px 40px' }}>
        <h1 className="wizard-h1">Pick the hero image.</h1>
        <p className="page-lead" style={{ maxWidth: '40em', marginBottom: 12 }}>
          {images.length > 0 ? 'These are the photos you uploaded. ' : ''}
          Choose the one every mockup builds from — the sharpest, cleanest shot of the product itself.
        </p>
        {images.length > 0 && (
          <p className="stub-note" style={{ margin: '0 0 24px' }}>
            Only one photo? It's already selected. The copy is written from this image too.
          </p>
        )}
        {images.length === 0 && (
          <p className="ingest-error" style={{ margin: '0 0 24px' }}>
            No photos yet — go back and drop at least one product photo into the upload tiles.
          </p>
        )}
        <div className="hero-grid hero-grid-uploads">
          {images.map((src, i) => {
            const n = i + 1;
            return (
              <Tile
                key={n}
                selected={run.hero === n}
                onSelect={() => dispatch({ type: 'setHero', hero: n })}
                aspect="1 / 1"
                media={<img src={src} alt={`Photo ${n}`} className="tile-img" />}
                mediaLabel={`Photo ${n}`}
                caption={run.hero === n ? 'Hero' : `Photo ${n}`}
              />
            );
          })}
        </div>
        <div className="wizard-footer">
          <button
            className="btn btn-primary"
            type="button"
            disabled={run.hero === null || images.length === 0}
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
