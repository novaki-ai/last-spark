// Asset manifest + loading. All generated art ships inside dist via Vite imports.
const imageModules = import.meta.glob('../assets/gen/*.{png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const audioModules = import.meta.glob('../assets/audio/*.ogg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function byName(mods: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(mods).find((k) => k.endsWith('/' + name) || k.endsWith('/' + name.replace(/\.png$/, '.webp')));
  return key ? mods[key] : undefined;
}

export function imageUrl(name: string): string | undefined {
  return byName(imageModules, name);
}
export function audioUrl(name: string): string | undefined {
  return byName(audioModules, name);
}

const imageCache = new Map<string, HTMLImageElement>();

export async function loadImage(name: string): Promise<HTMLImageElement | null> {
  if (imageCache.has(name)) return imageCache.get(name)!;
  const url = imageUrl(name);
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(name, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Remove key-color fringe left over from transparency keying (magenta/purple halo).
export function despill(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a === 0) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    // magenta key color: high r & b, low g
    if (r > 90 && b > 90 && g < r * 0.62 && g < b * 0.62) {
      px[i + 3] = 0;
    }
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

// Pre-render a sprite to a fixed world-pixel size, normal + horizontally flipped,
// plus a tinted variant (for elites). Pads 12% for glow effects.
export interface SpriteSet {
  normal: HTMLCanvasElement;
  flipped: HTMLCanvasElement;
  w: number; // world width of drawn image
  h: number;
  anchorY: number; // fraction of height where feet are (draw offset)
}

export function makeSpriteSet(
  src: HTMLCanvasElement | HTMLImageElement,
  worldH: number,
  tint?: string,
): SpriteSet {
  const sw = src.width, sh = src.height;
  const scale = worldH / sh;
  const w = Math.max(2, Math.round(sw * scale));
  const h = worldH;
  const pad = Math.ceil(worldH * 0.14);
  const make = (flip: boolean, tintColor?: string) => {
    const c = document.createElement('canvas');
    c.width = w + pad * 2;
    c.height = h + pad * 2;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(pad, pad);
    if (flip) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(src, 0, 0, w, h);
    if (tintColor) {
      ctx.globalCompositeOperation = 'source-atop';
      // reset transform for full-canvas tint
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = tintColor;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    return c;
  };
  return { normal: make(false, tint), flipped: make(true, tint), w, h, anchorY: 0.86 };
}
