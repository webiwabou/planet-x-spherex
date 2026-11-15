"use client";

import { useEffect, useRef } from "react";
import { STRETCH_MAX, STRETCH_MIN } from "@/lib/paint";
import { positionAt } from "@/lib/series";
import { formatAngle, formatDate, formatDec, formatRA } from "@/lib/sky";
import { useCameraValue, useStoreValue } from "@/lib/store";
import { LEVEL_LABELS, levelOf, unproject } from "@/lib/view";
import {
  activeField,
  app,
  camera,
  onFrame,
  pointer,
  setRate,
  setStretch,
  setViewWidth,
  skyAt,
  snapViewWidth,
  viewport,
  viewWidthArcmin,
} from "@/lib/viewer";
import { ScrubNumber } from "./ScrubNumber";
import { StatusLine } from "./StatusLine";

export function Readout({ onHelp, helpOpen }: { onHelp: () => void; helpOpen: boolean }) {
  const level = useCameraValue(camera, (c) => levelOf(c.zoom));
  const apiKind = useStoreValue(app, (s) => s.apiKind);
  const where = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLSpanElement>(null);

  useEffect(
    () =>
      onFrame((c) => {
        const [wx, wy] = pointer.inside ? unproject(c, viewport, pointer.x, pointer.y) : [c.x, c.y];
        const [ra, dec] = skyAt(wx, wy);
        const f = activeField();
        const parts: string[] = [];
        if (f) parts.push(`D${f.detectorId} at ${f.wavelengthUm.toFixed(2)} µm`);
        if (f?.times.length) parts.push(formatDate(f.times[Math.round(positionAt(f.times, c.timestamp))]));
        if (where.current) where.current.textContent = `${formatRA(ra)}  ${formatDec(dec)}`;
        // The changing words come first so the draggable width stays put at the right edge
        if (detail.current) detail.current.textContent = parts.length ? `${parts.join(", ")}, view is ` : "View is ";
      }),
    [],
  );

  return (
    <div className="readout">
      <div className="level">{LEVEL_LABELS[level]}</div>
      <div ref={where} className="tabular" />
      <div className="dim tabular view-line">
        <span ref={detail}>View is </span>
        <ScrubNumber
          label="Width of the view"
          read={viewWidthArcmin}
          subscribe={camera.subscribe}
          onChange={setViewWidth}
          onCommit={snapViewWidth}
          min={0.25}
          max={60 * 400}
          step={0.01}
          keyStep={0.35}
          digits={2}
          format={(arcmin) => formatAngle(arcmin * 60)}
          logScale
        />{" "}
        wide
      </div>
      <StatusLine />
      <div className="row">
        <span>
          Stretch{" "}
          <ScrubNumber
            label="Image stretch"
            read={() => app.get().stretch}
            subscribe={app.subscribe}
            onChange={setStretch}
            min={STRETCH_MIN}
            max={STRETCH_MAX}
            step={0.01}
            keyStep={0.05}
            digits={2}
          />
        </span>
        <span>
          Blinks a second{" "}
          <ScrubNumber
            label="Blinks a second"
            read={() => app.get().rate}
            subscribe={app.subscribe}
            onChange={setRate}
            min={0.5}
            max={8}
            step={0.02}
            keyStep={0.1}
            digits={1}
          />
        </span>
      </div>
      <div className="dim provenance">
        {apiKind === "live" ? "SPHEREx DR1 and QR3, live from IRSA" : apiKind === "auto" ? "SPHEREx DR1 and QR3, recorded targets, live search" : "SPHEREx DR1 and QR3, recorded frames"}
      </div>
      <button type="button" className="help-btn" aria-label="Show gestures" aria-expanded={helpOpen} onClick={onHelp}>
        ?
      </button>
    </div>
  );
}
