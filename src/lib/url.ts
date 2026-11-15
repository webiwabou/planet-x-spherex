import { CoordinateError, parseCoordinates } from "./coords";
import { isDetectorId } from "./detectors";
import { isoDay, tangentOffset, worldOf } from "./sky";

export type UrlView = {
  raDeg: number;
  decDeg: number;
  fovArcmin: number;
  epochMs: number | null;
  detectorId: number | null;
  pitch: number;
  bearing: number;
};

const finite = (v: string | null) => (v !== null && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

export function readUrlView(search: URLSearchParams): UrlView | null {
  const ra = search.get("ra"), dec = search.get("dec");
  if (!ra || !dec) return null;
  let raDeg: number, decDeg: number;
  try {
    [raDeg, decDeg] = parseCoordinates(ra, dec);
  } catch (e) {
    if (e instanceof CoordinateError) return null;
    throw e;
  }
  const fov = finite(search.get("fov"));
  const epoch = search.get("epoch");
  const epochMs = epoch ? Date.parse(epoch.length === 10 ? `${epoch}T00:00:00Z` : epoch) : NaN;
  const det = finite(search.get("det"));
  return {
    raDeg,
    decDeg,
    fovArcmin: fov !== null && fov > 0 ? Math.min(60 * 400, fov) : 24,
    epochMs: Number.isFinite(epochMs) ? epochMs : null,
    detectorId: det !== null && isDetectorId(det) ? det : null,
    pitch: finite(search.get("pitch")) ?? 0,
    bearing: finite(search.get("bearing")) ?? 0,
  };
}

// Near a field the view centre is placed through that field's tangent plane, matching how plates are drawn
export function worldAt(raDeg: number, decDeg: number, field: { raDeg: number; decDeg: number; fovArcmin: number } | null): [number, number] {
  if (field) {
    const offset = tangentOffset(field.raDeg, field.decDeg, raDeg, decDeg);
    if (offset && Math.hypot(offset[0], offset[1]) < field.fovArcmin * 60 * 3) {
      const [wx, wy] = worldOf(field.raDeg, field.decDeg);
      return [wx - offset[0], wy - offset[1]];
    }
  }
  return worldOf(raDeg, decDeg);
}

export function writeUrlView(view: Omit<UrlView, "epochMs" | "detectorId"> & { epochMs?: number | null; detectorId?: number | null }) {
  const url = new URL(window.location.href);
  const p = url.searchParams;
  p.set("ra", view.raDeg.toFixed(5));
  p.set("dec", view.decDeg.toFixed(5));
  p.set("fov", view.fovArcmin >= 10 ? view.fovArcmin.toFixed(1) : view.fovArcmin.toFixed(2));
  // Undefined leaves the parameter as it is, for example while a restored field is still loading
  if (view.epochMs === null) p.delete("epoch");
  else if (view.epochMs !== undefined) p.set("epoch", isoDay(view.epochMs));
  if (view.detectorId === null) p.delete("det");
  else if (view.detectorId !== undefined) p.set("det", String(view.detectorId));
  if (Math.abs(view.pitch) > 0.001 || Math.abs(view.bearing) > 0.001) {
    p.set("pitch", view.pitch.toFixed(3));
    p.set("bearing", view.bearing.toFixed(3));
  } else {
    p.delete("pitch");
    p.delete("bearing");
  }
  const next = `${url.pathname}?${p.toString()}${url.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", next);
}
