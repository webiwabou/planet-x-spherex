export type Theme = {
  ground: string;
  ink: string;
  mute: string;
  line: string;
  signal: string;
  warn: string;
  panel: string;
  sans: string;
  serif: string;
};

const FALLBACK: Theme = {
  ground: "#1a1b1d",
  ink: "#ecebe6",
  mute: "#8f9196",
  line: "#3a3c40",
  signal: "#9fd0ee",
  warn: "#e8c26a",
  panel: "#232528",
  sans: "system-ui, sans-serif",
  serif: "Georgia, serif",
};

export function readTheme(): Theme {
  if (typeof document === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    ground: read("--ground", FALLBACK.ground),
    ink: read("--ink", FALLBACK.ink),
    mute: read("--mute", FALLBACK.mute),
    line: read("--line", FALLBACK.line),
    signal: read("--signal", FALLBACK.signal),
    warn: read("--warn", FALLBACK.warn),
    panel: read("--panel", FALLBACK.panel),
    sans: read("--font-sans", FALLBACK.sans),
    serif: read("--font-serif", FALLBACK.serif),
  };
}

const lastFont = new WeakMap<CanvasRenderingContext2D, string>();

// Re-parsing the same font string every frame is expensive, so only set it when it changes
export function setFont(ctx: CanvasRenderingContext2D, font: string) {
  if (lastFont.get(ctx) === font) return;
  ctx.font = font;
  lastFont.set(ctx, font);
}

// Resizing a canvas resets its context state, font included
export const forgetFont = (ctx: CanvasRenderingContext2D) => lastFont.delete(ctx);

export const sansFont =(t: Theme, px: number, weight = 500) => `${weight} ${px}px ${t.sans}`;
export const serifFont = (t: Theme, px: number, italic = true) => `${italic ? "italic " : ""}400 ${px}px ${t.serif}`;

export function rgbaOf(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}
