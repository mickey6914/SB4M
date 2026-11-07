import type { Niche } from './types.js';

// The vocabulary the analysis recognises. Colours carry a hex so a palette can
// be shown and pasted into a design tool; the hex is a representative swatch
// for the name, not a standard. Longer names are listed before the shorter
// names they contain ("sage green" before "green") — matching takes the
// longest name first and blanks it out, so one mention counts once.

export const COLORS: { name: string; hex: string; aliases?: string[] }[] = [
  { name: 'sage green', hex: '#9CAF88', aliases: ['sage'] },
  { name: 'olive green', hex: '#708238', aliases: ['olive'] },
  { name: 'forest green', hex: '#2E5339' },
  { name: 'emerald green', hex: '#2A7F62', aliases: ['emerald'] },
  { name: 'mint green', hex: '#A8D8B9', aliases: ['mint'] },
  { name: 'dusty rose', hex: '#C9A0A0' },
  { name: 'blush pink', hex: '#F2C4C4', aliases: ['blush'] },
  { name: 'hot pink', hex: '#E0457B' },
  { name: 'pastel pink', hex: '#F8C8DC' },
  { name: 'cherry red', hex: '#B3172E', aliases: ['cherry'] },
  { name: 'burgundy', hex: '#7A2232', aliases: ['wine', 'oxblood'] },
  { name: 'terracotta', hex: '#C4673F', aliases: ['terra cotta'] },
  { name: 'burnt orange', hex: '#CC5500' },
  { name: 'rust', hex: '#A0522D' },
  { name: 'mustard yellow', hex: '#D9A520', aliases: ['mustard'] },
  { name: 'butter yellow', hex: '#F6E3A1', aliases: ['butter'] },
  { name: 'mocha mousse', hex: '#A47864', aliases: ['mocha'] },
  { name: 'chocolate brown', hex: '#5C3A21', aliases: ['chocolate'] },
  { name: 'caramel', hex: '#C68E4E' },
  { name: 'beige', hex: '#D9C7A7', aliases: ['tan', 'oatmeal'] },
  { name: 'cream', hex: '#F3EAD3', aliases: ['ivory', 'off white'] },
  { name: 'navy blue', hex: '#1F3A5F', aliases: ['navy'] },
  { name: 'cobalt blue', hex: '#1F4FBF', aliases: ['cobalt'] },
  { name: 'baby blue', hex: '#A7C7E7', aliases: ['powder blue'] },
  { name: 'dusty blue', hex: '#7D9BB4', aliases: ['slate blue'] },
  { name: 'teal', hex: '#2C7A7B' },
  { name: 'lavender', hex: '#B9A6D3', aliases: ['lilac'] },
  { name: 'plum', hex: '#6B3E66', aliases: ['purple'] },
  { name: 'charcoal', hex: '#36454F', aliases: ['charcoal gray'] },
  { name: 'black and white', hex: '#111111', aliases: ['monochrome', 'b&w'] },
  { name: 'gold', hex: '#C9A227', aliases: ['gold foil'] },
  { name: 'silver', hex: '#B8BCC2' },
  { name: 'neutral', hex: '#CFC4B4', aliases: ['neutrals'] },
  { name: 'earth tone', hex: '#9C7A54', aliases: ['earth tones', 'earthy'] },
  { name: 'jewel tone', hex: '#2B5F75', aliases: ['jewel tones'] },
  { name: 'pastel', hex: '#F4D6E6', aliases: ['pastels'] },
  { name: 'rainbow', hex: '#E86A5A' },
  { name: 'pink', hex: '#E8A0B4' },
  { name: 'red', hex: '#C0392B' },
  { name: 'orange', hex: '#E67E22' },
  { name: 'yellow', hex: '#F1C40F' },
  { name: 'green', hex: '#4E8C5A' },
  { name: 'blue', hex: '#3A6EA5' },
  { name: 'brown', hex: '#7B5134' },
  { name: 'black', hex: '#1A1A1A' },
  { name: 'white', hex: '#FAFAFA' },
  { name: 'gray', hex: '#9E9E9E', aliases: ['grey'] },
];

// Styles, aesthetics and pattern types — what a design looks like, as opposed
// to what it depicts.
export const STYLES: { name: string; aliases?: string[] }[] = [
  { name: 'mid century modern', aliases: ['mid century', 'midcentury', 'mcm'] },
  { name: 'boho', aliases: ['bohemian'] },
  { name: 'minimalist', aliases: ['minimal', 'minimalism'] },
  { name: 'abstract' },
  { name: 'botanical' },
  { name: 'floral' },
  { name: 'cottagecore', aliases: ['cottage core', 'cottage'] },
  { name: 'vintage', aliases: ['antique'] },
  { name: 'retro', aliases: ['70s', '80s', '90s'] },
  { name: 'groovy' },
  { name: 'checkered', aliases: ['checkerboard'] },
  { name: 'gingham' },
  { name: 'toile' },
  { name: 'william morris', aliases: ['morris'] },
  { name: 'line art', aliases: ['one line', 'single line', 'line drawing'] },
  { name: 'watercolor', aliases: ['watercolour'] },
  { name: 'geometric' },
  { name: 'japandi' },
  { name: 'japanese', aliases: ['ukiyo e', 'japanese woodblock'] },
  { name: 'coastal', aliases: ['beach', 'nautical', 'coastal grandmother'] },
  { name: 'farmhouse', aliases: ['rustic'] },
  { name: 'dark academia' },
  { name: 'gothic', aliases: ['goth', 'moody', 'dark'] },
  { name: 'whimsical', aliases: ['whimsigoth'] },
  { name: 'kawaii', aliases: ['cute'] },
  { name: 'art deco' },
  { name: 'art nouveau' },
  { name: 'maximalist', aliases: ['maximalism', 'eclectic'] },
  { name: 'grandmillennial' },
  { name: 'coquette', aliases: ['bow', 'bows', 'ribbon'] },
  { name: 'western', aliases: ['cowboy', 'cowgirl', 'rodeo'] },
  { name: 'celestial', aliases: ['moon', 'stars', 'zodiac', 'astrology'] },
  { name: 'scandinavian', aliases: ['scandi', 'nordic'] },
  { name: 'wabi sabi' },
  { name: 'bauhaus' },
  { name: 'pop art' },
  { name: 'typography', aliases: ['quote', 'quotes', 'lettering'] },
  { name: 'stained glass' },
  { name: 'oil painting', aliases: ['impressionist', 'impressionism'] },
  { name: 'gallery wall', aliases: ['set of 3', 'set of 6', 'set of 9'] },
  { name: 'seamless pattern', aliases: ['seamless', 'repeat pattern', 'digital paper'] },
  { name: 'hand drawn', aliases: ['hand-drawn', 'doodle'] },
  { name: 'flat illustration', aliases: ['vector', 'svg'] },
  { name: '3d', aliases: ['3d render', 'clay'] },
  { name: 'neutral', aliases: ['neutrals'] },
];

// Words that describe the product rather than the design. They are removed
// before counting so "wall art" does not top every list for a wall-art search.
export const PRODUCT_WORDS = new Set([
  'art', 'arts', 'wall', 'print', 'prints', 'printable', 'printables', 'poster', 'posters',
  'decor', 'decoration', 'decorations', 'home', 'clipart', 'clip', 'png', 'svg', 'jpg', 'pdf',
  'digital', 'download', 'instant', 'file', 'files', 'bundle', 'set', 'pack', 'commercial', 'use',
  'sublimation', 'design', 'designs', 'graphic', 'graphics', 'image', 'images', 'canvas', 'framed',
  'unframed', 'frame', 'room', 'living', 'bedroom', 'kitchen', 'bathroom', 'nursery', 'office',
  'gift', 'gifts', 'for', 'her', 'him', 'mom', 'idea', 'ideas', 'aesthetic', 'trendy', 'trending',
  'modern', 'large', 'small', 'big', 'cute', 'best', 'new', 'free', 'diy', 'etsy', 'amazon',
  'shop', 'buy', 'cheap', 'sale', 'near', 'me', 'x', 'pcs', 'piece', 'pieces', 'inch', 'inches',
]);

export const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'in', 'on', 'with', 'to', 'by', 'or', 'at', 'from', 'is', 'it',
  'your', 'my', 'our', 'this', 'that', 'as', 'be', 'are', 'you', 'i', 'we', 'its', 'how', 'what',
  'vs', 'top', 'most', 'popular', 'about', 'into', 'up', 'out', 'no', 'not', 'all', 'any',
  '2024', '2025', '2026', '2027', '2028',
]);

// Default seeds per niche, used when the seller types none. They are broad on
// purpose: autocomplete narrows them into what buyers actually type.
export const NICHE_DEFAULTS: Record<Niche, { label: string; seeds: string[]; productType: string }> = {
  clipart: {
    label: 'Clipart',
    seeds: ['clipart', 'clipart bundle', 'watercolor clipart', 'png clipart commercial use'],
    productType: 'digital clipart bundle (PNG, commercial use)',
  },
  wall_art: {
    label: 'Wall art',
    seeds: ['wall art', 'printable wall art', 'gallery wall set', 'wall art prints'],
    productType: 'printable digital wall art',
  },
  home_decor: {
    label: 'Home decor',
    seeds: ['home decor trends', 'home decor', 'aesthetic room decor', 'seamless pattern'],
    productType: 'digital home decor print',
  },
};

// Autocomplete expansions. Each seed is asked about as-is and with these
// modifiers, which is how search engines reveal the long tail.
export function expansionsFor(seed: string, now = new Date()): string[] {
  // From September on, next year's trend searches are already live.
  const year = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
  return [seed, `${seed} trends ${year}`, `${seed} aesthetic`, `${seed} ideas`];
}
