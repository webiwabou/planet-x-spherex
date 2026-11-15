export type Camera = { x: number; y: number; zoom: number; pitch: number; bearing: number; timestamp: number };
export type Viewport = { width: number; height: number };
export type Limits = { minZoom: number; maxZoom: number; maxPitch: number; minTime: number; maxTime: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rotate = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

export function screenToWorld(c: Camera, v: Viewport, sx: number, sy: number): [number, number] {
  const [rx, ry] = rotate(sx - v.width / 2, sy - v.height / 2, -c.bearing);
  return [c.x + rx / c.zoom, c.y + ry / c.zoom];
}

export function worldToScreen(c: Camera, v: Viewport, wx: number, wy: number): [number, number] {
  const [rx, ry] = rotate((wx - c.x) * c.zoom, (wy - c.y) * c.zoom, c.bearing);
  return [v.width / 2 + rx, v.height / 2 + ry];
}

export function panBy(c: Camera, dxScreen: number, dyScreen: number): Camera {
  const [rx, ry] = rotate(dxScreen, dyScreen, -c.bearing);
  return { ...c, x: c.x - rx / c.zoom, y: c.y - ry / c.zoom };
}

export function zoomAt(c: Camera, v: Viewport, l: Limits, sx: number, sy: number, factor: number): Camera {
  const [wx, wy] = screenToWorld(c, v, sx, sy);
  const zoom = clamp(c.zoom * factor, l.minZoom, l.maxZoom);
  const [rx, ry] = rotate(sx - v.width / 2, sy - v.height / 2, -c.bearing);
  return { ...c, zoom, x: wx - rx / zoom, y: wy - ry / zoom };
}

export function tiltBy(c: Camera, l: Limits, dxScreen: number, dyScreen: number): Camera {
  return { ...c, bearing: c.bearing + dxScreen * 0.005, pitch: clamp(c.pitch - dyScreen * 0.005, 0, l.maxPitch) };
}

export function scrubBy(c: Camera, l: Limits, dxScreen: number, msPerPx: number): Camera {
  return { ...c, timestamp: clamp(c.timestamp + dxScreen * msPerPx, l.minTime, l.maxTime) };
}

export type WheelKind = "pinch" | "scrub" | "zoom" | "pan";
export type WheelLike = { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; timeStamp: number; wheelDeltaY?: number };

export function createWheelClassifier(burstGapMs = 150) {
  let lastTime = -Infinity;
  let latchedMouse = false;
  return (e: WheelLike): WheelKind => {
    if (e.ctrlKey || e.metaKey) return "pinch";
    if (e.shiftKey) return "scrub";
    const legacy = e.wheelDeltaY;
    const looksLikeMouse = e.deltaMode !== 0 || (e.deltaX === 0 && e.deltaY !== 0 && (legacy !== undefined ? legacy % 120 === 0 : Math.abs(e.deltaY) >= 100));
    const newBurst = e.timeStamp - lastTime > burstGapMs;
    lastTime = e.timeStamp;
    latchedMouse = newBurst ? looksLikeMouse : latchedMouse && looksLikeMouse;
    return latchedMouse ? "zoom" : "pan";
  };
}

export function wheelPixels(e: WheelLike, v: Viewport): [number, number] {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? v.height : 1;
  return [e.deltaX * unit, e.deltaY * unit];
}

export function wheelZoomFactor(kind: WheelKind, dyPixels: number): number {
  const k = kind === "pinch" ? 0.01 : 0.0015;
  return Math.exp(-clamp(dyPixels, -120, 120) * k);
}

export function createVelocityTracker(windowMs = 100) {
  let samples: { t: number; x: number; y: number }[] = [];
  return {
    reset() { samples = []; },
    push(t: number, x: number, y: number) {
      samples.push({ t, x, y });
      while (samples.length > 2 && t - samples[0].t > windowMs) samples.shift();
    },
    velocity(now: number): [number, number] {
      if (samples.length < 2) return [0, 0];
      const a = samples[0], b = samples[samples.length - 1];
      const dt = b.t - a.t;
      if (dt <= 0 || now - b.t > 60) return [0, 0];
      return [(b.x - a.x) / dt, (b.y - a.y) / dt];
    },
  };
}

export function inertiaStep(vx: number, vy: number, dtMs: number, timeConstantMs = 325) {
  const decay = Math.exp(-dtMs / timeConstantMs);
  const move = timeConstantMs * (1 - decay);
  return { dx: vx * move, dy: vy * move, vx: vx * decay, vy: vy * decay, done: Math.hypot(vx * decay, vy * decay) < 0.01 };
}

export const smoothstep = (a: number, b: number, t: number) => { const u = clamp((t - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

export function levelWeights(zoom: number, mesoStart: number, microStart: number, band = 0.5) {
  const z = Math.log2(zoom);
  const toMeso = smoothstep(mesoStart - band, mesoStart + band, z);
  const toMicro = smoothstep(microStart - band, microStart + band, z);
  return { macro: 1 - toMeso, meso: toMeso * (1 - toMicro), micro: toMicro };
}

const shortestAngle = (from: number, to: number) => from + ((((to - from) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  const e = easeInOut(clamp(t, 0, 1));
  const zoom = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * e);
  const mix = (p: number, q: number) => p + (q - p) * e;
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), zoom, pitch: mix(a.pitch, b.pitch), bearing: mix(a.bearing, shortestAngle(a.bearing, b.bearing)), timestamp: mix(a.timestamp, b.timestamp) };
}

export function createCameraStore(initial: Camera) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: Camera | ((c: Camera) => Camera)) {
      const value = typeof next === "function" ? next(state) : next;
      if (value === state) return;
      state = value;
      listeners.forEach((fn) => fn());
    },
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}
