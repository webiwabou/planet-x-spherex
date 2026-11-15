"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  read: () => number;
  subscribe: (fn: () => void) => () => void;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  min: number;
  max: number;
  step: number;
  keyStep?: number;
  digits: number;
  format?: (value: number) => string;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function ScrubNumber({ label, read, subscribe, onChange, onCommit, min, max, step, keyStep = step, digits, format }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [editing, setEditing] = useState(false);
  const show = (v: number) => (format ? format(v) : v.toFixed(digits));

  // The number is written straight to the DOM so dragging it never re-renders React
  useEffect(() => {
    const el = ref.current;
    if (!el || editing) return;
    const paint = () => {
      const v = read();
      el.textContent = show(v);
      el.setAttribute("aria-valuenow", v.toFixed(digits));
      el.setAttribute("aria-valuetext", show(v));
    };
    paint();
    return subscribe(paint);
  });

  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (editing || e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.focus();
    let current = read();
    try {
      const lock = el.requestPointerLock?.() as unknown as Promise<void> | undefined;
      lock?.catch?.(() => {});
    } catch {
      // pointer lock is optional
    }
    const move = (m: PointerEvent) => {
      const scale = m.shiftKey ? 10 : m.altKey ? 0.1 : 1;
      current = clamp(current + m.movementX * step * scale, min, max);
      onChange(current);
    };
    const up = () => {
      try {
        if (document.pointerLockElement) document.exitPointerLock();
      } catch {
        // ignore
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onCommit?.(current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (dir) {
      e.preventDefault();
      e.stopPropagation();
      const next = clamp(read() + dir * keyStep * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1), min, max);
      onChange(next);
      onCommit?.(next);
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      setEditing(true);
    }
  };

  if (editing) {
    const commit = (text: string) => {
      const value = parseFloat(text.replace(",", "."));
      if (Number.isFinite(value)) {
        onChange(clamp(value, min, max));
        onCommit?.(clamp(value, min, max));
      }
      setEditing(false);
    };
    return (
      <input
        className="scrub-input"
        aria-label={label}
        defaultValue={read().toFixed(digits)}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <span
      ref={ref}
      className="scrub"
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => setEditing(true)}
    />
  );
}
