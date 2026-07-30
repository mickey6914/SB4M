// Shared image loading for anything that accepts a user-supplied source:
// an http(s) listing image or a data: URL from a seller upload. Includes the
// SSRF guard, so no route can be pointed at our own network.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const MAX_BYTES = 15_000_000;

export function isPrivateHost(hostname: string): boolean {
  if (process.env.ALLOW_PRIVATE_INGEST === '1') return false;
  const h = hostname.replace(/\.$/, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '0.0.0.0' || h === '::' || h === '::1' || h === '[::1]') return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

export async function loadImageSource(src: string): Promise<Buffer | null> {
  if (src.startsWith('data:image/')) {
    const comma = src.indexOf(',');
    if (comma < 0) return null;
    try {
      const buf = Buffer.from(src.slice(comma + 1), 'base64');
      return buf.length > 0 && buf.length <= MAX_BYTES ? buf : null;
    } catch {
      return null;
    }
  }
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (isPrivateHost(url.hostname)) return null;
  try {
    const res = await fetch(url.href, {
      headers: { 'user-agent': UA, accept: 'image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    if (isPrivateHost(new URL(res.url || src).hostname)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 && buf.length <= MAX_BYTES ? buf : null;
  } catch {
    return null;
  }
}
