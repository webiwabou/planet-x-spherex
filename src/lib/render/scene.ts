import { smoothstep } from "../camera";
import type { Camera, Viewport } from "../camera";
import { stretchTable } from "../paint";
import { positionAt, visitMix } from "../series";
import type { Field } from "../series";
import { formatAngle, formatDate, galacticPlaneDec, worldOf } from "../sky";
import { TARGETS } from "../targets";
import { planeTransform, unproject } from "../view";
import type { Levels } from "../view";
import { sansFont, serifFont, setFont } from "./theme";
import type { Theme } from "./theme";

export type PendingField = { raDeg: number; decDeg: number; fovArcmin: number };

export type SceneInput = {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  v: Viewport;
  c: Camera;
  L: Levels;
  theme: Theme;
  fields: readonly Field[];
  active: Field | null;
  pending: PendingField | null;
  stretch: number;
};

const ARCSEC_PER_DEG = 3600;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Screen projection with the bearing and pitch terms computed once per frame
export function projector(c: Camera, v: Viewport) {
  const cb = Math.cos(c.bearing), sb = Math.sin(c.bearing), cp = Math.cos(c.pitch), z = c.zoom;
  const hw = v.width / 2, hh = v.height / 2;
  return (wx: number, wy: number, lift = 0): [number, number] => {
    const dx = (wx - c.x) * z, dy = (wy - c.y) * z;
    return [hw + dx * cb - dy * sb, hh + (dx * sb + dy * cb) * cp - lift];
  };
}

let speckles: Float32Array | null = null;

// Decorative whole-sky texture: denser along the Milky Way, positions are not real stars
function getSpeckles() {
  if (speckles) return speckles;
  const r = rng(42);
  const out = new Float32Array(7000 * 4);
  for (let i = 0; i < 7000; i++) {
    const ra = r() * 360;
    const dec = r() < 0.58 ? galacticPlaneDec(ra) + (r() + r() + r() - 1.5) * 16 : (Math.asin(r() * 2 - 1) * 180) / Math.PI;
    const [wx, wy] = worldOf(ra, clamp(dec, -89, 89));
    out.set([wx, wy, 0.4 + r() * r() * 1.5, 0.18 + r() * 0.6], i * 4);
  }
  speckles = out;
  return out;
}

const grains = new WeakMap<CanvasRenderingContext2D, CanvasPattern | null>();

function grain(ctx: CanvasRenderingContext2D) {
  if (grains.has(ctx)) return grains.get(ctx) ?? null;
  const tile = document.createElement("canvas");
  tile.width = tile.height = 160;
  const g = tile.getContext("2d");
  let pattern: CanvasPattern | null = null;
  if (g) {
    const im = g.createImageData(160, 160), r = rng(7);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = r() < 0.5 ? 255 : 0;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = r() * 16;
    }
    g.putImageData(im, 0, 0);
    pattern = ctx.createPattern(tile, "repeat");
  }
  grains.set(ctx, pattern);
  return pattern;
}

function drawSky(s: SceneInput, P: ReturnType<typeof projector>) {
  const { ctx, c, v, L, theme } = s;
  const zDeg = Math.log2(c.zoom * ARCSEC_PER_DEG);
  const far = 1 - smoothstep(9, 11, zDeg);
  if (far > 0.01) {
    const pts = getSpeckles();
    const grow = 1 + smoothstep(3, 9, zDeg) * 0.8;
    ctx.fillStyle = "#e9e7e0";
    for (let i = 0; i < pts.length; i += 4) {
      const [x, y] = P(pts[i], pts[i + 1]);
      if (x < -2 || y < -2 || x > v.width + 2 || y > v.height + 2) continue;
      ctx.globalAlpha = pts[i + 3] * far;
      const r = pts[i + 2] * grow;
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
    }
    ctx.globalAlpha = 1;
  }
  if (L.macro <= 0.02) return;
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.55 * L.macro;
  ctx.beginPath();
  for (let ra = 0; ra <= 360; ra += 30) {
    const a = P(...worldOf(ra, -90)), b = P(...worldOf(ra, 90));
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  for (let d = -90; d <= 90; d += 30) {
    const a = P(0, -d * ARCSEC_PER_DEG), b = P(360 * ARCSEC_PER_DEG, -d * ARCSEC_PER_DEG);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  ctx.fillStyle = theme.mute;
  ctx.globalAlpha = L.macro;
  setFont(ctx, sansFont(theme, 11));
  for (let ra = 0; ra < 360; ra += 60) {
    const p = P(...worldOf(ra, 90));
    ctx.fillText(`${ra / 15}h`, p[0] + 4, p[1] - 6);
  }
  for (const d of [-60, -30, 30, 60]) {
    const p = P(...worldOf(0, d));
    ctx.fillText(`${d > 0 ? "+" : "−"}${Math.abs(d)}°`, p[0] + 6, p[1] + 4);
  }
  const mw = P(...worldOf(300, galacticPlaneDec(300) + 14));
  setFont(ctx, serifFont(theme, 17));
  ctx.fillText("Milky Way", mw[0], mw[1]);
  setFont(ctx, sansFont(theme, 11));
  ctx.textAlign = "center";
  for (const [ra, dec, name] of [[270, 66.56, "Deep field, north ecliptic pole"], [90, -66.56, "Deep field, south ecliptic pole"]] as const) {
    const p = P(...worldOf(ra, dec));
    const r = 5 * ARCSEC_PER_DEG * c.zoom;
    ctx.strokeStyle = theme.mute;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(name, p[0], p[1] + r + 16);
  }
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}

function drawField(s: SceneInput, P: ReturnType<typeof projector>, f: Field, stack: boolean) {
  const { ctx, c, v, dpr, theme } = s;
  const size = c.zoom * f.sizeArcsec;
  const [fx, fy] = P(f.wx, f.wy);
  if (size <= 5 || fx < -size * 2 || fx > v.width + size * 2 || fy < -size * 2.5 || fy > v.height + size * 2.5) return;
  const fade = smoothstep(6, 60, size), h = f.sizeArcsec / 2, n = f.visits.length;
  const sp = Math.sin(c.pitch);
  const gap = clamp(size * 0.42, 40, 190);
  const u = positionAt(f.times, c.timestamp);
  ctx.imageSmoothingEnabled = false;
  const plate = (index: number, lift: number, alpha: number) => {
    ctx.setTransform(...planeTransform(c, v, f.wx, f.wy, dpr, lift));
    ctx.globalAlpha = alpha * fade;
    if (index >= 0) ctx.drawImage(f.visits[index].surface, -h, -h, f.sizeArcsec, f.sizeArcsec);
    ctx.lineWidth = 1 / c.zoom;
    ctx.strokeStyle = theme.mute;
    ctx.strokeRect(-h, -h, f.sizeArcsec, f.sizeArcsec);
  };
  if (n === 0) plate(-1, 0, 1);
  else if (stack && n > 1) {
    const current = Math.round(u);
    for (let e = 0; e < n; e++) plate(e, (e - u) * gap * sp, e === current ? 1 : 0.5);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = fade * smoothstep(0.04, 0.3, sp);
    ctx.fillStyle = theme.ink;
    setFont(ctx, sansFont(theme, 11));
    for (let e = 0; e < n; e++) {
      const p = P(f.wx + h, f.wy + h, (e - u) * gap * sp);
      ctx.fillText(formatDate(f.times[e]), p[0] + 8, p[1]);
    }
  } else {
    const { from, to, mix } = visitMix(n, u);
    plate(from, 0, 1);
    if (mix > 0.001) plate(to, 0, mix);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
}

function drawPending(s: SceneInput, P: ReturnType<typeof projector>, pending: PendingField) {
  const { ctx, c, theme } = s;
  const [wx, wy] = worldOf(pending.raDeg, pending.decDeg);
  const sizeArcsec = pending.fovArcmin * 60;
  const size = c.zoom * sizeArcsec;
  if (size < 5) return;
  const h = sizeArcsec / 2;
  const corners = [P(wx - h, wy - h), P(wx + h, wy - h), P(wx + h, wy + h), P(wx - h, wy + h)];
  ctx.globalAlpha = smoothstep(6, 60, size) * 0.8;
  ctx.strokeStyle = theme.mute;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function drawLandmarks(s: SceneInput, P: ReturnType<typeof projector>, stack: boolean) {
  const { ctx, c, L, theme, active } = s;
  for (const t of TARGETS) {
    const [wx, wy] = worldOf(t.raDeg, t.decDeg);
    const field = s.fields.find((f) => f.targetId === t.id);
    const sizeArcsec = field ? field.sizeArcsec : t.fovArcmin * 60;
    const size = c.zoom * sizeArcsec;
    const [x, y] = P(wx, wy);
    const far = 1 - smoothstep(20, 90, size);
    if (far > 0.01) {
      ctx.globalAlpha = far;
      ctx.strokeStyle = theme.signal;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = theme.ink;
      setFont(ctx, serifFont(theme, 19));
      ctx.fillText(t.name, x + 16, y + 2);
      ctx.fillStyle = theme.mute;
      setFont(ctx, sansFont(theme, 11));
      ctx.fillText(t.blurb, x + 16, y + 18);
      ctx.globalAlpha = 1;
    }
  }
  if (!active || stack) return;
  const size = c.zoom * active.sizeArcsec;
  if (1 - smoothstep(20, 90, size) > 0.01) return;
  const h = active.sizeArcsec / 2;
  const p = P(active.wx - h, active.wy - h);
  ctx.globalAlpha = 1 - L.micro;
  ctx.fillStyle = theme.ink;
  setFont(ctx, serifFont(theme, 20));
  ctx.fillText(active.label, p[0], p[1] - 10);
  ctx.globalAlpha = 1;
}

function drawPixels(s: SceneInput, P: ReturnType<typeof projector>, f: Field) {
  const { ctx, c, v, L, theme } = s;
  const W = f.series.width, H = f.series.height, px = f.pixelArcsec;
  const corners = [[0, 0], [v.width, 0], [0, v.height], [v.width, v.height]].map(([x, y]) => unproject(c, v, x, y));
  const cols = corners.map(([wx]) => (wx - f.wx) / px + W / 2);
  const rows = corners.map(([, wy]) => (wy - f.wy) / px + H / 2);
  const x0 = clamp(Math.floor(Math.min(...cols)), 0, W), x1 = clamp(Math.ceil(Math.max(...cols)), 0, W);
  const y0 = clamp(Math.floor(Math.min(...rows)), 0, H), y1 = clamp(Math.ceil(Math.max(...rows)), 0, H);
  if (x1 <= x0 || y1 <= y0) return;
  const at = (i: number, j: number) => P(f.wx + (i - W / 2) * px, f.wy + (j - H / 2) * px);
  ctx.strokeStyle = theme.line;
  ctx.globalAlpha = 0.7 * L.micro;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = x0; i <= x1; i++) {
    const a = at(i, y0), b = at(i, y1);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  for (let j = y0; j <= y1; j++) {
    const a = at(x0, j), b = at(x1, j);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  const cell = c.zoom * px;
  const limits = f.series.display_limits_mjy_sr;
  if (cell > 44 && (x1 - x0) * (y1 - y0) < 900 && limits && f.visits.length) {
    const visit = f.visits[Math.round(positionAt(f.times, c.timestamp))];
    const table = stretchTable(s.stretch);
    const [lo, hi] = limits;
    setFont(ctx, sansFont(theme, 11));
    ctx.textAlign = "center";
    ctx.globalAlpha = smoothstep(44, 56, cell) * L.micro;
    for (let j = y0; j < y1; j++) {
      for (let i = x0; i < x1; i++) {
        const value = visit.frame.preview[(H - 1 - j) * W + i];
        if (value < 0) continue;
        const mjy = lo + (value / 255) * (hi - lo);
        const prefix = value === 0 ? "≤" : value === 255 ? "≥" : "";
        const p = at(i + 0.5, j + 0.5);
        ctx.fillStyle = table[value] > 140 ? "#141516" : "#c9c8c3";
        ctx.fillText(prefix + mjy.toPrecision(3), p[0], p[1] + 4);
      }
    }
    ctx.textAlign = "left";
  }
  ctx.globalAlpha = 1;
}

const SCALE_STEPS = [1, 2, 5, 10, 20, 60, 120, 300, 600, 1800, 3600, 7200, 18000];

function drawScale(s: SceneInput, near: number) {
  const { ctx, c, v, theme } = s;
  let len = SCALE_STEPS[0];
  for (const step of SCALE_STEPS) if (step * c.zoom <= 150) len = step;
  const w = len * c.zoom, x = 64, y = v.height - 112;
  ctx.globalAlpha = near;
  ctx.strokeStyle = theme.ink;
  ctx.fillStyle = theme.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y - 5);
  ctx.stroke();
  setFont(ctx, sansFont(theme, 11));
  ctx.fillText(formatAngle(len), x, y - 9);
  const cx = 36, cy = v.height - 122, cp = Math.cos(c.pitch);
  const rot = (px: number, py: number): [number, number] => [px * Math.cos(c.bearing) - py * Math.sin(c.bearing), px * Math.sin(c.bearing) + py * Math.cos(c.bearing)];
  const n = rot(0, -16), e = rot(-12, 0);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + n[0], cy + n[1] * cp);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + e[0], cy + e[1] * cp);
  ctx.stroke();
  ctx.fillText("N", cx + n[0] * 1.5 - 4, cy + n[1] * 1.5 * cp + 4);
  ctx.fillText("E", cx + e[0] * 1.7 - 4, cy + e[1] * 1.7 * cp + 4);
  ctx.globalAlpha = 1;
}

export const isStacked = (c: Camera, L: Levels) => Math.sin(c.pitch) > 0.04 && L.macro < 0.6;

export function drawScene(s: SceneInput) {
  const { ctx, dpr, v, c, L, theme } = s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, 0, v.width, v.height);
  const pattern = grain(ctx);
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, v.width, v.height);
  }
  const P = projector(c, v);
  const stack = isStacked(c, L);
  drawSky(s, P);
  if (s.pending) drawPending(s, P, s.pending);
  for (const f of s.fields) drawField(s, P, f, stack);
  drawLandmarks(s, P, stack);
  if (s.active && L.micro > 0.02 && !stack) drawPixels(s, P, s.active);
  const near = 1 - L.macro;
  if (near > 0.3) drawScale(s, near);
}
