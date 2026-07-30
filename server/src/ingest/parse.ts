// Listing extraction from a product page. Strategy per DECISIONS: one generic
// reader — schema.org Product JSON-LD first (what search engines read), Open
// Graph tags as the fallback — plus a Shopify special case handled in the
// route. No per-marketplace scraping of page markup.

export type Source = 'etsy' | 'shopify' | 'amazon' | 'other';

export type Listing = {
  url: string;
  source: Source;
  title: string;
  description: string;
  images: string[];
  price?: string;
};

export function detectSource(url: URL): Source {
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'etsy.com' || host.endsWith('.etsy.com')) return 'etsy';
  if (/(^|\.)amazon\.[a-z.]+$/.test(host)) return 'amazon';
  return 'other';
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|nbsp|#39|#x27);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type Extracted = {
  title?: string;
  description?: string;
  images: string[];
  price?: string;
};

// — JSON-LD —

function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch {
      // Malformed JSON-LD is common in the wild — skip the block.
    }
  }
  return blocks;
}

function findProduct(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProduct(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const type = obj['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t) => typeof t === 'string' && t.toLowerCase() === 'product')) return obj;
    if (obj['@graph']) return findProduct(obj['@graph']);
  }
  return null;
}

function imageUrls(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(imageUrls);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.url === 'string') return [obj.url];
    if (typeof obj.contentUrl === 'string') return [obj.contentUrl];
  }
  return [];
}

function productPrice(offers: unknown): string | undefined {
  const list = Array.isArray(offers) ? offers : [offers];
  for (const offer of list) {
    if (offer && typeof offer === 'object') {
      const o = offer as Record<string, unknown>;
      const price = o.price ?? (o.priceSpecification as Record<string, unknown> | undefined)?.price;
      if (price != null && price !== '') {
        const currency = typeof o.priceCurrency === 'string' ? o.priceCurrency : '';
        return currency ? `${price} ${currency}` : String(price);
      }
    }
  }
  return undefined;
}

function fromJsonLd(html: string): Extracted | null {
  for (const block of jsonLdBlocks(html)) {
    const product = findProduct(block);
    if (!product) continue;
    return {
      title: typeof product.name === 'string' ? decodeEntities(product.name).trim() : undefined,
      description:
        typeof product.description === 'string' ? stripTags(product.description) : undefined,
      images: imageUrls(product.image),
      price: productPrice(product.offers),
    };
  }
  return null;
}

// — Open Graph / meta tags —

function metaContent(html: string, key: string): string[] {
  const out: string[] = [];
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const prop = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (prop?.toLowerCase() !== key) continue;
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) out.push(decodeEntities(content).trim());
  }
  return out;
}

function fromOpenGraph(html: string): Extracted {
  return {
    title: metaContent(html, 'og:title')[0] ?? metaContent(html, 'twitter:title')[0],
    description:
      metaContent(html, 'og:description')[0] ?? metaContent(html, 'description')[0],
    images: [...metaContent(html, 'og:image'), ...metaContent(html, 'twitter:image')],
    price: metaContent(html, 'product:price:amount')[0],
  };
}

// — combined —

function absolutize(images: string[], baseUrl: string): string[] {
  const out: string[] = [];
  for (const src of images) {
    try {
      const abs = new URL(src, baseUrl).href;
      if (abs.startsWith('http') && !out.includes(abs)) out.push(abs);
    } catch {
      // skip unparseable URLs
    }
  }
  return out.slice(0, 12);
}

export function parseListingHtml(html: string, url: string): Omit<Listing, 'source'> | null {
  const ld = fromJsonLd(html);
  const og = fromOpenGraph(html);
  const title = ld?.title || og.title;
  const description = ld?.description || og.description || '';
  const images = absolutize([...(ld?.images ?? []), ...og.images], url);
  if (!title || images.length === 0) return null;
  return { url, title, description, images, price: ld?.price ?? og.price };
}

// — Shopify product JSON (`/products/<handle>.json`) —

export function shopifyProductToListing(
  json: unknown,
  url: string
): Omit<Listing, 'source'> | null {
  if (!json || typeof json !== 'object') return null;
  const product = (json as Record<string, unknown>).product;
  if (!product || typeof product !== 'object') return null;
  const p = product as Record<string, unknown>;
  const title = typeof p.title === 'string' ? p.title.trim() : '';
  const images = Array.isArray(p.images)
    ? absolutize(
        p.images
          .map((i) => (i && typeof i === 'object' ? (i as Record<string, unknown>).src : null))
          .filter((s): s is string => typeof s === 'string'),
        url
      )
    : [];
  if (!title || images.length === 0) return null;
  const variants = Array.isArray(p.variants) ? p.variants : [];
  const firstVariant = variants[0] as Record<string, unknown> | undefined;
  return {
    url,
    title,
    description: typeof p.body_html === 'string' ? stripTags(p.body_html) : '',
    images,
    price: typeof firstVariant?.price === 'string' ? firstVariant.price : undefined,
  };
}
