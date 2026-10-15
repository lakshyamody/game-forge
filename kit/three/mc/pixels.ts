/**
 * Pixel-art helpers shared by the Minecraft kit: paint small canvases pixel by pixel, turn them into crisp
 * (NearestFilter, sRGB, no mipmaps) textures, load library PNGs, and the colour maths every painter uses.
 *
 *   const c = paint(16, 16, (x, y, r) => vary(rgb(0x5f9f35), r, 30));   // r = seeded random 0..1 per pixel
 *   const tex = pixelTexture(c);
 *   const img = await loadImage(assetUrl('sprites/mc-blocks/natural/oak_planks.png'));
 */
import * as THREE from 'three';
import { Rng } from '@kit/rng';

export type RGB = [number, number, number];
export const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
export const hex = (c: RGB) => ((clamp255(c[0]) << 16) | (clamp255(c[1]) << 8) | clamp255(c[2])) >>> 0;
const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
/** brightness jitter: r in 0..1, amt = total spread in 0..255 */
export const vary = (c: RGB, r: number, amt: number): RGB => { const k = (r - 0.5) * amt; return [c[0] + k, c[1] + k, c[2] + k]; };
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const css = (c: RGB, a = 1) => `rgba(${clamp255(c[0])},${clamp255(c[1])},${clamp255(c[2])},${a})`;

/** A w×h canvas filled pixel by pixel. fn returns a colour, or null for transparent. Seeded by `seed` so it's stable. */
export function paint(w: number, h: number, fn: (x: number, y: number, r: number, rng: Rng) => RGB | null, seed = `${w}x${h}`) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!, img = g.createImageData(w, h), rng = new Rng(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = fn(x, y, rng.next(), rng), i = (y * w + x) * 4;
    if (!col) continue;
    img.data[i] = clamp255(col[0]); img.data[i + 1] = clamp255(col[1]); img.data[i + 2] = clamp255(col[2]); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Crisp pixel texture from a canvas (or image). */
export function pixelTexture(src: HTMLCanvasElement | HTMLImageElement, repeat = 0) {
  const t = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.needsUpdate = true;
  return t;
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();
export function loadImage(url: string) {
  let p = imgCache.get(url);
  if (!p) {
    p = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`image failed: ${url}`)); i.src = url; });
    imgCache.set(url, p);
  }
  return p;
}

/** Read an image's pixels (for extruding item sprites into 3D, or sampling colours). Downscales to w×h first if given. */
export function pixelsOf(img: HTMLImageElement | HTMLCanvasElement, w = img.width, h = img.height) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = w < img.width;   // averaging when shrinking keeps a 128px sprite readable at 16px
  g.drawImage(img, 0, 0, w, h);
  return { w, h, data: g.getImageData(0, 0, w, h).data, canvas: c };
}

/** Flat-shaded lit material for pixel art (Minecraft look: no shine). */
export const pixelMaterial = (map: THREE.Texture, o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ map, ...o });
