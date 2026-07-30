import { useNavigate } from 'react-router-dom';
import StepRail from '../../components/StepRail';
import Tile from '../../components/Tile';
import { assetCount, SCENE_CATALOG, useRun } from '../../state/run';

export default function Scenes() {
  const { run, dispatch } = useRun();
  const navigate = useNavigate();

  // "Surprise me": three distinct random scenes from the catalog.
  const surprise = () => {
    const ids = SCENE_CATALOG.map((_, i) => i + 1);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    dispatch({ type: 'setScenes', scenes: ids.slice(0, 3) });
  };

  return (
    <>
      <StepRail current={4} />
      <section style={{ padding: '36px 32px 40px' }}>
        <div className="scenes-header">
          <div>
            <h1 className="wizard-h1">Choose three scenes.</h1>
            <p className="page-lead" style={{ maxWidth: '40em', margin: 0 }}>
              These are the aesthetics the AI copies — not the product. Three is the sweet spot:
              enough variety for thirty pins, tight enough to look like one brand.
            </p>
          </div>
          <div className="scenes-header-actions">
            <button className="btn btn-secondary" type="button" onClick={surprise}>
              Surprise me
            </button>
            <button className="btn btn-ghost" type="button" disabled title="Needs the full scene catalog — deferred">
              Show 50 more
            </button>
          </div>
        </div>
        <div className="scene-grid">
          {SCENE_CATALOG.map((caption, i) => {
            const id = i + 1;
            return (
              <Tile
                key={id}
                selected={run.scenes.includes(id)}
                onSelect={() => dispatch({ type: 'toggleScene', scene: id })}
                aspect="4 / 3"
                mediaLabel={caption}
                caption={caption}
              />
            );
          })}
        </div>
        <div className="wizard-footer">
          <button className="btn btn-primary" type="button" onClick={() => navigate('/run/15/progress')}>
            Generate pins
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => navigate('/run/volume')}>
            Back
          </button>
          <span className="wizard-status">
            {run.scenes.length} of 3 scenes chosen · {run.volume} pins · {assetCount(run)} assets
          </span>
        </div>
      </section>
    </>
  );
}
