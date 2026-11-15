import { smoothstep } from "./camera";
import { createSurface, paintPreview, stretchTable } from "./paint";
import { worldOf } from "./sky";
import type { FrameQuery, QuickLookFrame, QuickLookSeries } from "./types";

export type FieldSpec = {
  key: string;
  label: string;
  targetId: string | null;
  raDeg: number;
  decDeg: number;
  fovArcmin: number;
  detectorId: number;
  wavelengthUm: number;
  bandwidthUm: number;
  observationIds?: string[];
};

export type Visit = { time: number; frame: QuickLookFrame; surface: HTMLCanvasElement };

export type Field = FieldSpec & {
  series: QuickLookSeries;
  wx: number;
  wy: number;
  sizeArcsec: number;
  pixelArcsec: number;
  visits: Visit[];
  times: number[];
  stretch: number;
};

export const queryOf = (spec: FieldSpec): FrameQuery => ({
  ra: String(spec.raDeg),
  dec: String(spec.decDeg),
  fov_arcmin: spec.fovArcmin,
  detector_id: spec.detectorId,
  wavelength_um: spec.wavelengthUm,
  bandwidth_um: spec.bandwidthUm,
  ...(spec.observationIds?.length ? { observation_ids: spec.observationIds } : {}),
});

export function buildField(spec: FieldSpec, series: QuickLookSeries, stretch: number): Field {
  const table = stretchTable(stretch);
  const visits = series.frames
    .map((frame) => ({ time: Date.parse(frame.observation_time), frame }))
    .filter((v) => Number.isFinite(v.time))
    .sort((a, b) => a.time - b.time)
    .map((v) => {
      const surface = createSurface(series.width, series.height);
      paintPreview(surface, v.frame.preview, series.width, series.height, table);
      return { ...v, surface };
    });
  const [wx, wy] = worldOf(series.region.ra_deg, series.region.dec_deg);
  const sizeArcsec = series.region.fov_arcmin * 60;
  return {
    ...spec,
    raDeg: series.region.ra_deg,
    decDeg: series.region.dec_deg,
    series,
    wx,
    wy,
    sizeArcsec,
    pixelArcsec: sizeArcsec / series.width,
    visits,
    times: visits.map((v) => v.time),
    stretch,
  };
}

export function repaint(field: Field, stretch: number) {
  const table = stretchTable(stretch);
  for (const v of field.visits) paintPreview(v.surface, v.frame.preview, field.series.width, field.series.height, table);
  field.stretch = stretch;
}

// Visits sit at whole-number positions; the time axis is piecewise linear between them
export function positionAt(times: readonly number[], t: number): number {
  const n = times.length;
  if (n < 2 || t <= times[0]) return 0;
  if (t >= times[n - 1]) return n - 1;
  let i = 0;
  while (i < n - 2 && t >= times[i + 1]) i++;
  const span = times[i + 1] - times[i];
  return i + (span > 0 ? (t - times[i]) / span : 0);
}

export function timeAt(times: readonly number[], u: number): number {
  const n = times.length;
  if (n === 0) return 0;
  if (n === 1) return times[0];
  const k = Math.min(n - 1, Math.max(0, u));
  const i = Math.min(n - 2, Math.floor(k));
  return times[i] + (times[i + 1] - times[i]) * (k - i);
}

export function visitMix(count: number, u: number): { from: number; to: number; mix: number } {
  if (count < 2) return { from: 0, to: 0, mix: 0 };
  const from = Math.min(count - 1, Math.max(0, Math.floor(u)));
  const to = Math.min(count - 1, from + 1);
  return { from, to, mix: to === from ? 0 : smoothstep(0.4, 0.6, u - from) };
}

export const nearestVisit = (times: readonly number[], t: number) => Math.round(positionAt(times, t));
