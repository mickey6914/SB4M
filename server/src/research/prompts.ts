import { NICHE_DEFAULTS } from './lexicon.js';
import type { Analysis, Idea, IdeaPrompts, Niche, PaletteColor } from './types.js';

// Image-generation prompts and production specs per niche. Written to work in
// any text-to-image tool (Midjourney, Ideogram, Firefly, Leonardo, the
// Abacus / Gemini / OpenAI models the studio already uses), so they are
// plain descriptive English: no tool-specific flags inside the prompt text.
// Aspect ratios ride in the specs instead.

export const NICHE_SPECS: Record<Niche, string[]> = {
  clipart: [
    'Generate on a plain white background, then remove it: deliver transparent PNGs',
    '300 DPI, about 3600 px on the long edge per element',
    '10–25 elements per set, in one consistent style and palette',
    'Include a commercial-use licence note in the listing',
    'Offer a matching seamless digital paper as an upsell',
  ],
  wall_art: [
    '2:3 ratio → 4×6, 8×12, 12×18, 16×24, 24×36 in',
    '3:4 ratio → 6×8, 9×12, 12×16, 18×24 in',
    '4:5 ratio → 8×10, 16×20 in · plus 11×14 in and ISO A1–A5',
    'Export each ratio at 300 DPI, JPG and PDF, in one ZIP',
    'Sets of 3 sell as a gallery wall — keep palette and line weight identical',
  ],
  home_decor: [
    'Seamless repeat tile, 3600 × 3600 px at 300 DPI (12 in square)',
    'Check the repeat by tiling 2×2 before export',
    'Offer the same motif as wall print, pillow, tote and mug mockups',
    'List colourways separately — each is its own search result',
    'Include printable sizes for shelf liners / drawer papers where relevant',
  ],
};

const NEGATIVE: Record<Niche, string> = {
  clipart:
    'text, watermark, signature, background scenery, drop shadow, cropped elements, overlapping elements, blurry, jpeg artefacts, photorealistic',
  wall_art: 'text, watermark, signature, frame, border, mockup, wall, room, blurry, low resolution, distorted anatomy',
  home_decor: 'text, watermark, visible seams, borders, vignette, perspective, mockup, blurry, uneven repeat',
};

function paletteText(palette: PaletteColor[]): string {
  if (!palette.length) return 'a harmonious limited palette';
  return `a palette of ${palette.map((c) => `${c.name} (${c.hex})`).join(', ')}`;
}

export function buildPrompts(input: {
  niche: Niche;
  subject: string;
  styles: string[];
  palette: PaletteColor[];
}): IdeaPrompts {
  const style = input.styles.length ? input.styles.join(', ') : 'clean modern';
  const palette = paletteText(input.palette);
  const s = input.subject;
  switch (input.niche) {
    case 'clipart':
      return {
        main: `Clipart set of 12 separate ${s} elements, ${style} style, ${palette}, each element fully isolated and evenly spaced on a pure white background, crisp clean edges, consistent line weight and lighting, high detail, no text`,
        variations: [
          `Single hero ${s} illustration, ${style} style, ${palette}, centred and isolated on pure white, crisp edges, sticker-ready, no text`,
          `Clipart set of 16 small ${s} accents and doodles (sprigs, dots, borders, frames), ${style} style, ${palette}, isolated on pure white, no text`,
          `Seamless repeating pattern of ${s} motifs, ${style} style, ${palette}, flat even lighting, tileable digital paper`,
        ],
        negative: NEGATIVE.clipart,
      };
    case 'wall_art':
      return {
        main: `${capital(style)} wall art of ${s}, ${palette}, balanced composition with generous negative space, gallery-quality fine art print, soft even lighting, rich texture, no text, no frame`,
        variations: [
          `Set of 3 coordinating ${style} art prints of ${s}, same ${palette} and identical line weight across all three, cohesive gallery wall, no text`,
          `Minimal ${style} interpretation of ${s}, ${palette}, one bold focal shape, large negative space, matte paper texture, no text`,
          `Vintage-inspired ${style} illustration of ${s}, ${palette}, subtle paper grain and muted ink, museum print feel, no text`,
        ],
        negative: NEGATIVE.wall_art,
      };
    case 'home_decor':
      return {
        main: `Seamless repeating pattern of ${s}, ${style} style, ${palette}, evenly distributed motifs, flat lighting, tileable with no visible seams, high resolution surface design`,
        variations: [
          `${capital(style)} ${s} motif for a throw pillow, centred, ${palette}, on a solid background, no text`,
          `Coordinating small-scale ${s} ditsy print, ${style}, ${palette}, seamless tile, flat lighting`,
          `${capital(style)} ${s} art print for a cosy room, ${palette}, soft texture, no text, no frame`,
        ],
        negative: NEGATIVE.home_decor,
      };
  }
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// Thirteen tags of at most 20 characters, the Etsy limits.
export function etsyTags(candidates: string[]): string[] {
  const out: string[] = [];
  for (const raw of candidates) {
    const t = raw.toLowerCase().replace(/[^a-z0-9 &'-]/g, '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 20 || out.includes(t)) continue;
    out.push(t);
    if (out.length === 13) break;
  }
  return out;
}

export function clampEtsyTitle(t: string): string {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length <= 140 ? s : s.slice(0, 140).replace(/\s+\S*$/, '');
}

const PRODUCT_NOUN: Record<Niche, { title: string; tags: string[] }> = {
  clipart: { title: 'Clipart Bundle PNG, Commercial Use', tags: ['clipart', 'png clipart', 'commercial use', 'clipart bundle', 'digital download'] },
  wall_art: { title: 'Wall Art Print, Printable Digital Download', tags: ['wall art', 'printable art', 'digital print', 'gallery wall', 'wall decor'] },
  home_decor: { title: 'Seamless Pattern, Digital Paper', tags: ['seamless pattern', 'digital paper', 'home decor', 'surface pattern', 'room decor'] },
};

// The built-in generator, used when Claude is unavailable. It pairs the
// strongest subjects with the strongest styles and colours found, so every
// idea is traceable to real signals rather than invented.
export function ruleIdeas(niche: Niche, a: Analysis, count = 6): Idea[] {
  const subjects = a.subjects.length ? a.subjects : a.keywords;
  const styles = a.styles.length ? a.styles.map((s) => s.name) : ['minimalist', 'boho', 'watercolor'];
  const colors = a.colors.length ? a.colors : [{ name: 'neutral', hex: '#CFC4B4', count: 0, sources: [] }];
  const noun = PRODUCT_NOUN[niche];
  const ideas: Idea[] = [];
  // One idea per distinct subject: "vintage mushroom" after "mushroom" is the
  // same product, so a subject overlapping one already used is skipped.
  const picked: typeof subjects = [];
  for (const k of subjects) {
    const overlaps = picked.some((p) => ` ${p.phrase} `.includes(` ${k.phrase} `) || ` ${k.phrase} `.includes(` ${p.phrase} `));
    if (!overlaps) picked.push(k);
    if (picked.length === count) break;
  }
  for (let i = 0; i < Math.max(picked.length, 1); i++) {
    const subj = picked[i];
    const subject = subj?.phrase ?? 'botanical';
    // Styles the subject already names would repeat in the title and prompt.
    const fresh = styles.filter((s) => !` ${subject} `.includes(` ${s} `));
    const pool = fresh.length ? fresh : styles;
    const st = [pool[i % pool.length], pool[(i + 1) % pool.length]].filter((v, j, arr) => arr.indexOf(v) === j);
    const palette = [0, 1, 2]
      .map((k) => colors[(i + k) % colors.length])
      .filter((c, j, arr) => arr.findIndex((x) => x.name === c.name) === j)
      .map((c) => ({ name: c.name, hex: c.hex }));
    const score = subj?.score ?? 0;
    const sources = subj?.sources ?? [];
    const competition =
      a.etsyCompetition === undefined ? 'unknown' : a.etsyCompetition > 50_000 ? 'high' : a.etsyCompetition > 8_000 ? 'medium' : 'low';
    const evidence = [
      subj ? `“${subject}” appears ${subj.count}× across ${sources.join(', ')}` : 'Low data — add sources or seeds',
      subj?.etsyFavoritesPer30d ? `Etsy listings with it average ${subj.etsyFavoritesPer30d} favourites / 30 days` : null,
      subj?.pinterestGrowth ? `Pinterest searches up ${Math.round(subj.pinterestGrowth)}%` : null,
    ].filter((e): e is string => Boolean(e));
    const etsyPrice = a.prices.etsy;
    ideas.push({
      id: `rule-${i + 1}`,
      title: titleCase(`${st[0]} ${subject}`),
      niche,
      productType: NICHE_DEFAULTS[niche].productType,
      subject,
      styles: st,
      palette,
      why: `Pairs a high-signal subject with the strongest style and colour signals in this report.`,
      evidence,
      demand: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'emerging',
      competition,
      priceHint: etsyPrice
        ? `Etsy median ${etsyPrice.currency} ${etsyPrice.median.toFixed(2)} (top quarter from ${etsyPrice.p75.toFixed(2)})`
        : undefined,
      prompts: buildPrompts({ niche, subject, styles: st, palette }),
      specs: NICHE_SPECS[niche],
      etsy: {
        title: clampEtsyTitle(`${titleCase(`${st[0]} ${subject}`)} ${noun.title}, ${titleCase(palette.map((p) => p.name).join(' '))}`),
        tags: etsyTags([
          `${st[0]} ${subject}`,
          subject,
          ...st,
          ...palette.map((p) => `${p.name} decor`),
          ...noun.tags,
          ...a.keywords.slice(0, 10).map((k) => k.phrase),
        ]),
      },
    });
  }
  return ideas;
}
