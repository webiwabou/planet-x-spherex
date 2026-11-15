import type { Camera } from "../camera";
import { DETECTORS, WAVELENGTH_MAX_UM, WAVELENGTH_MIN_UM, detectorAt, formatRange } from "../detectors";
import type { Detector } from "../detectors";
import { positionAt } from "../series";
import type { Field } from "../series";
import { formatDate } from "../sky";
import { rgbaOf, sansFont, setFont } from "./theme";
import type { Theme } from "./theme";

// The left margin leaves room for the play and menu buttons
export const TIMELINE = { height: 84, left: 112, right: 28, line: 26, ribbon: 60 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const timelineSpan = (width: number) => Math.max(1, width - TIMELINE.left - TIMELINE.right);

export const timelineX = (width: number, count: number, u: number) =>
  TIMELINE.left + (count > 1 ? u / (count - 1) : 0) * timelineSpan(width);

export const timelineU = (width: number, count: number, x: number) =>
  count > 1 ? clamp((x - TIMELINE.left) / timelineSpan(width), 0, 1) * (count - 1) : 0;

export const pixelsPerVisit = (width: number, count: number) => (count > 1 ? timelineSpan(width) / (count - 1) : timelineSpan(width));

export function detectorUnder(width: number, x: number): Detector {
  const f = clamp((x - TIMELINE.left) / timelineSpan(width), 0, 0.999);
  return detectorAt(WAVELENGTH_MIN_UM + (WAVELENGTH_MAX_UM - WAVELENGTH_MIN_UM) * f);
}

export type TimelineInput = {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  width: number;
  height: number;
  theme: Theme;
  c: Camera;
  field: Field | null;
  detectorId: number;
  status: string | null;
  available: readonly number[] | null;
  pendingTicks: number;
  pulse: number;
};

export function drawTimeline(t: TimelineInput) {
  const { ctx, dpr, width: w, height: h, theme, c, field } = t;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, rgbaOf(theme.ground, 0));
  bg.addColorStop(0.4, rgbaOf(theme.ground, 1));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const n = field?.visits.length ?? 0;
  const y = TIMELINE.line;
  const x0 = TIMELINE.left, x1 = TIMELINE.left + timelineSpan(w);
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y + 0.5);
  ctx.lineTo(x1, y + 0.5);
  ctx.stroke();

  if (field && n > 0) {
    const u = positionAt(field.times, c.timestamp);
    const current = Math.round(u);
    for (let i = 0; i < n; i++) {
      const x = timelineX(w, n, i);
      ctx.fillStyle = i === current ? theme.ink : theme.mute;
      ctx.fillRect(x - 0.5, y - 5, 1, 11);
    }
    // The current visit's date is placed first; others are dropped where they would overlap on a narrow screen
    const placed: [number, number][] = [];
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(a - current) - Math.abs(b - current));
    for (const i of order) {
      const x = timelineX(w, n, i);
      const on = i === current;
      setFont(ctx, sansFont(theme, 11, on ? 600 : 400));
      const label = formatDate(field.times[i]);
      const width = ctx.measureText(label).width;
      const left = n === 1 || i === 0 ? x : i === n - 1 ? x - width : x - width / 2;
      if (placed.some(([a, b]) => left < b + 8 && left + width > a - 8)) continue;
      placed.push([left, left + width]);
      ctx.fillStyle = on ? theme.ink : theme.mute;
      ctx.fillText(label, left, y + 22);
    }
    const px = timelineX(w, n, u);
    ctx.fillStyle = theme.signal;
    ctx.beginPath();
    ctx.arc(px, y + 0.5, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(px - 0.75, y - 16, 1.5, 16);
  }
  // While a series loads, one dim tick per expected exposure pulses along the line
  if (t.pendingTicks > 0) {
    ctx.fillStyle = theme.mute;
    ctx.globalAlpha = 0.35 + 0.35 * t.pulse;
    for (let i = 0; i < t.pendingTicks; i++) {
      const x = t.pendingTicks > 1 ? x0 + (i / (t.pendingTicks - 1)) * (x1 - x0) : x0;
      ctx.fillRect(x - 0.5, y - 4, 1, 9);
    }
    ctx.globalAlpha = 1;
  }

  if (t.status) {
    ctx.fillStyle = theme.mute;
    setFont(ctx, sansFont(theme, 11, 400));
    ctx.textAlign = n > 0 ? "right" : "left";
    ctx.fillText(t.status, n > 0 ? x1 : x0, y - 10);
    ctx.textAlign = "left";
  }

  const y2 = TIMELINE.ribbon;
  const span = (um: number) => x0 + ((um - WAVELENGTH_MIN_UM) / (WAVELENGTH_MAX_UM - WAVELENGTH_MIN_UM)) * (x1 - x0);
  const dim = (id: number) => (id === t.detectorId || !t.available || t.available.includes(id) ? 1 : 0.45);
  for (const d of DETECTORS) {
    const on = d.id === t.detectorId;
    ctx.globalAlpha = dim(d.id);
    ctx.fillStyle = on ? theme.ink : theme.line;
    ctx.fillRect(span(d.minUm) + 1, y2, span(d.maxUm) - span(d.minUm) - 2, on ? 6 : 3);
  }
  // The selected detector's label with its range goes first; the others are skipped where they would collide
  const labels = [...DETECTORS].sort((a, b) => Number(b.id === t.detectorId) - Number(a.id === t.detectorId));
  const placed: [number, number][] = [];
  for (const d of labels) {
    const on = d.id === t.detectorId;
    setFont(ctx, sansFont(theme, 11, on ? 600 : 400));
    const text = on ? `${d.label}  ${formatRange(d)}` : d.label;
    const left = Math.min(span(d.minUm) + 2, x1 - ctx.measureText(text).width);
    const right = left + ctx.measureText(text).width;
    if (placed.some(([a, b]) => left < b + 6 && right > a - 6)) continue;
    placed.push([left, right]);
    ctx.globalAlpha = dim(d.id);
    ctx.fillStyle = on ? theme.ink : theme.mute;
    ctx.fillText(text, left, y2 + 19);
  }
  ctx.globalAlpha = 1;
}
