"use client";

import { useEffect, useRef } from "react";
import { drawTimeline, pixelsPerVisit, timelineU, TIMELINE } from "@/lib/render/timeline";
import { forgetFont, readTheme } from "@/lib/render/theme";
import { positionAt } from "@/lib/series";
import { formatDate } from "@/lib/sky";
import { activeField, app, camera, scrubByPixels, scrubToPosition, snapTime, stepVisit } from "@/lib/viewer";

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
    let dragging: number | null = null;

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

    const tick = () => {
      if (dirty) {
        dirty = false;
        const c = camera.get();
        const field = activeField();
        drawTimeline({ ctx, dpr, width, height, theme, c, field, detectorId: field?.detectorId ?? app.get().detectorId, status: timelineStatus() });
        const n = field?.visits.length ?? 0;
        const u = field ? positionAt(field.times, c.timestamp) : 0;
        canvas.setAttribute("aria-valuemax", String(Math.max(0, n - 1)));
        canvas.setAttribute("aria-valuenow", u.toFixed(2));
        canvas.setAttribute("aria-valuetext", field && n ? `${formatDate(field.times[Math.round(u)])}, visit ${Math.round(u) + 1} of ${n}` : "No visits loaded");
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const local = (e: PointerEvent | WheelEvent) => e.clientX - canvas.getBoundingClientRect().left;
    const scrubTo = (x: number) => {
      const f = activeField();
      if (f) scrubToPosition(timelineU(width, f.visits.length, x));
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      input.current();
      canvas.setPointerCapture(e.pointerId);
      dragging = e.pointerId;
      scrubTo(local(e));
    };
    const onPointerMove = (e: PointerEvent) => {
      if (dragging === e.pointerId) scrubTo(local(e));
    };
    const onPointerUp = (e: PointerEvent) => {
      if (dragging !== e.pointerId) return;
      dragging = null;
      snapTime();
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

  return <canvas ref={ref} className="timeline" role="slider" tabIndex={0} aria-label="Time" aria-valuemin={0} />;
}
