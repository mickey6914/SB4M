import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import StepRail from '../../components/StepRail';
import { ImageIcon } from '../../components/icons';
import { useRun } from '../../state/run';

// Recent links are illustrative until the server owns run history.
const RECENT = [
  { name: 'Ceramic mug gift set', meta: 'etsy.com · run 14 · 30 pins' },
  { name: 'Printable wall art bundle', meta: 'etsy.com · run 13 · 30 pins' },
  { name: 'Linen table runner', meta: 'shopify · run 12 · 7 pins' },
];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Sellers upload print-resolution art — 300 DPI files run to tens of megabytes,
// and base64 adds a third on top. Sent whole, they exceeded the server's body
// limit and every scene mockup failed with "Request body is too large" before
// the scene code ran at all. Raising the limit would only move the failure to
// memory on a small instance.
//
// So shrink here, where the pixels already are. The longest edge is capped at
// a size comfortably above what any crop needs (the biggest is a 1080×1920
// story), and PNG is preserved when the source is PNG — clipart carries
// transparency, and flattening it to JPEG would put a white box behind a
// cut-out product.
const MAX_EDGE = 2048;

async function downscale(file: File): Promise<string> {
  const original = await readAsDataUrl(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = original;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (longest <= MAX_EDGE) return original;

    const ratio = MAX_EDGE / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * ratio);
    canvas.height = Math.round(img.naturalHeight * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const keepsAlpha = file.type === 'image/png' || file.type === 'image/webp';
    return canvas.toDataURL(keepsAlpha ? 'image/png' : 'image/jpeg', 0.92);
  } catch {
    // A file the browser cannot decode is the server's problem to report, not
    // something to drop silently here.
    return original;
  }
}

export default function Product() {
  const { run, dispatch } = useRun();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const images = await Promise.all(
      Array.from(files)
        .filter((f) => f.type.startsWith('image/'))
        .slice(0, 6)
        .map(downscale)
    );
    if (images.length) dispatch({ type: 'addUploads', uploads: images });
  };

  return (
    <>
      <StepRail current={1} />
      <section className="wizard-cols" style={{ padding: '40px 32px' }}>
        <div>
          <h1 className="wizard-h1">Where's the product?</h1>
          <p className="page-lead" style={{ maxWidth: '36em' }}>
            Drop your product photos, and paste the listing link pins should send buyers to. One
            product per run — that keeps the pins about one thing.
          </p>
          {/* The link is the pins' destination, not a source of images. The app
              used to fetch it for photos, but Etsy blocks requests from servers
              like ours, so every pull ended in "The site blocked the request".
              Nothing is fetched from it now. */}
          <div className="field-label" style={{ marginBottom: 6 }}>
            Etsy listing link — where pins send buyers
          </div>
          <input
            className="input"
            type="url"
            value={run.link}
            onChange={(e) => dispatch({ type: 'setLink', link: e.target.value })}
            placeholder="https://www.etsy.com/listing/…"
            style={{ width: '100%', maxWidth: 700, fontSize: '14.5px' }}
          />
          <p className="rail-note" style={{ marginTop: 6, maxWidth: 700 }}>
            Pinterest uses it as each pin's destination; Facebook and Instagram add it to the end of
            the caption. Without it, buyers have no way to click through.
          </p>
          <div className="or-divider">
            <span className="or-divider-rule" />
            <span className="or-divider-label">product photos</span>
            <span className="or-divider-rule" />
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="upload-grid">
            {[0, 1, 2].map((i) => {
              const img = run.uploads[i];
              return (
                <div
                  key={i}
                  className={img ? 'upload-zone filled' : 'upload-zone'}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    addFiles(e.dataTransfer.files);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {img ? (
                    <img src={img} alt={`Uploaded photo ${i + 1}`} />
                  ) : (
                    <>
                      <ImageIcon size={24} />
                      <span>Drop a product photo</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="upload-continue">
            <button
              className="btn btn-primary"
              type="button"
              disabled={run.uploads.length === 0}
              title={run.uploads.length === 0 ? 'Drop a product photo first' : undefined}
              onClick={() => navigate('/run/hero')}
            >
              Continue with uploaded photos
            </button>
            <span className="upload-continue-note">Next: pick the hero image</span>
          </div>
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
