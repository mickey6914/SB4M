import sharp from 'sharp';

// The differentiator: every fanned-out asset is re-cropped from the same
// mockup with the text overlay RE-PLACED per ratio, never sliced. The source
// image is cover-cropped to each network's native size, then the overlay bar
// is composited at the chosen anchor at that ratio's own scale.

export const CROP_SIZES = {
  '2:3': { width: 1000, height: 1500 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
} as const;

export type CropRatio = keyof typeof CROP_SIZES;
export type OverlayPos = 'top' | 'middle' | 'bottom';

export const ACCENT = '#ec3013';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Bar height as a fraction of the crop's width, so the band reads the same at
// every ratio. Raised from 0.085 after the first real run: the old bar was
// legible at full size but vanished in a Pinterest feed, which is where pins
// are actually seen — a brand mark nobody can read is not doing its job.
const BAR_FRACTION = 0.115;

export function barHeightFor(width: number): number {
  return Math.round(width * BAR_FRACTION);
}

// SVG <text> neither wraps nor shrinks: a label wider than the bar simply
// overflows and is clipped at both ends by the viewport, which is what a
// 46-character AI-written title did to every ratio. So measure before
// drawing.
//
// Advance width of the design's bold uppercase face, in ems. Archivo is the
// design's, DejaVu Sans Bold is what the rasterizer falls back to when
// Archivo is not installed on the host, and the two are close enough at this
// size that one constant covers both. Deliberately a slight over-estimate —
// erring wide costs a pixel of type, erring narrow costs a clipped word.
const ADVANCE_EM = 0.68;

// How large the type is when nothing forces it smaller, as a fraction of the
// bar. Exported so tests assert against the intent rather than re-deriving a
// magic number that then has to be changed in two places.
export const NATURAL_TYPE_FRACTION = 0.46;

// The smallest type we will set, as a fraction of the crop's WIDTH rather than
// of the natural size. This is a readability limit and readability does not
// scale with the bar: when the bar grew, a floor defined against the natural
// size rose with it and started truncating titles that had previously fitted.
// Anchoring it to the crop keeps the floor where it was — about 22px on a
// 1000px pin — so a bigger bar buys larger brand text without costing long
// titles their words.
const MIN_TYPE_FRACTION = 0.022;

export function minTypeSizeFor(width: number): number {
  return Math.max(1, Math.round(width * MIN_TYPE_FRACTION));
}
const SIDE_PADDING = 0.94;

function labelWidth(label: string, fontSize: number): number {
  if (label.length === 0) return 0;
  const tracking = Math.round(fontSize * 0.08);
  return label.length * fontSize * ADVANCE_EM + tracking * (label.length - 1);
}

// Returns the label and type size that actually fit inside the bar: shrink
// first, and only truncate once shrinking has hit its floor.
export function fitLabel(
  text: string,
  width: number
): { label: string; fontSize: number; truncated: boolean } {
  const barHeight = barHeightFor(width);
  const natural = Math.round(barHeight * NATURAL_TYPE_FRACTION);
  const floor = minTypeSizeFor(width);
  const maxWidth = width * SIDE_PADDING;
  const upper = text.toUpperCase().trim();

  let fontSize = natural;
  while (fontSize > floor && labelWidth(upper, fontSize) > maxWidth) fontSize -= 1;
  if (labelWidth(upper, fontSize) <= maxWidth) {
    return { label: upper, fontSize, truncated: false };
  }

  // Still too wide at the smallest size we will set: trim to fit, ellipsis
  // included in the measurement rather than added after it.
  let label = upper;
  while (label.length > 1 && labelWidth(`${label}…`, fontSize) > maxWidth) {
    label = label.slice(0, -1);
  }
  return { label: `${label.trimEnd()}…`, fontSize, truncated: true };
}

// The overlay bar as SVG, sized to the target crop: full width, height and
// type scale proportional to the crop's width so the bar reads the same at
// every ratio. Archivo is the design's face; the SVG rasterizer falls back
// to a bold sans where Archivo isn't installed on the host.
export function overlaySvg(width: number, text: string): Buffer {
  const barHeight = barHeightFor(width);
  const { label, fontSize } = fitLabel(text, width);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${barHeight}">
      <rect width="${width}" height="${barHeight}" fill="${ACCENT}"/>
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
        font-family="Archivo, DejaVu Sans, sans-serif" font-weight="800"
        font-size="${fontSize}" letter-spacing="${Math.round(fontSize * 0.08)}"
        fill="#ffffff">${escapeXml(label)}</text>
    </svg>`
  );
}

export function overlayTop(pos: OverlayPos, cropHeight: number, barHeight: number): number {
  if (pos === 'top') return 0;
  if (pos === 'middle') return Math.round((cropHeight - barHeight) / 2);
  return cropHeight - barHeight;
}

export async function renderCrop(
  source: Buffer,
  ratio: CropRatio,
  overlay: { text: string; pos: OverlayPos } | null
): Promise<Buffer> {
  const { width, height } = CROP_SIZES[ratio];
  const base = sharp(source)
    .rotate() // respect EXIF orientation
    .flatten({ background: '#ffffff' }) // transparent PNGs land on white, not black
    // Centre, not sharp's 'attention'. Attention keeps whatever region scores
    // highest on entropy and saturation, which in a lifestyle mockup is a face
    // or an animal — so a 2:3 mug shot cropped to 1:1 kept the cat and the dog
    // and cut the mug in half. Both paths into this renderer put the product in
    // the middle on purpose: the templates ask the model to centre it, and the
    // compositor centres it directly. Cropping to the centre honours that
    // instead of second-guessing it.
    .resize(width, height, { fit: 'cover', position: 'centre' });

  if (!overlay || !overlay.text.trim()) {
    return base.jpeg({ quality: 88 }).toBuffer();
  }

  const bar = overlaySvg(width, overlay.text);
  const barHeight = barHeightFor(width);
  return base
    .composite([{ input: bar, left: 0, top: overlayTop(overlay.pos, height, barHeight) }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

export async function renderAll(
  source: Buffer,
  ratios: CropRatio[],
  overlay: { text: string; pos: OverlayPos } | null
): Promise<Record<string, Buffer>> {
  const out: Record<string, Buffer> = {};
  await Promise.all(
    ratios.map(async (ratio) => {
      out[ratio] = await renderCrop(source, ratio, overlay);
    })
  );
  return out;
}
