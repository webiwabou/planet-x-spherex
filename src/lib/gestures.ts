import { createVelocityTracker, createWheelClassifier, tiltBy, wheelPixels, wheelZoomFactor } from "./camera";
import type { Camera, Limits, Viewport } from "./camera";
import { panView, zoomView } from "./view";

export type WheelMode = "auto" | "zoom" | "pan";

type Store = { get: () => Camera; set: (next: Camera | ((c: Camera) => Camera)) => void };

export type GestureOptions = {
  surface: HTMLElement;
  area: HTMLElement;
  store: Store;
  viewport: () => Viewport;
  limits: () => Limits;
  wheelMode: () => WheelMode;
  reduceMotion: () => boolean;
  onInput: () => void;
  onScrub: (dxPx: number) => void;
  onPointer: (sx: number, sy: number, inside: boolean) => void;
  onClick: (sx: number, sy: number) => void;
  onDoubleClick: (sx: number, sy: number, zoomOut: boolean) => void;
  onContextMenu: (sx: number, sy: number) => void;
  onGlide: (vx: number, vy: number) => void;
};

export function attachGestures(o: GestureOptions) {
  const classify = createWheelClassifier();
  const tracker = createVelocityTracker();
  let drag: { id: number; x: number; y: number; tilt: boolean; moved: number } | null = null;
  let lastMoved = 0;
  let pinchScale = 1;

  const local = (e: { clientX: number; clientY: number }) => {
    const r = o.surface.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const onWheel = (e: WheelEvent) => {
    if (e.target instanceof Element && e.target.closest("[data-native-scroll]")) return;
    e.preventDefault();
    o.onInput();
    const v = o.viewport();
    const [dx, dy] = wheelPixels(e, v);
    const [sx, sy] = local(e);
    let kind = classify(e);
    const mode = o.wheelMode();
    if ((kind === "zoom" || kind === "pan") && mode !== "auto") kind = mode;
    if (kind === "scrub") o.onScrub(dx || dy);
    else if (kind === "pan") o.store.set((c) => panView(c, -dx, -dy));
    else o.store.set((c) => zoomView(c, v, o.limits(), sx, sy, wheelZoomFactor(kind, dy)));
  };

  // Safari reports trackpad pinch through these non-standard events
  const onGestureStart = (e: Event) => {
    e.preventDefault();
    o.onInput();
    pinchScale = 1;
  };
  const onGestureChange = (e: Event) => {
    e.preventDefault();
    const g = e as Event & { scale: number; clientX: number; clientY: number };
    const [sx, sy] = local(g);
    o.store.set((c) => zoomView(c, o.viewport(), o.limits(), sx, sy, g.scale / pinchScale));
    pinchScale = g.scale;
  };
  const onGestureEnd = (e: Event) => e.preventDefault();

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    o.onInput();
    o.surface.focus({ preventScroll: true });
    o.surface.setPointerCapture(e.pointerId);
    o.surface.dataset.dragging = "true";
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, tilt: e.altKey, moved: 0 };
    tracker.reset();
    tracker.push(e.timeStamp, e.clientX, e.clientY);
  };

  const onPointerMove = (e: PointerEvent) => {
    const [sx, sy] = local(e);
    o.onPointer(sx, sy, true);
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.hypot(dx, dy);
    tracker.push(e.timeStamp, e.clientX, e.clientY);
    const tilt = drag.tilt;
    o.store.set((c) => (tilt ? tiltBy(c, o.limits(), dx, dy) : panView(c, dx, dy)));
  };

  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const wasTilt = drag.tilt;
    lastMoved = drag.moved;
    drag = null;
    o.surface.dataset.dragging = "false";
    if (wasTilt || o.reduceMotion()) return;
    const [vx, vy] = tracker.velocity(e.timeStamp);
    if (Math.hypot(vx, vy) >= 0.05) o.onGlide(vx, vy);
  };

  // A drag that moved more than 4 px must not also count as a click
  const onClick = (e: MouseEvent) => {
    if (lastMoved > 4 || e.detail > 1) return;
    const [sx, sy] = local(e);
    o.onClick(sx, sy);
  };
  const onDoubleClick = (e: MouseEvent) => {
    if (lastMoved > 4) return;
    const [sx, sy] = local(e);
    o.onDoubleClick(sx, sy, e.shiftKey);
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    o.onInput();
    const [sx, sy] = local(e);
    o.onContextMenu(sx, sy);
  };
  const onLeave = () => o.onPointer(-1, -1, false);

  const { area, surface } = o;
  area.addEventListener("wheel", onWheel, { passive: false });
  area.addEventListener("gesturestart", onGestureStart, { passive: false });
  area.addEventListener("gesturechange", onGestureChange, { passive: false });
  area.addEventListener("gestureend", onGestureEnd, { passive: false });
  surface.addEventListener("pointerdown", onPointerDown);
  surface.addEventListener("pointermove", onPointerMove);
  surface.addEventListener("pointerup", endDrag);
  surface.addEventListener("pointercancel", endDrag);
  surface.addEventListener("lostpointercapture", endDrag);
  surface.addEventListener("pointerleave", onLeave);
  surface.addEventListener("click", onClick);
  surface.addEventListener("dblclick", onDoubleClick);
  surface.addEventListener("contextmenu", onContextMenu);

  return () => {
    area.removeEventListener("wheel", onWheel);
    area.removeEventListener("gesturestart", onGestureStart);
    area.removeEventListener("gesturechange", onGestureChange);
    area.removeEventListener("gestureend", onGestureEnd);
    surface.removeEventListener("pointerdown", onPointerDown);
    surface.removeEventListener("pointermove", onPointerMove);
    surface.removeEventListener("pointerup", endDrag);
    surface.removeEventListener("pointercancel", endDrag);
    surface.removeEventListener("lostpointercapture", endDrag);
    surface.removeEventListener("pointerleave", onLeave);
    surface.removeEventListener("click", onClick);
    surface.removeEventListener("dblclick", onDoubleClick);
    surface.removeEventListener("contextmenu", onContextMenu);
  };
}
