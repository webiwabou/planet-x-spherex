"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { projector } from "@/lib/render/scene";
import { positionAt } from "@/lib/series";
import { formatDec, formatRA, worldOf } from "@/lib/sky";
import { useStoreValue } from "@/lib/store";
import { TARGETS, applyTargetCentres, fieldSpecOf, skyFieldSpec, targetByKey, targetNear } from "@/lib/targets";
import type { Target } from "@/lib/targets";
import { readUrlView, worldAt, writeUrlView } from "@/lib/url";
import { clampCamera, levelsOf, panView, unproject, zoomView } from "@/lib/view";
import {
  activeField,
  app,
  camera,
  dom,
  downloadFits,
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
  select,
  skyAt,
  stepDetector,
  stepVisit,
  toast,
  togglePlay,
  viewport,
  visitTarget,
  widenFieldIfNeeded,
} from "@/lib/viewer";
import { HelpSheet } from "./HelpSheet";
import { PlayButton } from "./PlayButton";
import { RadialMenu, radialCentre } from "./RadialMenu";
import type { RadialItem, RadialState } from "./RadialMenu";
import { Readout } from "./Readout";
import { SearchField } from "./SearchField";
import { SkyCanvas } from "./SkyCanvas";
import { SourceCard } from "./SourceCard";
import { Timeline } from "./Timeline";

const INTRO = "Pick a spot in the sky, watch it blink, and spot what moves. Each frame is a real SPHEREx infrared image of the same patch, taken months apart.";
const HINT = "Pinch or scroll to dive in. Click a ring to fly there.";
const TOUCH_HINT = "Pinch to dive in. Tap a ring to fly there.";

// A typed position inside a target's field uses that target's curated series
function visitPosition(raDeg: number, decDeg: number) {
  const target = targetNear(raDeg, decDeg);
  const detectorId = app.get().detectorId;
  const spec = target ? fieldSpecOf(target, detectorId) ?? fieldSpecOf(target) : skyFieldSpec(raDeg, decDeg, detectorId);
  if (!spec) return;
  select(null);
  void loadField(spec);
  const [x, y] = worldAt(raDeg, decDeg, target ? spec : null);
  const { zoom } = fieldCamera({ wx: x, wy: y, sizeArcsec: spec.fovArcmin * 60 });
  flyTo({ x, y, zoom, pitch: 0, bearing: 0 });
}

function ringAt(sx: number, sy: number): Target | null {
  const P = projector(camera.get(), viewport);
  return TARGETS.find((t) => {
    const [x, y] = P(...worldOf(t.raDeg, t.decDeg));
    return Math.hypot(x - sx, y - sy) < 18;
  }) ?? null;
}

function copyText(text: string) {
  const done = () => toast(`Copied ${text}`);
  try {
    navigator.clipboard.writeText(text).then(done, () => toast(text));
  } catch {
    toast(text);
  }
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

export function SkyBlink({ embed = false }: { embed?: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const touched = useStoreValue(app, (s) => s.touched);
  const toastState = useStoreValue(app, (s) => s.toast);
  const [help, setHelp] = useState(false);
  const [search, setSearch] = useState(false);
  const [radial, setRadial] = useState<RadialState>(null);
  const [introGone, setIntroGone] = useState(false);
  const [toastOn, setToastOn] = useState(false);
  const [hint, setHint] = useState(HINT);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) setHint(TOUCH_HINT);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("spatial-fullscreen");
    // Any pointer or key input counts as first use, which fades the intro
    const first = () => markTouched();
    window.addEventListener("pointerdown", first, true);
    window.addEventListener("keydown", first, true);
    return () => {
      document.documentElement.classList.remove("spatial-fullscreen");
      window.removeEventListener("pointerdown", first, true);
      window.removeEventListener("keydown", first, true);
    };
  }, []);

  useEffect(() => {
    if (!touched) return;
    const timer = setTimeout(() => setIntroGone(true), 2500);
    return () => clearTimeout(timer);
  }, [touched]);

  useEffect(() => {
    if (!toastState) return;
    setToastOn(true);
    const timer = setTimeout(() => setToastOn(false), 2400);
    return () => clearTimeout(timer);
  }, [toastState]);

  useEffect(() => {
    dom.stage = stage.current;
    const api = getApi();
    if (api.kind === "live") api.targets().then(applyTargetCentres, () => {});
    const restored = readUrlView(new URLSearchParams(window.location.search));
    if (restored) {
      const target = targetNear(restored.raDeg, restored.decDeg);
      const spec = target ? fieldSpecOf(target, restored.detectorId ?? undefined) ?? fieldSpecOf(target) : fieldSpecOf(TARGETS[0]);
      const [x, y] = worldAt(restored.raDeg, restored.decDeg, target);
      camera.set((c) =>
        clampCamera({ ...c, x, y, zoom: viewport.width / (restored.fovArcmin * 60), pitch: restored.pitch, bearing: restored.bearing, timestamp: restored.epochMs ?? c.timestamp }, limits()),
      );
      if (spec) void loadField(spec);
      return;
    }
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

  // The address mirrors the view once the camera has been idle for a moment
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const write = () => {
      const c = camera.get();
      const [raDeg, decDeg] = skyAt(c.x, c.y);
      const f = activeField();
      const epochMs = f ? (f.times.length ? f.times[Math.round(positionAt(f.times, c.timestamp))] : null) : undefined;
      writeUrlView({ raDeg, decDeg, fovArcmin: viewport.width / c.zoom / 60, epochMs, detectorId: f?.detectorId, pitch: c.pitch, bearing: c.bearing });
      if (levelsOf(c.zoom).macro < 0.5) widenFieldIfNeeded(c);
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(write, 400);
    };
    const unsubscribe = [camera.subscribe(schedule), app.subscribe(schedule)];
    return () => {
      clearTimeout(timer);
      unsubscribe.forEach((fn) => fn());
    };
  }, []);

  const closeRadial = useCallback(() => setRadial(null), []);
  const closeSearch = useCallback(() => setSearch(false), []);
  const closeFloating = useCallback(() => {
    setHelp(false);
    setRadial(null);
    setSearch(false);
  }, []);

  const actionsAt = useCallback((sx: number, sy: number): RadialItem[] => {
    const c = camera.get();
    const L = levelsOf(c.zoom);
    const [ra, dec] = skyAt(...unproject(c, viewport, sx, sy));
    const coords = `${formatRA(ra)} ${formatDec(dec)}`;
    const f = activeField();
    const many = !!f && f.visits.length > 1;
    // Phones hide the ? button, so the gesture sheet takes the menu slot of the visit before, which the timeline also offers
    const narrow = viewport.width < 640;
    const items: RadialItem[] = [];
    if (many) {
      items.push({ label: "Next visit", run: () => stepVisit(1) });
      if (!narrow) items.push({ label: "Visit before", run: () => stepVisit(-1) });
    }
    items.push({ label: "Copy coordinates", run: () => copyText(coords) });
    items.push({ label: "Copy a link", run: () => copyText(window.location.href) });
    items.push({ label: "Search the sky", run: () => setSearch(true) });
    if (f && f.visits.length && app.get().apiKind !== "mock") items.push({ label: "Download FITS", run: () => void downloadFits() });
    if (L.macro < 0.6) {
      const flat = c.pitch > 0.3;
      items.push({ label: flat ? "Lay the plate flat" : "Stand the plate up", run: () => flyTo({ pitch: flat ? 0 : 0.95, bearing: flat ? 0 : -0.35 }, 700) });
      items.push({ label: "Back to whole sky", run: () => flyTo(homeCamera()) });
    } else {
      const ring = ringAt(sx, sy);
      if (ring) items.push({ label: `Fly to ${ring.name}`, run: () => visitTarget(ring) });
    }
    if (narrow) items.push({ label: "Gestures", run: () => setHelp(true) });
    return items.slice(0, 8);
  }, []);

  const openRadial = useCallback(
    (sx: number, sy: number, viaKeyboard = false, viaTouch = false) => {
      const items = actionsAt(sx, sy);
      const [x, y] = radialCentre(sx, sy);
      setHelp(false);
      setRadial({ x, y, items, viaKeyboard, viaTouch });
    },
    [actionsAt],
  );
  const openRadialByTouch = useCallback((sx: number, sy: number) => openRadial(sx, sy, false, true), [openRadial]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const k = e.key;
      if (k === "Escape") {
        closeFloating();
        select(null);
        return;
      }
      if (k === "ContextMenu" || (k === "F10" && e.shiftKey)) {
        e.preventDefault();
        openRadial(viewport.width / 2, viewport.height / 2, true);
        return;
      }
      if (k === "?") {
        setHelp((h) => !h);
        e.preventDefault();
        return;
      }
      if (k === "/") {
        e.preventDefault();
        setRadial(null);
        setHelp(false);
        setSearch(true);
        return;
      }
      const t = e.target;
      const onSky = t === document.body || t === document.documentElement || (t instanceof HTMLElement && (t.classList.contains("stage") || t.classList.contains("timeline")));
      if (!onSky) return;
      const input = () => {
        motion.stop();
        markTouched();
        closeFloating();
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
      } else if (k === "," || k === ".") {
        stepDetector(k === "." ? 1 : -1);
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
  }, [closeFloating, openRadial]);

  // At the whole-sky level a click on a landmark ring flies there; closer in it selects a point on a field
  const onClick = useCallback((sx: number, sy: number) => {
    const c = camera.get();
    if (levelsOf(c.zoom).macro > 0.5) {
      const ring = ringAt(sx, sy);
      if (ring) visitTarget(ring);
      return;
    }
    const [wx, wy] = unproject(c, viewport, sx, sy);
    const hit = Object.values(app.get().fields).find((f) => Math.abs(wx - f.wx) <= f.sizeArcsec / 2 && Math.abs(wy - f.wy) <= f.sizeArcsec / 2);
    select(hit ? { key: hit.key, wx, wy } : null);
  }, []);

  return (
    <div ref={stage} className="sky-blink">
      <SkyCanvas area={stage} onInput={closeFloating} onClick={onClick} onContextMenu={openRadial} onLongPress={openRadialByTouch} />
      <SourceCard />
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
      <SearchField open={search} onClose={closeSearch} onTarget={visitTarget} onPosition={visitPosition} />
      <RadialMenu state={radial} onClose={closeRadial} />
      <div className="toast" role="status" data-on={toastOn}>
        {toastState?.text}
      </div>
      {!embed && (
        <div className="hint" data-gone={introGone}>
          {hint}
        </div>
      )}
      <PlayButton />
      <button type="button" className="menu-btn" aria-label="Actions" aria-haspopup="menu" onClick={() => openRadial(viewport.width / 2, viewport.height / 2, true)}>
        <svg viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="2.5" cy="7" r="1.5" />
          <circle cx="7" cy="7" r="1.5" />
          <circle cx="11.5" cy="7" r="1.5" />
        </svg>
      </button>
      <Timeline
        onInput={() => {
          markTouched();
          closeFloating();
        }}
      />
    </div>
  );
}
