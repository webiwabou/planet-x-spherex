"use client";

import { useEffect, useRef } from "react";
import { camera, viewport } from "@/lib/viewer";

export type RadialItem = { label: string; run: () => void };
export type RadialState = { x: number; y: number; items: RadialItem[]; viaKeyboard: boolean; viaTouch?: boolean } | null;

const DEAD_ZONE = 24;

// On narrow screens the ring tightens horizontally and stretches vertically so every label stays on screen
const radii = () => (viewport.width < 640 ? { rx: Math.max(90, Math.min(150, viewport.width / 2 - 78)), ry: 132 } : { rx: 150, ry: 92 });

export function radialCentre(sx: number, sy: number): [number, number] {
  const { rx, ry } = radii();
  const marginX = rx + 80, marginY = ry + 38;
  const cx = Math.min(Math.max(sx, Math.min(marginX, viewport.width / 2)), Math.max(viewport.width - marginX, viewport.width / 2));
  const cy = Math.min(Math.max(sy, Math.min(marginY, viewport.height / 2)), Math.max(viewport.height - marginY - 84, viewport.height / 2));
  return [cx, cy];
}

export function RadialMenu({ state, onClose }: { state: RadialState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const hot = useRef(-1);

  useEffect(() => {
    if (!state) return;
    const el = ref.current;
    if (!el) return;
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("button"));
    const n = state.items.length;
    const setHot = (i: number) => {
      hot.current = i;
      buttons.forEach((b, k) => (b.dataset.hot = String(k === i)));
    };
    // The item is chosen by direction, so the pointer never has to land on a small target
    const { rx, ry } = radii();
    const hotAt = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = ((e.clientY - r.top) * rx) / ry;
      if (Math.hypot(dx, dy) < DEAD_ZONE) return -1;
      const a = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
      return Math.round(a / ((2 * Math.PI) / n)) % n;
    };
    const run = (i: number) => {
      onClose();
      state.items[i]?.run();
    };
    // The finger that long-pressed to open the menu can slide to an item and lift to choose it
    let liftPending = !!state.viaTouch;
    const onMove = (e: PointerEvent) => setHot(hotAt(e));
    const onUp = (e: PointerEvent) => {
      const lift = liftPending && e.pointerType === "touch";
      if (lift) liftPending = false;
      if (e.button !== 2 && !lift) return;
      const i = hotAt(e);
      if (i >= 0) {
        e.preventDefault();
        run(i);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 0 && !el.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (dir) {
        e.preventDefault();
        e.stopPropagation();
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = ((current < 0 ? (dir > 0 ? -1 : 0) : current) + dir + n) % n;
        buttons[next]?.focus();
        setHot(next);
      }
    };
    let last = camera.get();
    const unsubscribe = camera.subscribe(() => {
      const c = camera.get();
      if (c.x !== last.x || c.y !== last.y || c.zoom !== last.zoom || c.bearing !== last.bearing || c.pitch !== last.pitch) onClose();
      last = c;
    });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    if (state.viaKeyboard) buttons[0]?.focus();
    buttons.forEach((b, i) => (b.onclick = () => run(i)));
    return () => {
      unsubscribe();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [state, onClose]);

  if (!state) return null;
  const n = state.items.length;
  const { rx: RX, ry: RY } = radii();
  return (
    <div ref={ref} className="radial" role="menu" aria-label="Actions" style={{ transform: `translate(${state.x}px, ${state.y}px)` }}>
      <span className="hub" aria-hidden="true" />
      {state.items.map((item, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        return (
          <button key={item.label} type="button" role="menuitem" style={{ left: Math.cos(a) * RX, top: Math.sin(a) * RY }} onContextMenu={(e) => e.preventDefault()}>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
