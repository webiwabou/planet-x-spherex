import { lerpCamera, levelWeights, panBy, screenToWorld, worldToScreen, zoomAt } from "./camera";
import type { Camera, Limits, Viewport } from "./camera";

export type Levels = { macro: number; meso: number; micro: number };
export type LevelName = keyof Levels;

// Thresholds are log2 of screen pixels per arcsecond; the band is the crossfade half-width
export const ZOOM_LEVELS = { mesoStart: -1.6, microStart: 1.5, band: 0.55 } as const;

export const LEVEL_LABELS: Record<LevelName, string> = { macro: "Whole sky", meso: "Field", micro: "Pixels" };

export const PIXEL_ARCSEC = 6.15;
export const MAX_PITCH = 1.15;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const levelsOf = (zoom: number): Levels =>
  levelWeights(zoom, ZOOM_LEVELS.mesoStart, ZOOM_LEVELS.microStart, ZOOM_LEVELS.band);

export function levelOf(zoom: number): LevelName {
  const l = levelsOf(zoom);
  return l.micro > 0.5 ? "micro" : l.macro > 0.5 ? "macro" : "meso";
}

export function viewLimits(v: Viewport, minTime = -Infinity, maxTime = Infinity): Limits {
  const minZoom = Math.min(v.width / 380, Math.max(1, v.height - 120) / 200) / 3600;
  return { minZoom, maxZoom: 64 / PIXEL_ARCSEC, maxPitch: MAX_PITCH, minTime, maxTime };
}

export const clampPosition = (c: Camera): Camera => ({
  ...c,
  x: clamp(c.x, -10 * 3600, 370 * 3600),
  y: clamp(c.y, -95 * 3600, 95 * 3600),
});

// Pitch foreshortens the vertical axis about the screen centre; at pitch 0 these reduce to camera.ts
const unpitch = (c: Camera, v: Viewport, sy: number) => v.height / 2 + (sy - v.height / 2) / Math.cos(c.pitch);

export function project(c: Camera, v: Viewport, wx: number, wy: number, lift = 0): [number, number] {
  const [sx, sy] = worldToScreen(c, v, wx, wy);
  return [sx, v.height / 2 + (sy - v.height / 2) * Math.cos(c.pitch) - lift];
}

export const unproject = (c: Camera, v: Viewport, sx: number, sy: number) => screenToWorld(c, v, sx, unpitch(c, v, sy));

export const panView = (c: Camera, dx: number, dy: number) => clampPosition(panBy(c, dx, dy / Math.cos(c.pitch)));

export const zoomView = (c: Camera, v: Viewport, l: Limits, sx: number, sy: number, factor: number) =>
  clampPosition(zoomAt(c, v, l, sx, unpitch(c, v, sy), factor));

export const clampCamera = (c: Camera, l: Limits): Camera =>
  clampPosition({ ...c, zoom: clamp(c.zoom, l.minZoom, l.maxZoom), pitch: clamp(c.pitch, 0, l.maxPitch) });

// Canvas transform that maps world offsets from (wx, wy) onto the screen, including bearing, pitch and lift
export function planeTransform(c: Camera, v: Viewport, wx: number, wy: number, dpr: number, lift = 0) {
  const [sx, sy] = project(c, v, wx, wy, lift);
  const cb = Math.cos(c.bearing), sb = Math.sin(c.bearing), cp = Math.cos(c.pitch), z = c.zoom;
  return [cb * z * dpr, sb * z * cp * dpr, -sb * z * dpr, cb * z * cp * dpr, sx * dpr, sy * dpr] as const;
}

// Long jumps zoom out mid-flight (bump) so the user sees where they are going
export function flightCamera(a: Camera, b: Camera, t: number, bump = 0): Camera {
  const base = lerpCamera(a, b, t);
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const zoom = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * e - bump * Math.sin(Math.PI * e));
  const span = 1 / a.zoom - 1 / b.zoom;
  const even = Math.abs(Math.log(b.zoom / a.zoom)) > 0.3 && bump === 0 && span !== 0;
  const p = even ? clamp((1 / a.zoom - 1 / zoom) / span, 0, 1) : e;
  return { ...base, zoom, x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

export function flightPlan(a: Camera, b: Camera, v: Viewport) {
  const screens = (Math.hypot(b.x - a.x, b.y - a.y) * Math.min(a.zoom, b.zoom)) / Math.max(1, v.width);
  const zoomSteps = Math.abs(Math.log2(b.zoom / a.zoom));
  const ms = clamp(200 + 120 * Math.log2(1 + screens) + 45 * zoomSteps, 200, 900);
  const bump = clamp(Math.log(1 + screens) * 0.9, 0, 7);
  return { ms, bump: screens > 1.5 ? bump : 0 };
}
