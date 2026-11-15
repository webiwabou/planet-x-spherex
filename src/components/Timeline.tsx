"use client";

import { useEffect, useRef } from "react";
import { detectorUnder, drawTimeline, pixelsPerVisit, timelineU, TIMELINE } from "@/lib/render/timeline";
import { forgetFont, readTheme } from "@/lib/render/theme";
import { positionAt } from "@/lib/series";
import { formatDate } from "@/lib/sky";
import { detectorsOf, targetById } from "@/lib/targets";
import { activeField, app, camera, scrubByPixels, scrubToPosition, selectDetector, snapTime, stepDetector, stepVisit } from "@/lib/viewer";

const BROWN_DWARFS = new Set(["wise_0855", "epsilon_indi_b"]);
const RIBBON_TOP = 50;

export function timelineStatus(): string | null {
  const { load } = app.get();
  if (load.status === "loading") return "Fetching SPHEREx images…";
  const f = activeField();
  if (f && f.visits.length === 0) return "No band-matched visits in this field";
  return null;
}

export function Timeline({ onInput }: { onInput: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const input = useRef(onInput);
  input.current = onInput;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let theme = readTheme();
    let dpr = 1, width = 1, dirty = true, frame = 0;
    let height: number = TIMELINE.height;
    let drag: { id: number; mode: "time" | "band" } | null = null;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, canvas.clientWidth);
      height = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      forgetFont(ctx);
      dirty = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const unsubscribe = [camera.subscribe(() => (dirty = true)), app.subscribe(() => (dirty = true))];
    document.fonts?.ready.then(() => {
      theme = readTheme();
      dirty = true;
    });

    const tick = (now: number) => {
      const { load, detectorId } = app.get();
      const loading = load.status === "loading";
      if (dirty || loading) {
        dirty = false;
        const c = camera.get();
        const field = activeField();
        const showing = loading ? load.spec : field;
        const target = targetById(showing?.targetId);
        drawTimeline({
          ctx,
          dpr,
          width,
          height,
          theme,
          c,
          field: loading && field?.key !== load.spec.key ? null : field,
          detectorId,
          status: timelineStatus(),
          available: target ? detectorsOf(target) : null,
          pendingTicks: loading && (!field || field.key !== load.spec.key) ? load.spec.observationIds?.length ?? 0 : 0,
          pulse: 0.5 + 0.5 * Math.sin(now / 260),
        });
        const n = field?.visits.length ?? 0;
        const u = field ? positionAt(field.times, c.timestamp) : 0;
        canvas.setAttribute("aria-valuemax", String(Math.max(0, n - 1)));
        canvas.setAttribute("aria-valuenow", u.toFixed(2));
        canvas.setAttribute("aria-valuetext", field && n ? `${formatDate(field.times[Math.round(u)])}, visit ${Math.round(u) + 1} of ${n}, detector D${field.detectorId}` : "No visits loaded");
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const scrubTo = (x: number) => {
      const f = activeField();
      if (f) scrubToPosition(timelineU(width, f.visits.length, x));
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      input.current();
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = local(e);
      drag = { id: e.pointerId, mode: y > RIBBON_TOP ? "band" : "time" };
      if (drag.mode === "time") scrubTo(x);
      else app.set({ detectorId: detectorUnder(width, x).id });
    };
    const onPointerMove = (e: PointerEvent) => {
      const [x, y] = local(e);
      const target = targetById(activeField()?.targetId);
      canvas.title = y > RIBBON_TOP ? (target && BROWN_DWARFS.has(target.id) ? "Cold brown dwarfs are brightest in D5 and D6" : "Drag along the wavelength ribbon to choose a detector") : "";
      if (!drag || drag.id !== e.pointerId) return;
      if (drag.mode === "time") scrubTo(x);
      else {
        const id = detectorUnder(width, x).id;
        if (id !== app.get().detectorId) app.set({ detectorId: id });
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const mode = drag.mode;
      drag = null;
      if (mode === "time") snapTime();
      else selectDetector(app.get().detectorId);
    };
    // A horizontal swipe here scrubs instead of panning the sky
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      input.current();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1;
      const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
      scrubByPixels(delta, pixelsPerVisit(width, activeField()?.visits.length ?? 0));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        stepVisit(e.key === "ArrowRight" ? 1 : -1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        stepDetector(e.key === "ArrowUp" ? 1 : -1);
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("lostpointercapture", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe.forEach((fn) => fn());
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("lostpointercapture", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="timeline"
      role="slider"
      tabIndex={0}
      aria-label="Time. Left and right arrows step through the visits, up and down change the detector."
      aria-valuemin={0}
    />
  );
}
