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

// The overlay bar as SVG, sized to the target crop: full width, height and
// type scale proportional to the crop's width so the bar reads the same at
// every ratio. Archivo is the design's face; the SVG rasterizer falls back
// to a bold sans where Archivo isn't installed on the host.
export function overlaySvg(width: number, text: string): Buffer {
  const barHeight = Math.round(width * 0.085);
  const fontSize = Math.round(barHeight * 0.42);
  const label = escapeXml(text.toUpperCase());
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${barHeight}">
      <rect width="${width}" height="${barHeight}" fill="${ACCENT}"/>
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
        font-family="Archivo, DejaVu Sans, sans-serif" font-weight="800"
        font-size="${fontSize}" letter-spacing="${Math.round(fontSize * 0.08)}"
        fill="#ffffff">${label}</text>
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
    .resize(width, height, { fit: 'cover', position: 'attention' });

  if (!overlay || !overlay.text.trim()) {
    return base.jpeg({ quality: 88 }).toBuffer();
  }

  const bar = overlaySvg(width, overlay.text);
  const barHeight = Math.round(width * 0.085);
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
