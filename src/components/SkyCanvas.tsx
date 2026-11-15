"use client";

import { useEffect, useRef } from "react";
import { attachGestures } from "@/lib/gestures";
import { drawScene } from "@/lib/render/scene";
import { forgetFont, readTheme } from "@/lib/render/theme";
import { clampCamera, levelsOf, zoomView } from "@/lib/view";
import {
  activeField,
  app,
  camera,
  emitFrame,
  flyTo,
  limits,
  markTouched,
  motion,
  nearestFieldKey,
  onFrameRequest,
  reduceMotion,
  scrubByPixels,
  setPointer,
  tickPlay,
  viewport,
} from "@/lib/viewer";

type Props = {
  area: React.RefObject<HTMLElement>;
  onInput: () => void;
  onClick?: (sx: number, sy: number) => void;
  onContextMenu?: (sx: number, sy: number) => void;
};

export function SkyCanvas({ area, onInput, onClick, onContextMenu }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const handlers = useRef({ onInput, onClick, onContextMenu });
  handlers.current = { onInput, onClick, onContextMenu };

  useEffect(() => {
    const canvas = ref.current;
    const root = area.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !root || !ctx) return;
    let theme = readTheme();
    let dpr = 1;
    let dirty = true;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewport.width = Math.max(1, canvas.clientWidth);
      viewport.height = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(viewport.width * dpr);
      canvas.height = Math.round(viewport.height * dpr);
      forgetFont(ctx);
      camera.set((c) => clampCamera(c, limits()));
      dirty = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const unsubscribe = [
      camera.subscribe(() => (dirty = true)),
      app.subscribe(() => (dirty = true)),
      onFrameRequest(() => (dirty = true)),
    ];
    document.fonts?.ready.then(() => {
      theme = readTheme();
      dirty = true;
    });

    const draw = () => {
      const c = camera.get();
      const L = levelsOf(c.zoom);
      const state = app.get();
      if (L.macro < 0.5) {
        const key = nearestFieldKey(c);
        if (key && key !== state.activeKey) app.set({ activeKey: key });
      }
      const pending = state.load.status === "loading" && !state.fields[state.load.spec.key] ? state.load.spec : null;
      drawScene({
        ctx,
        dpr,
        v: viewport,
        c,
        L,
        theme,
        fields: Object.values(state.fields),
        active: activeField(),
        pending,
        stretch: state.stretch,
      });
      emitFrame(c, L);
    };

    let frame = 0;
    const tick = (now: number) => {
      tickPlay(now);
      if (dirty) {
        dirty = false;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const detach = attachGestures({
      surface: canvas,
      area: root,
      store: camera,
      viewport: () => viewport,
      limits,
      wheelMode: () => app.get().wheelMode,
      reduceMotion,
      onInput: () => {
        motion.stop();
        markTouched();
        handlers.current.onInput();
      },
      onScrub: (dx) => scrubByPixels(dx),
      onPointer: setPointer,
      onClick: (sx, sy) => handlers.current.onClick?.(sx, sy),
      onDoubleClick: (sx, sy, out) => {
        const z = zoomView(camera.get(), viewport, limits(), sx, sy, out ? 0.5 : 2);
        flyTo({ x: z.x, y: z.y, zoom: z.zoom }, 260);
      },
      onContextMenu: (sx, sy) => handlers.current.onContextMenu?.(sx, sy),
      onGlide: (vx, vy) => motion.glide(vx, vy),
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe.forEach((fn) => fn());
      detach();
    };
  }, [area]);

  return (
    <canvas
      ref={ref}
      className="stage"
      tabIndex={0}
      role="application"
      aria-label="Sky canvas. Arrow keys pan, plus and minus zoom, square brackets step through the visits, space plays the blink."
    />
  );
}
