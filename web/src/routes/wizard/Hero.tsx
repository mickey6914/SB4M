import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StepRail from '../../components/StepRail';
import Tile from '../../components/Tile';
import { heroImages, useRun } from '../../state/run';

export default function Hero() {
  const { run, dispatch } = useRun();
  const navigate = useNavigate();
  // Only the photos this run actually has: the seller's uploads, or — for a
  // run with none — the pulled listing's images. Empty tiles are not drawn.
  const images = heroImages(run);
  const fromUploads = run.uploads.length > 0;

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
          {fromUploads
            ? 'These are the photos you uploaded. '
            : images.length > 0
              ? `${images.length === 1 ? 'One image' : `${images.length} images`} came off the listing. `
              : ''}
          Choose the one every mockup builds from — the sharpest, cleanest shot of the product itself.
        </p>
        {images.length > 0 && (
          <p className="stub-note" style={{ margin: '0 0 24px' }}>
            Only one photo? It's already selected. The copy is written from this image too.
          </p>
        )}
        {!fromUploads && run.listing && (
          <p className="stub-note" style={{ margin: '0 0 24px' }}>
            {run.listing.title}
            {run.listing.price ? ` · ${run.listing.price}` : ''} · pulled from {run.listing.source}
          </p>
        )}
        {images.length === 0 && (
          <p className="ingest-error" style={{ margin: '0 0 24px' }}>
            Nothing came across yet — go back and drop your own photos, or pull the listing.
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
