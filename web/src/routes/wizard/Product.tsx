import { useNavigate } from 'react-router-dom';
import StepRail from '../../components/StepRail';
import { ImageIcon } from '../../components/icons';
import { useRun } from '../../state/run';

// Recent links are illustrative until the server owns run history (increment 3+).
const RECENT = [
  { name: 'Ceramic mug gift set', meta: 'etsy.com · run 14 · 30 pins' },
  { name: 'Printable wall art bundle', meta: 'etsy.com · run 13 · 30 pins' },
  { name: 'Linen table runner', meta: 'shopify · run 12 · 7 pins' },
];

export default function Product() {
  const { run, dispatch } = useRun();
  const navigate = useNavigate();

  return (
    <>
      <StepRail current={1} />
      <section className="wizard-cols" style={{ padding: '40px 32px' }}>
        <div>
          <h1 className="wizard-h1">Where's the product?</h1>
          <p className="page-lead" style={{ maxWidth: '36em' }}>
            Paste the listing link and every image on it comes across. One link per run — that
            keeps the pins about one product.
          </p>
          <div className="link-row">
            <input
              className="input"
              type="text"
              value={run.link}
              onChange={(e) => dispatch({ type: 'setLink', link: e.target.value })}
              placeholder="Paste an Etsy, Shopify or Amazon product link"
              style={{ flex: 1, fontSize: '14.5px' }}
            />
            <button className="btn btn-primary" type="button" onClick={() => navigate('/run/hero')}>
              Pull images
            </button>
          </div>
          <div className="or-divider">
            <span className="or-divider-rule" />
            <span className="or-divider-label">or upload</span>
            <span className="or-divider-rule" />
          </div>
          <div className="upload-grid">
            {[1, 2, 3].map((n) => (
              <div key={n} className="upload-zone">
                <ImageIcon size={24} />
                <span>Drop a product photo</span>
              </div>
            ))}
          </div>
          <p className="stub-note">
            Listing ingestion arrives in increment 3 — the link and uploads are stubbed for now.
          </p>
        </div>
        <div className="rail-right">
          <div className="rail-kicker">Recent links</div>
          <div>
            {RECENT.map((r) => (
              <div key={r.name} className="recent-row">
                <div className="recent-name">{r.name}</div>
                <div className="recent-meta">{r.meta}</div>
              </div>
            ))}
          </div>
          <button
            className="btn btn-ghost"
            type="button"
            style={{ marginTop: 18 }}
            onClick={() => {
              dispatch({ type: 'reset' });
              navigate('/');
            }}
          >
            Cancel run
          </button>
        </div>
      </section>
    </>
  );
}
