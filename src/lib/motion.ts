import { inertiaStep } from "./camera";
import type { Camera } from "./camera";
import { flightCamera, panView } from "./view";

type CameraStore = { get: () => Camera; set: (next: Camera | ((c: Camera) => Camera)) => void };

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createMotion(store: CameraStore) {
  let flight: { from: Camera; to: Camera; t0: number; ms: number; bump: number } | null = null;
  let seek: { from: number; to: number; t0: number; ms: number } | null = null;
  let glide: { vx: number; vy: number; last: number } | null = null;
  let frame = 0;

  const tick = (now: number) => {
    frame = 0;
    if (flight) {
      const f = flight;
      const t = Math.min(1, (now - f.t0) / f.ms);
      // A camera flight never moves time, so a concurrent seek or scrub keeps its own timestamp
      store.set((c) => ({ ...flightCamera(f.from, f.to, t, f.bump), timestamp: c.timestamp }));
      if (t >= 1) flight = null;
    }
    if (seek) {
      const s = seek;
      const t = Math.min(1, (now - s.t0) / s.ms);
      store.set((c) => ({ ...c, timestamp: s.from + (s.to - s.from) * easeInOut(t) }));
      if (t >= 1) seek = null;
    }
    if (glide) {
      const g = glide;
      const step = inertiaStep(g.vx, g.vy, Math.min(48, now - g.last));
      g.last = now;
      g.vx = step.vx;
      g.vy = step.vy;
      store.set((c) => panView(c, step.dx, step.dy));
      if (step.done) glide = null;
    }
    if (flight || seek || glide) frame = requestAnimationFrame(tick);
  };

  const kick = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  return {
    fly(to: Camera, ms: number, bump = 0) {
      glide = null;
      flight = { from: store.get(), to, t0: performance.now(), ms, bump };
      kick();
    },
    seek(time: number, ms: number) {
      seek = { from: store.get().timestamp, to: time, t0: performance.now(), ms };
      kick();
    },
    glide(vx: number, vy: number) {
      flight = null;
      glide = { vx, vy, last: performance.now() };
      kick();
    },
    stop() {
      flight = null;
      glide = null;
    },
    stopSeek() {
      seek = null;
    },
    get moving() {
      return flight !== null || glide !== null || seek !== null;
    },
  };
}

export type Motion = ReturnType<typeof createMotion>;
