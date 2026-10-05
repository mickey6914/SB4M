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

// — The promo layout, and why it sits where it does —
//
// Every pin is re-cropped per network, and the brand band is laid over the
// bottom of each crop. A square (1:1) crop of this 1200×1800 image keeps only
// rows 300–1500, and its band covers the bottom ~138px of that. So the art and
// the title both live inside rows 300–1360 and columns 150–1050 (a 9:16 crop
// trims the sides): every network's crop shows the whole design and the whole
// headline, and the band never sits on the words.
export const PROMO_SAFE = { top: 300, bottom: 1360, left: 150, right: 1050 } as const;

const TITLE_MAX_LINES = 3;
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
export function wrapTitle(title: string, maxWidth = PROMO_SAFE.right - PROMO_SAFE.left): {
  lines: string[];
  fontSize: number;
} {
  const words = title.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return { lines: [], fontSize: TITLE_SIZES[0] };

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

  for (const size of TITLE_SIZES) {
    const lines = wrap(size);
    if (lines.length <= TITLE_MAX_LINES) return { lines, fontSize: size };
  }
  const smallest = TITLE_SIZES[TITLE_SIZES.length - 1];
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

function backdropSvg(look: (typeof BACKDROPS)[number], extra = ''): string {
  const { width, height } = MARKETING_SIZE;
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

function shadowRect(left: number, top: number, w: number, h: number): string {
  const offset = Math.round(MARKETING_SIZE.width * 0.012);
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

  // Promo: art above, title below, both inside the crop-safe area.
  const { lines, fontSize } = wrapTitle(title);
  const lineHeight = Math.round(fontSize * 1.18);
  const gap = 44;
  const textBlock = lines.length ? lines.length * lineHeight : 0;
  const safeH = PROMO_SAFE.bottom - PROMO_SAFE.top;
  const artMaxH = safeH - (textBlock ? textBlock + gap : 0);
  const { png, w, h } = await fitArt(art, PROMO_SAFE.right - PROMO_SAFE.left, artMaxH);

  // Centre the art + title group vertically within the safe area.
  const groupH = h + (textBlock ? gap + textBlock : 0);
  const artTop = PROMO_SAFE.top + Math.round((safeH - groupH) / 2);
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

  return sharp(Buffer.from(backdropSvg(look, shadowRect(artLeft, artTop, w, h) + text)))
    .composite([{ input: png, left: artLeft, top: artTop }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
