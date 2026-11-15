import { apiKind, createApi } from "./api/client";
import type { ApiKind, SkyApi } from "./api/client";
import { ApiError, isAbort } from "./api/errors";
import { createCameraStore } from "./camera";
import type { Camera } from "./camera";
import type { WheelMode } from "./gestures";
import { createMotion } from "./motion";
import { STRETCH_MAX, STRETCH_MIN } from "./paint";
import { buildField, positionAt, queryOf, repaint, timeAt } from "./series";
import type { Field, FieldSpec } from "./series";
import { raDecOfOffset, raDecOfWorld, worldOf } from "./sky";
import { createStore } from "./store";
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

export type AppState = {
  apiKind: ApiKind;
  fields: Record<string, Field>;
  activeKey: string | null;
  load: LoadState;
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

let inflight: { key: string; detectorId: number; controller: AbortController; promise: Promise<Field | null> } | null = null;

export function loadField(spec: FieldSpec): Promise<Field | null> {
  if (inflight && inflight.key === spec.key && inflight.detectorId === spec.detectorId) return inflight.promise;
  inflight?.controller.abort();
  const controller = new AbortController();
  app.set({ load: { status: "loading", spec, startedAt: Date.now() }, detectorId: spec.detectorId });
  const promise = getApi()
    .frames(queryOf(spec), controller.signal)
    .then((series) => {
      const field = buildField(spec, series, app.get().stretch);
      const state = app.get();
      app.set({
        fields: { ...state.fields, [spec.key]: field },
        activeKey: state.activeKey ?? spec.key,
        load: { status: "idle" },
      });
      if (app.get().activeKey === spec.key) snapTime();
      return field;
    })
    .catch((error: unknown) => {
      if (isAbort(error) || controller.signal.aborted) return null;
      const e = error instanceof ApiError ? error : new ApiError("unknown", String(error));
      app.set({ load: { status: "error", spec, code: e.code, message: e.message, retryable: e.retryable } });
      return null;
    })
    .finally(() => {
      if (inflight?.controller === controller) inflight = null;
    });
  inflight = { key: spec.key, detectorId: spec.detectorId, controller, promise };
  return promise;
}

export function retryLoad() {
  const load = app.get().load;
  if (load.status === "error") void loadField(load.spec);
}

// The nearest loaded field to the view centre is the one the timeline and readout describe
export function nearestFieldKey(c: Camera): string | null {
  let best: string | null = null, bestDistance = Infinity;
  for (const [key, f] of Object.entries(app.get().fields)) {
    const d = Math.hypot(f.wx - c.x, f.wy - c.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = key;
    }
  }
  return best;
}
