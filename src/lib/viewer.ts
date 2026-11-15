import { apiKind, createApi } from "./api/client";
import type { ApiKind, SkyApi } from "./api/client";
import { ApiError, isAbort } from "./api/errors";
import { archiveNotes } from "./archive-notes";
import { createCameraStore } from "./camera";
import type { Camera } from "./camera";
import type { WheelMode } from "./gestures";
import { createMotion } from "./motion";
import { STRETCH_MAX, STRETCH_MIN } from "./paint";
import { buildField, positionAt, queryOf, repaint, timeAt } from "./series";
import type { Field, FieldSpec } from "./series";
import { raDecOfOffset, raDecOfWorld, worldOf } from "./sky";
import { createStore } from "./store";
import { TARGETS, fieldSpecOf, skyFieldSpec, targetById } from "./targets";
import type { Target } from "./targets";
import type { ApiErrorCode } from "./types";
import { clampCamera, flightPlan, viewLimits } from "./view";
import type { Levels } from "./view";

export const camera = createCameraStore({ x: 180 * 3600, y: 0, zoom: 0.0005, pitch: 0, bearing: 0, timestamp: 0 });
export const motion = createMotion(camera);

// Mutable view facts that change every frame or on resize, kept out of React
export const viewport = { width: 1280, height: 800 };
export const pointer = { x: -1, y: -1, inside: false };
export const dom: { stage: HTMLElement | null } = { stage: null };

export type LoadState =
  | { status: "idle" }
  | { status: "loading"; spec: FieldSpec; startedAt: number }
  | { status: "error"; spec: FieldSpec; code: ApiErrorCode; message: string; retryable: boolean };

export type Selection = { key: string; wx: number; wy: number } | null;

export type AppState = {
  apiKind: ApiKind;
  fields: Record<string, Field>;
  activeKey: string | null;
  load: LoadState;
  selection: Selection;
  notice: string | null;
  detectorId: number;
  playing: boolean;
  stretch: number;
  rate: number;
  wheelMode: WheelMode;
  touched: boolean;
  help: boolean;
  toast: { text: string; at: number } | null;
};

export const app = createStore<AppState>({
  apiKind: "mock",
  fields: {},
  activeKey: null,
  load: { status: "idle" },
  selection: null,
  notice: null,
  detectorId: 3,
  playing: false,
  stretch: 1,
  rate: 2,
  wheelMode: "auto",
  touched: false,
  help: false,
  toast: null,
});

let frameRequest: () => void = () => {};
export function onFrameRequest(fn: () => void) {
  frameRequest = fn;
  return () => {
    if (frameRequest === fn) frameRequest = () => {};
  };
}
export const requestFrame = () => frameRequest();

type FrameListener = (c: Camera, levels: Levels) => void;
const frameListeners = new Set<FrameListener>();

// DOM overlays that follow the camera update here, once per drawn frame, instead of through React state
export function onFrame(fn: FrameListener) {
  frameListeners.add(fn);
  requestFrame();
  return () => {
    frameListeners.delete(fn);
  };
}
export const emitFrame = (c: Camera, levels: Levels) => frameListeners.forEach((fn) => fn(c, levels));

export function setPointer(x: number, y: number, inside: boolean) {
  pointer.x = x;
  pointer.y = y;
  pointer.inside = inside;
  requestFrame();
}

let api: SkyApi | null = null;
export function getApi(): SkyApi {
  if (!api) {
    const kind = apiKind(typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search));
    api = createApi(kind);
    app.set({ apiKind: kind });
  }
  return api;
}

export const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function activeField(): Field | null {
  const { fields, activeKey } = app.get();
  return activeKey ? fields[activeKey] ?? null : null;
}

// Near a field the plate is a true tangent plane, so positions there use the inverse gnomonic projection
export function skyAt(wx: number, wy: number): [number, number] {
  const f = activeField();
  if (f && Math.abs(wx - f.wx) < f.sizeArcsec * 3 && Math.abs(wy - f.wy) < f.sizeArcsec * 3) {
    return raDecOfOffset(f.raDeg, f.decDeg, -(wx - f.wx), -(wy - f.wy));
  }
  return raDecOfWorld(wx, wy);
}

export function limits() {
  const times = activeField()?.times ?? [];
  return viewLimits(viewport, times[0] ?? -Infinity, times[times.length - 1] ?? Infinity);
}

export function markTouched() {
  if (!app.get().touched) app.set({ touched: true });
}

export function toast(text: string) {
  app.set({ toast: { text, at: Date.now() } });
}

// Camera

export function fieldCamera(f: { wx: number; wy: number; sizeArcsec: number }) {
  return { x: f.wx, y: f.wy, zoom: (0.62 * Math.min(viewport.width, viewport.height - 120)) / f.sizeArcsec, pitch: 0, bearing: 0 };
}

export const homeCamera = () => ({ x: 180 * 3600, y: 0, zoom: limits().minZoom, pitch: 0, bearing: 0 });

export function flyTo(target: Partial<Camera>, ms?: number) {
  const from = camera.get();
  const to = clampCamera({ ...from, ...target, timestamp: from.timestamp }, limits());
  if (reduceMotion()) {
    motion.stop();
    camera.set((c) => ({ ...to, timestamp: c.timestamp }));
    dom.stage?.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
    return;
  }
  const plan = flightPlan(from, to, viewport);
  motion.fly(to, ms ?? plan.ms, ms === undefined ? plan.bump : 0);
}

export function flyToSpec(spec: FieldSpec) {
  const [wx, wy] = worldOf(spec.raDeg, spec.decDeg);
  flyTo(fieldCamera({ wx, wy, sizeArcsec: spec.fovArcmin * 60 }));
}

// The field of view is the zoom, written as the width of the view in arcminutes

export const viewWidthArcmin = () => viewport.width / camera.get().zoom / 60;

export function setViewWidth(arcmin: number) {
  motion.stop();
  camera.set((c) => clampCamera({ ...c, zoom: viewport.width / (Math.max(0.01, arcmin) * 60) }, limits()));
}

const FOV_SNAPS = [1, 2, 5, 10];

export function snapViewWidth(arcmin: number) {
  if (arcmin < 0.7 || arcmin > 14) return;
  const snap = FOV_SNAPS.reduce((best, s) => (Math.abs(Math.log(s / arcmin)) < Math.abs(Math.log(best / arcmin)) ? s : best));
  flyTo({ zoom: viewport.width / (snap * 60) }, 200);
}

// Time

let snapTimer: ReturnType<typeof setTimeout> | undefined;

export function pausePlay() {
  if (app.get().playing) app.set({ playing: false });
}

export function scrubByPixels(dxPx: number, pxPerVisit = 250) {
  const f = activeField();
  if (!f || f.times.length < 2) return;
  pausePlay();
  motion.stopSeek();
  camera.set((c) => ({ ...c, timestamp: timeAt(f.times, positionAt(f.times, c.timestamp) + dxPx / pxPerVisit) }));
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => snapTime(), 260);
}

export function scrubToPosition(u: number) {
  const f = activeField();
  if (!f || !f.times.length) return;
  pausePlay();
  motion.stopSeek();
  camera.set((c) => ({ ...c, timestamp: timeAt(f.times, u) }));
}

export function snapTime(ms = 200) {
  const f = activeField();
  if (!f || !f.times.length) return;
  const target = f.times[Math.round(positionAt(f.times, camera.get().timestamp))];
  if (Math.abs(target - camera.get().timestamp) < 1) return;
  if (reduceMotion()) camera.set((c) => ({ ...c, timestamp: target }));
  else motion.seek(target, ms);
}

export function stepVisit(dir: 1 | -1) {
  const f = activeField();
  if (!f || !f.times.length) return;
  pausePlay();
  const next = Math.min(f.times.length - 1, Math.max(0, Math.round(positionAt(f.times, camera.get().timestamp)) + dir));
  if (reduceMotion()) camera.set((c) => ({ ...c, timestamp: f.times[next] }));
  else motion.seek(f.times[next], 200);
}

let playClock = 0;

export function togglePlay() {
  const playing = !app.get().playing;
  playClock = performance.now();
  motion.stopSeek();
  app.set({ playing });
}

// Called once per animation frame by the canvas loop; each blink is an instant jump to the next visit
export function tickPlay(now: number) {
  const { playing, rate } = app.get();
  const f = activeField();
  if (!playing || !f || f.times.length < 2 || now - playClock < 1000 / rate) return;
  playClock = now;
  camera.set((c) => ({ ...c, timestamp: f.times[(Math.round(positionAt(f.times, c.timestamp)) + 1) % f.times.length] }));
}

// Settings

export function setStretch(value: number) {
  const stretch = Math.min(STRETCH_MAX, Math.max(STRETCH_MIN, value));
  for (const f of Object.values(app.get().fields)) repaint(f, stretch);
  app.set({ stretch });
}

export const setRate = (value: number) => app.set({ rate: Math.min(8, Math.max(0.5, value)) });

// Data

let inflight: { key: string; detectorId: number; fov: number; controller: AbortController; promise: Promise<Field | null> } | null = null;

export function loadField(spec: FieldSpec, quiet = false): Promise<Field | null> {
  if (inflight && inflight.key === spec.key && inflight.detectorId === spec.detectorId && inflight.fov === spec.fovArcmin) return inflight.promise;
  inflight?.controller.abort();
  const controller = new AbortController();
  const previous = app.get().fields[spec.key];
  app.set({ load: { status: "loading", spec, startedAt: Date.now() }, detectorId: spec.detectorId, notice: null });
  const promise = getApi()
    .frames(queryOf(spec), controller.signal)
    .then((series) => {
      // A detector with no matching visits keeps the frames already on screen
      if (previous && previous.visits.length && series.frames.length === 0) {
        app.set({ load: { status: "idle" }, detectorId: previous.detectorId, notice: `No two visits saw one D${spec.detectorId} channel here yet. Still showing D${previous.detectorId}.` });
        return previous;
      }
      const field = buildField(spec, series, app.get().stretch);
      const state = app.get();
      const { problems } = archiveNotes(series.warnings);
      app.set({
        fields: { ...state.fields, [spec.key]: field },
        activeKey: state.activeKey === null || inReach(field, camera.get()) ? spec.key : state.activeKey,
        load: { status: "idle" },
        notice: problems.length ? problems.join(" ") : state.notice,
      });
      if (app.get().activeKey === spec.key) snapTime();
      return field;
    })
    .catch((error: unknown) => {
      if (isAbort(error) || controller.signal.aborted) return null;
      const e = error instanceof ApiError ? error : new ApiError("unknown", String(error));
      const keep = previous && previous.detectorId !== spec.detectorId ? previous.detectorId : spec.detectorId;
      if (quiet) app.set({ load: { status: "idle" }, detectorId: keep });
      else app.set({ load: { status: "error", spec, code: e.code, message: e.message, retryable: e.retryable }, detectorId: keep });
      return null;
    })
    .finally(() => {
      if (inflight?.controller === controller) inflight = null;
    });
  inflight = { key: spec.key, detectorId: spec.detectorId, fov: spec.fovArcmin, controller, promise };
  return promise;
}

const MAX_CUTOUT_ARCMIN = 12;
const widened = new Set<string>();

// Zooming out past a live field's cutout asks once for the widest cutout the backend allows; the old frames stay meanwhile
export function widenFieldIfNeeded(c: Camera) {
  const f = activeField();
  if (!f || app.get().apiKind !== "live" || app.get().load.status === "loading") return;
  // A framed field fills 62% of the short side; only zooming out well past that asks for more sky
  if (f.fovArcmin >= MAX_CUTOUT_ARCMIN || c.zoom * f.sizeArcsec > 0.4 * Math.min(viewport.width, viewport.height - 120)) return;
  const id = `${f.key}|${f.detectorId}`;
  if (widened.has(id)) return;
  widened.add(id);
  const spec: FieldSpec = {
    key: f.key,
    label: f.label,
    targetId: f.targetId,
    raDeg: f.raDeg,
    decDeg: f.decDeg,
    fovArcmin: MAX_CUTOUT_ARCMIN,
    detectorId: f.detectorId,
    wavelengthUm: f.wavelengthUm,
    bandwidthUm: f.bandwidthUm,
    observationIds: f.observationIds,
  };
  void loadField(spec, true);
}

// Saves the processed series on screen as a multi-extension FITS file built by the backend
export async function downloadFits() {
  const f = activeField();
  if (!f || f.visits.length === 0) {
    toast("Load a field with frames first.");
    return;
  }
  toast("Preparing the FITS file…");
  try {
    const blob = await getApi().exportFits({ ...queryOf(f), fov_arcmin: f.series.region.fov_arcmin }, f.series.fits_url);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spherex-${f.targetId ?? "field"}-d${f.detectorId}.fits`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast("FITS file saved");
  } catch (e) {
    toast(e instanceof ApiError && e.message ? e.message : "The FITS file could not be prepared.");
  }
}

export function retryLoad() {
  const load = app.get().load;
  if (load.status === "error") void loadField(load.spec);
}

export const dismissLoadError = () => app.set({ load: { status: "idle" }, notice: null });

// Detector switching reloads the field; the old frames stay on screen until the new ones arrive
export function selectDetector(id: number) {
  const detectorId = Math.min(6, Math.max(1, Math.round(id)));
  const f = activeField();
  const load = app.get().load;
  const current = load.status === "loading" ? load.spec : f;
  if (!current) {
    app.set({ detectorId });
    return;
  }
  if (current.detectorId === detectorId && load.status !== "error") return;
  const target = targetById(current.targetId);
  const spec = (target && fieldSpecOf(target, detectorId)) ?? { ...skyFieldSpec(current.raDeg, current.decDeg, detectorId), key: current.key, label: current.label, targetId: current.targetId };
  void loadField(spec);
}

export function visitTarget(target: Target) {
  const spec = fieldSpecOf(target, app.get().detectorId) ?? fieldSpecOf(target);
  if (!spec) return;
  app.set({ selection: null });
  void loadField(spec);
  flyToSpec(spec);
}

export const stepDetector =(dir: 1 | -1) => selectDetector((app.get().load.status === "loading" ? app.get().detectorId : activeField()?.detectorId ?? app.get().detectorId) + dir);

export const select = (selection: Selection) => app.set({ selection });

export function nearestTarget(raDeg: number, decDeg: number) {
  let best = TARGETS[0], bestDistance = Infinity;
  for (const t of TARGETS) {
    const r = Math.PI / 180;
    const c = Math.sin(decDeg * r) * Math.sin(t.decDeg * r) + Math.cos(decDeg * r) * Math.cos(t.decDeg * r) * Math.cos((raDeg - t.raDeg) * r);
    const d = Math.acos(Math.min(1, Math.max(-1, c)));
    if (d < bestDistance) {
      bestDistance = d;
      best = t;
    }
  }
  return best;
}

const inReach = (f: { wx: number; wy: number; sizeArcsec: number }, c: Camera) =>
  Math.hypot(f.wx - c.x, f.wy - c.y) <= Math.max(2 * f.sizeArcsec, (0.5 * viewport.width) / c.zoom);

// The nearest loaded field within reach of the view is the one the timeline and readout describe
export function nearestFieldKey(c: Camera): string | null {
  let best: string | null = null, bestDistance = Infinity;
  for (const [key, f] of Object.entries(app.get().fields)) {
    const d = Math.hypot(f.wx - c.x, f.wy - c.y);
    if (d < bestDistance && inReach(f, c)) {
      bestDistance = d;
      best = key;
    }
  }
  return best;
}
