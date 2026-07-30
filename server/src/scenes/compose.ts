import sharp, { type OverlayOptions } from 'sharp';

// Hybrid compositing. The product photograph goes onto the generated
// background UNTOUCHED — no generative model ever sees it, so its pixels
// cannot be altered. The quality work here is the blend: cutting the product
// off its flat studio background, sizing it into the scene, and grounding it
// with a soft contact shadow that matches the prompt's upper-left light.

export type ComposeOptions = {
  scale?: number; // product width as a fraction of the frame (default 0.62)
  baseline?: number; // where the product's feet sit, as a fraction (default 0.78)
  shadow?: boolean;
};

// Studio product shots usually sit on flat white. Keying that out lets the
// product meet the scene instead of floating in a white box. A photo that
// isn't on white is left alone rather than damaged by an aggressive key.
export async function cutout(product: Buffer): Promise<{ image: Buffer; keyed: boolean }> {
  const src = sharp(product).rotate();
  const { data, info } = await src.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const corners = [
    0,
    (width - 1) * channels,
    (height - 1) * width * channels,
    ((height - 1) * width + (width - 1)) * channels,
  ];

  // Already a cutout (transparent corners) — nothing to key, just trim.
  const transparentCorners = corners.every((c) => data[c + 3] < 16);
  if (transparentCorners) {
    return {
      image: await sharp(product).rotate().trim({ threshold: 1 }).png().toBuffer(),
      keyed: true,
    };
  }

  // A flat, light, consistent border means a studio background we can key.
  // Note an alpha channel alone proves nothing — plenty of PNGs are fully
  // opaque white — so this check runs regardless of hasAlpha.
  let sum = 0;
  for (const c of corners) sum += (data[c] + data[c + 1] + data[c + 2]) / 3;
  const cornerAvg = sum / corners.length;
  if (cornerAvg < 225) {
    // Not a white studio background — keep the photo exactly as it is.
    return { image: await sharp(product).rotate().png().toBuffer(), keyed: false };
  }

  // Flood from the border so light areas INSIDE the product survive.
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const isBg = (p: number) => {
    const i = p * channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const light = (r + g + b) / 3 > 232;
    const neutral = Math.max(r, g, b) - Math.min(r, g, b) < 18;
    return light && neutral;
  };
  for (let x = 0; x < width; x++) {
    stack.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    stack.push(y * width, y * width + width - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    if (p < 0 || p >= width * height || visited[p]) continue;
    if (!isBg(p)) continue;
    visited[p] = 1;
    data[p * channels + 3] = 0; // transparent
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - width);
    if (y < height - 1) stack.push(p + width);
  }

  const image = await sharp(data, { raw: { width, height, channels } })
    .trim({ threshold: 1 }) // drop the now-transparent margin
    .png()
    .toBuffer();
  return { image, keyed: true };
}

// A soft elliptical contact shadow, offset down-right to agree with the
// upper-left key light the background prompt specifies.
function shadowSvg(width: number, height: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <radialGradient id="s" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stop-color="#2d2b2b" stop-opacity="0.42"/>
          <stop offset="55%" stop-color="#2d2b2b" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#2d2b2b" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" fill="url(#s)"/>
    </svg>`
  );
}

export async function composeMockup(
  background: Buffer,
  product: Buffer,
  options: ComposeOptions = {}
): Promise<Buffer> {
  const scale = Math.min(0.9, Math.max(0.2, options.scale ?? 0.62));
  const baseline = Math.min(0.95, Math.max(0.4, options.baseline ?? 0.78));
  const withShadow = options.shadow !== false;

  const bg = sharp(background);
  const bgMeta = await bg.metadata();
  const frameW = bgMeta.width ?? 1024;
  const frameH = bgMeta.height ?? 1024;

  const { image: cut } = await cutout(product);
  const cutMeta = await sharp(cut).metadata();
  const cutW = cutMeta.width ?? 1;
  const cutH = cutMeta.height ?? 1;

  // Fit the product inside the frame by width, and cap its height so a tall
  // print doesn't run off the top of the scene.
  let targetW = Math.round(frameW * scale);
  let targetH = Math.round((cutH / cutW) * targetW);
  const maxH = Math.round(frameH * 0.66);
  if (targetH > maxH) {
    targetH = maxH;
    targetW = Math.round((cutW / cutH) * targetH);
  }
  const resized = await sharp(cut).resize(targetW, targetH, { fit: 'inside' }).png().toBuffer();

  const left = Math.round((frameW - targetW) / 2);
  const top = Math.round(frameH * baseline - targetH);

  const layers: OverlayOptions[] = [];

  if (withShadow) {
    const shW = Math.round(targetW * 1.18);
    const shH = Math.round(Math.max(18, targetH * 0.16));
    const shadow = await sharp(shadowSvg(shW, shH))
      .blur(Math.max(4, shW * 0.02))
      .png()
      .toBuffer();
    layers.push({
      input: shadow,
      left: Math.round(left + targetW / 2 - shW / 2 + targetW * 0.04), // offset right of centre
      top: Math.round(top + targetH - shH / 2),
    });
  }

  layers.push({ input: resized, left, top });

  return bg.composite(layers).jpeg({ quality: 90 }).toBuffer();
}
