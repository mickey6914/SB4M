import sharp from 'sharp';

// Mockups composited here rather than drawn by an image model, on purpose.
// The seller's designs are intricate (stained glass, botanical line work), and
// DECISIONS.md §11 names the cost of a generative model touching artwork: it
// can redraw it. These place the seller's own pixels untouched, so the design
// is exact, the image is instant, and it costs no credits.
//
//   Basic marketing — the artwork on a soft backdrop with the pin's title
//   underneath, laid out like an ad (DECISIONS.md §18).
//   Unframed wall art — the artwork on its own, lifted off the backdrop by a
//   soft shadow.

export const BASIC_MARKETING = 'Basic marketing';
export const UNFRAMED_WALL_ART = 'Unframed wall art';

export const COMPOSITE_LABELS = [BASIC_MARKETING, UNFRAMED_WALL_ART];

export type CompositeStyle = 'promo' | 'unframed';

export function compositeStyleFor(label: string | undefined): CompositeStyle | null {
  const l = (label ?? '').trim().toLowerCase();
  if (l === BASIC_MARKETING.toLowerCase()) return 'promo';
  if (l === UNFRAMED_WALL_ART.toLowerCase()) return 'unframed';
  return null;
}

export function isBasicMarketing(label: string | undefined): boolean {
  return compositeStyleFor(label) === 'promo';
}

// 2:3, the same shape as the AI mockups, so every crop trims rather than guts.
export const MARKETING_SIZE = { width: 1200, height: 1800 } as const;

// Soft, neutral backdrops. Pins on one of these mockups rotate through them by
// variant, so several pins are not identical images (Pinterest treats repeats
// as spam — DECISIONS.md §12).
export const BACKDROPS: { top: string; bottom: string; ink: string }[] = [
  { top: '#f4efe8', bottom: '#e6ded3', ink: '#2b2622' }, // warm linen
  { top: '#eef0ee', bottom: '#dde2dd', ink: '#26302a' }, // sage mist
  { top: '#f6f3ee', bottom: '#ebe5dc', ink: '#3a2e22' }, // cream
  { top: '#ecebe9', bottom: '#d9d7d3', ink: '#222222' }, // stone grey
  { top: '#f3ece6', bottom: '#e5d6cb', ink: '#3b2a24' }, // blush
  { top: '#fbfaf8', bottom: '#efece7', ink: '#2b2622' }, // gallery white
];

export function backdropFor(variant?: number): (typeof BACKDROPS)[number] {
  const i = variant && variant > 0 ? (Math.floor(variant) - 1) % BACKDROPS.length : 0;
  return BACKDROPS[i];
}

// — The promo layout —
//
// Basic marketing is drawn at each crop's own shape rather than cut out of one
// picture (DECISIONS.md §19). Cutting one 2:3 image down to a square forced the
// art and title into a short strip in the middle so the square still held them,
// which left the art small everywhere. Drawn per shape, the art fills each crop
// with the title under it, and the space the brand band will occupy is kept
// clear so the band never sits on the words.
export type PromoReserve = { top: number; bottom: number };

const TITLE_MAX_LINES = 3;
// Type sizes for a 1200px-wide canvas; scaled to each crop's width.
const TITLE_SIZES = [64, 58, 52, 46];
// Average advance of bold serif capitals and lowercase, in ems. A slight
// over-estimate, so a line errs short rather than running past the margin.
const SERIF_ADVANCE_EM = 0.56;

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Wrap a title into at most three lines that fit the safe width, shrinking the
// type before dropping words. SEO titles run long, so past the smallest size
// the headline keeps its first words and ends cleanly on a whole word — no
// ellipsis on an ad.
export function wrapTitle(
  title: string,
  maxWidth = 1000,
  sizes: number[] = TITLE_SIZES
): {
  lines: string[];
  fontSize: number;
} {
  const words = title.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return { lines: [], fontSize: sizes[0] };

  const wrap = (size: number): string[] => {
    const perLine = Math.max(8, Math.floor(maxWidth / (size * SERIF_ADVANCE_EM)));
    const lines: string[] = [];
    let current = '';
    for (const w of words) {
      const next = current ? `${current} ${w}` : w;
      if (next.length <= perLine || !current) {
        current = next;
      } else {
        lines.push(current);
        current = w;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  for (const size of sizes) {
    const lines = wrap(size);
    if (lines.length <= TITLE_MAX_LINES) return { lines, fontSize: size };
  }
  const smallest = sizes[sizes.length - 1];
  return { lines: wrap(smallest).slice(0, TITLE_MAX_LINES), fontSize: smallest };
}

async function fitArt(art: Buffer, maxW: number, maxH: number) {
  const png = await sharp(art)
    .rotate()
    .resize(maxW, maxH, { fit: 'inside', withoutEnlargement: false })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
  const meta = await sharp(png).metadata();
  return { png, w: meta.width ?? maxW, h: meta.height ?? maxH };
}

function backdropSvg(
  look: (typeof BACKDROPS)[number],
  extra = '',
  width: number = MARKETING_SIZE.width,
  height: number = MARKETING_SIZE.height
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
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
    ${extra}
  </svg>`;
}

function shadowRect(left: number, top: number, w: number, h: number, canvasW: number = MARKETING_SIZE.width): string {
  const offset = Math.round(canvasW * 0.012);
  return `<rect x="${left + offset}" y="${top + offset * 2}" width="${w}" height="${h}" fill="#000" opacity="0.22" filter="url(#soft)"/>`;
}

export async function marketingMockup(
  art: Buffer,
  variant?: number,
  style: CompositeStyle = 'promo',
  title = ''
): Promise<Buffer> {
  const { width, height } = MARKETING_SIZE;
  const look = backdropFor(variant);

  if (style === 'unframed') {
    const { png, w, h } = await fitArt(art, Math.round(width * 0.72), Math.round(height * 0.66));
    const left = Math.round((width - w) / 2);
    // A touch above centre, the way a piece is hung and photographed.
    const top = Math.round((height - h) / 2 - height * 0.03);
    return sharp(Buffer.from(backdropSvg(look, shadowRect(left, top, w, h))))
      .composite([{ input: png, left, top }])
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  // The source image assumes the default band: medium, along the bottom.
  return promoImage(art, title, variant, { width, height }, { top: 0, bottom: Math.round(width * 0.115) });
}

// Art above, title below, sized to fill a canvas of any shape while keeping
// the band's space (reserve) clear.
export async function promoImage(
  art: Buffer,
  title: string,
  variant: number | undefined,
  size: { width: number; height: number },
  reserve: PromoReserve
): Promise<Buffer> {
  const { width, height } = size;
  const look = backdropFor(variant);
  const scale = width / MARKETING_SIZE.width;
  const margin = Math.round(width * 0.06);
  const area = {
    top: reserve.top + margin,
    bottom: height - reserve.bottom - margin,
    left: margin,
    right: width - margin,
  };
  const areaW = area.right - area.left;
  const areaH = area.bottom - area.top;

  const { lines, fontSize } = wrapTitle(
    title,
    areaW,
    TITLE_SIZES.map((s) => Math.round(s * scale))
  );
  const lineHeight = Math.round(fontSize * 1.18);
  const gap = Math.round(36 * scale);
  const textBlock = lines.length ? lines.length * lineHeight : 0;
  const artMaxH = Math.max(50, areaH - (textBlock ? textBlock + gap : 0));
  const { png, w, h } = await fitArt(art, areaW, artMaxH);

  // Centre the art + title group vertically in the clear area.
  const groupH = h + (textBlock ? gap + textBlock : 0);
  const artTop = area.top + Math.max(0, Math.round((areaH - groupH) / 2));
  const artLeft = Math.round((width - w) / 2);
  const firstBaseline = artTop + h + gap + Math.round(fontSize * 0.92);

  const text = lines
    .map(
      (line, i) =>
        `<text x="${width / 2}" y="${firstBaseline + i * lineHeight}" text-anchor="middle"
          font-family="DejaVu Serif, serif" font-weight="700" font-size="${fontSize}"
          fill="${look.ink}">${escapeXml(line)}</text>`
    )
    .join('\n');

  return sharp(Buffer.from(backdropSvg(look, shadowRect(artLeft, artTop, w, h, width) + text, width, height)))
    .composite([{ input: png, left: artLeft, top: artTop }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
