"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { projector } from "@/lib/render/scene";
import { worldOf } from "@/lib/sky";
import { useStoreValue } from "@/lib/store";
import { TARGETS, fieldSpecOf, targetByKey } from "@/lib/targets";
import type { Target } from "@/lib/targets";
import { levelsOf, panView, zoomView } from "@/lib/view";
import {
  app,
  camera,
  dom,
  fieldCamera,
  flyTo,
  flyToSpec,
  getApi,
  homeCamera,
  limits,
  loadField,
  markTouched,
  motion,
  reduceMotion,
  stepVisit,
  togglePlay,
  viewport,
} from "@/lib/viewer";
import { HelpSheet } from "./HelpSheet";
import { PlayButton } from "./PlayButton";
import { Readout } from "./Readout";
import { SkyCanvas } from "./SkyCanvas";
import { Timeline } from "./Timeline";

const INTRO = "Pick a spot in the sky, watch it blink, and spot what moves. Each frame is a real SPHEREx infrared image of the same patch, taken months apart.";
const HINT = "Pinch or scroll to dive in. Click a ring to fly there.";

function visitTarget(target: Target) {
  const spec = fieldSpecOf(target, app.get().detectorId) ?? fieldSpecOf(target);
  if (!spec) return;
  void loadField(spec);
  flyToSpec(spec);
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

export function SkyBlink({ embed = false }: { embed?: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const touched = useStoreValue(app, (s) => s.touched);
  const toast = useStoreValue(app, (s) => s.toast);
  const [help, setHelp] = useState(false);
  const [introGone, setIntroGone] = useState(false);
  const [toastOn, setToastOn] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("spatial-fullscreen");
    return () => document.documentElement.classList.remove("spatial-fullscreen");
  }, []);

  useEffect(() => {
    if (!touched) return;
    const timer = setTimeout(() => setIntroGone(true), 2500);
    return () => clearTimeout(timer);
  }, [touched]);

  useEffect(() => {
    if (!toast) return;
    setToastOn(true);
    const timer = setTimeout(() => setToastOn(false), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    dom.stage = stage.current;
    getApi();
    const spec = fieldSpecOf(TARGETS[0]);
    camera.set((c) => ({ ...c, ...homeCamera() }));
    if (!spec) return;
    void loadField(spec);
    if (reduceMotion()) {
      const [wx, wy] = worldOf(spec.raDeg, spec.decDeg);
      camera.set((c) => ({ ...c, ...fieldCamera({ wx, wy, sizeArcsec: spec.fovArcmin * 60 }) }));
      return;
    }
    const timer = setTimeout(() => {
      if (!app.get().touched) flyToSpec(spec);
    }, 900);
    return () => clearTimeout(timer);
  }, []);

  const closeFloating = useCallback(() => setHelp(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const k = e.key;
      if (k === "Escape") {
        closeFloating();
        return;
      }
      const t = e.target;
      const onSky = t === document.body || t === document.documentElement || (t instanceof HTMLElement && (t.classList.contains("stage") || t.classList.contains("timeline")));
      if (k === "?") {
        setHelp((h) => !h);
        e.preventDefault();
        return;
      }
      if (!onSky) return;
      const input = () => {
        motion.stop();
        markTouched();
      };
      const pan = (dx: number, dy: number) => {
        input();
        const next = panView(camera.get(), dx, dy);
        flyTo({ x: next.x, y: next.y }, 200);
      };
      const zoom = (factor: number) => {
        input();
        const z = zoomView(camera.get(), viewport, limits(), viewport.width / 2, viewport.height / 2, factor);
        flyTo({ x: z.x, y: z.y, zoom: z.zoom }, 200);
      };
      if (k === "ArrowLeft") pan(120, 0);
      else if (k === "ArrowRight") pan(-120, 0);
      else if (k === "ArrowUp") pan(0, 120);
      else if (k === "ArrowDown") pan(0, -120);
      else if (k === "+" || k === "=") zoom(1.6);
      else if (k === "-" || k === "_") zoom(1 / 1.6);
      else if (k === "[" || k === "]") {
        markTouched();
        stepVisit(k === "]" ? 1 : -1);
      } else if (k === " ") {
        markTouched();
        togglePlay();
      } else if (k === "0") {
        input();
        flyTo(homeCamera());
      } else if (k >= "1" && k <= "5") {
        const target = targetByKey(Number(k));
        if (!target) return;
        input();
        visitTarget(target);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeFloating]);

  // At the whole-sky level a click on a landmark ring flies there
  const onClick = useCallback((sx: number, sy: number) => {
    const c = camera.get();
    if (levelsOf(c.zoom).macro <= 0.5) return;
    const P = projector(c, viewport);
    for (const target of TARGETS) {
      const [x, y] = P(...worldOf(target.raDeg, target.decDeg));
      if (Math.hypot(x - sx, y - sy) < 18) {
        visitTarget(target);
        return;
      }
    }
  }, []);

  return (
    <div ref={stage} className="sky-blink">
      <SkyCanvas area={stage} onInput={closeFloating} onClick={onClick} />
      {!embed && (
        <div className="brand">
          <h1>SPHEREx Sky Blink</h1>
          <p className="intro" data-gone={introGone}>
            {INTRO}
          </p>
        </div>
      )}
      <Readout onHelp={() => setHelp((h) => !h)} helpOpen={help} />
      <HelpSheet open={help} />
      <div className="toast" role="status" data-on={toastOn}>
        {toast?.text}
      </div>
      {!embed && (
        <div className="hint" data-gone={introGone}>
          {HINT}
        </div>
      )}
      <PlayButton />
      <Timeline onInput={() => {
        markTouched();
        closeFloating();
      }} />
    </div>
  );
}
