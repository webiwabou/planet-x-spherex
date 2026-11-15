type Rgb = [number, number, number];

function makeLut(stops: Rgb[]): Uint8Array {
  const lut = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(t));
    const f = t - k;
    for (let ch = 0; ch < 3; ch++) lut[i * 3 + ch] = Math.round(stops[k][ch] + (stops[k + 1][ch] - stops[k][ch]) * f);
  }
  return lut;
}

export const GRAPHITE_LUT = makeLut([
  [18, 19, 21],
  [66, 68, 72],
  [150, 150, 148],
  [246, 244, 238],
]);

export const STRETCH_MIN = 0.2;
export const STRETCH_MAX = 5;

let cached: { stretch: number; table: Uint8Array } | null = null;

// Stretch s maps v in 0..1 to asinh(k v) / asinh(k) with k = 10^s - 1, so small s is close to linear
export function stretchTable(stretch: number): Uint8Array {
  if (cached?.stretch === stretch) return cached.table;
  const k = Math.pow(10, stretch) - 1;
  const den = Math.asinh(k);
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) table[i] = Math.round((Math.asinh((k * i) / 255) / den) * 255);
  cached = { stretch, table };
  return table;
}

export function createSurface(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// Preview row 0 is the southern edge, so rows are flipped to put north at the top of the canvas
export function paintPreview(target: HTMLCanvasElement, preview: ArrayLike<number>, width: number, height: number, table: Uint8Array, lut = GRAPHITE_LUT) {
  const g = target.getContext("2d");
  if (!g) return;
  const image = g.createImageData(width, height);
  const out = image.data;
  for (let y = 0; y < height; y++) {
    const row = (height - 1 - y) * width;
    for (let x = 0; x < width; x++) {
      const value = preview[y * width + x];
      const o = (row + x) * 4;
      if (value < 0) {
        out[o + 3] = 0;
        continue;
      }
      const l = table[value > 255 ? 255 : value] * 3;
      out[o] = lut[l];
      out[o + 1] = lut[l + 1];
      out[o + 2] = lut[l + 2];
      out[o + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
}
