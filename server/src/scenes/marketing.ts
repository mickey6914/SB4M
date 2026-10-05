import sharp from 'sharp';

// "Basic marketing" — the clean product shot a listing leads with: the artwork
// straight-on in a simple frame, on a plain soft background. No people, no
// room.
//
// Built here rather than by an image model, on purpose. The seller's designs
// are intricate (stained glass, botanical line work), and DECISIONS.md §11
// names the cost of a generative model touching artwork: it can redraw it.
// This composite places the seller's own pixels into the frame untouched, so
// the design is exact, the image is instant, and it costs no credits.

export const BASIC_MARKETING = 'Basic marketing';
// The same shot without a frame or mat: the print (or acrylic panel) on its
// own, lifted off the backdrop by a soft shadow.
export const UNFRAMED_WALL_ART = 'Unframed wall art';

export const COMPOSITE_LABELS = [BASIC_MARKETING, UNFRAMED_WALL_ART];

export type CompositeStyle = 'framed' | 'unframed';

export function compositeStyleFor(label: string | undefined): CompositeStyle | null {
  const l = (label ?? '').trim().toLowerCase();
  if (l === BASIC_MARKETING.toLowerCase()) return 'framed';
  if (l === UNFRAMED_WALL_ART.toLowerCase()) return 'unframed';
  return null;
}

export function isBasicMarketing(label: string | undefined): boolean {
  return compositeStyleFor(label) === 'framed';
}

// 2:3, the same shape as the AI mockups, so every crop trims rather than guts.
export const MARKETING_SIZE = { width: 1200, height: 1800 } as const;

// Soft, neutral backdrops. Pins on this mockup rotate through them by variant,
// so a run of several basic-marketing pins is not several identical images
// (Pinterest treats repeats as spam — DECISIONS.md §12).
export const BACKDROPS: { top: string; bottom: string; frame: string }[] = [
  { top: '#f4efe8', bottom: '#e6ded3', frame: '#2b2622' }, // warm linen, black frame
  { top: '#eef0ee', bottom: '#dde2dd', frame: '#5b4a3a' }, // sage mist, walnut frame
  { top: '#f6f3ee', bottom: '#ebe5dc', frame: '#b08d57' }, // cream, gold frame
  { top: '#ecebe9', bottom: '#d9d7d3', frame: '#2b2622' }, // stone grey, black frame
  { top: '#f3ece6', bottom: '#e5d6cb', frame: '#ffffff' }, // blush, white frame
  { top: '#fbfaf8', bottom: '#efece7', frame: '#7a5c43' }, // gallery white, oak frame
];

export function backdropFor(variant?: number): (typeof BACKDROPS)[number] {
  const i = variant && variant > 0 ? (Math.floor(variant) - 1) % BACKDROPS.length : 0;
  return BACKDROPS[i];
}

export async function marketingMockup(
  art: Buffer,
  variant?: number,
  style: CompositeStyle = 'framed'
): Promise<Buffer> {
  const { width, height } = MARKETING_SIZE;
  const look = backdropFor(variant);
  const framed = style === 'framed';

  // The artwork, never cropped: fitted inside the space the frame allows —
  // a little larger when there is no frame and mat to make room for.
  // Transparent clipart sits on white rather than on black.
  const maxArtW = Math.round(width * (framed ? 0.62 : 0.72));
  const maxArtH = Math.round(height * (framed ? 0.6 : 0.66));
  const artPng = await sharp(art)
    .rotate()
    .resize(maxArtW, maxArtH, { fit: 'inside', withoutEnlargement: false })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
  const meta = await sharp(artPng).metadata();
  const artW = meta.width ?? maxArtW;
  const artH = meta.height ?? maxArtH;

  const mat = framed ? Math.round(width * 0.045) : 0;
  const frame = framed ? Math.round(width * 0.022) : 0;
  const outerW = artW + 2 * (mat + frame);
  const outerH = artH + 2 * (mat + frame);
  const left = Math.round((width - outerW) / 2);
  // A touch above centre, the way a framed print is hung and photographed.
  const top = Math.round((height - outerH) / 2 - height * 0.03);

  const shadowOffset = Math.round(width * 0.012);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${look.top}"/>
        <stop offset="1" stop-color="${look.bottom}"/>
      </linearGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="${Math.round(width * 0.014)}"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <rect x="${left + shadowOffset}" y="${top + shadowOffset * 2}" width="${outerW}" height="${outerH}"
      fill="#000" opacity="0.22" filter="url(#soft)"/>
    ${
      framed
        ? `<rect x="${left}" y="${top}" width="${outerW}" height="${outerH}" fill="${look.frame}"/>
    <rect x="${left + frame}" y="${top + frame}" width="${outerW - 2 * frame}" height="${outerH - 2 * frame}" fill="#ffffff"/>`
        : ''
    }
  </svg>`;

  return sharp(Buffer.from(svg))
    .composite([{ input: artPng, left: left + frame + mat, top: top + frame + mat }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
