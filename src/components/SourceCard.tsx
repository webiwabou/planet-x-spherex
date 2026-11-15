"use client";

import { useEffect, useRef } from "react";
import { smoothstep } from "@/lib/camera";
import { flagWarnings } from "@/lib/flags";
import { positionAt } from "@/lib/series";
import type { Field } from "@/lib/series";
import { formatDec, formatRA } from "@/lib/sky";
import { useCameraValue, useStoreValue } from "@/lib/store";
import { targetById } from "@/lib/targets";
import { levelsOf, project } from "@/lib/view";
import { app, camera, onFrame, skyAt, viewport } from "@/lib/viewer";

const CARD_W = 268;

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
};

function anchorOf(field: Field, selection: { key: string; wx: number; wy: number } | null): [number, number] {
  return selection && selection.key === field.key ? [selection.wx, selection.wy] : [field.wx, field.wy];
}

// The preview value under a world point, turned back into MJy/sr on the series' shared scale
function valueAt(field: Field, visitIndex: number, wx: number, wy: number): string {
  const { width: W, height: H, display_limits_mjy_sr: limits } = field.series;
  const col = Math.floor((wx - field.wx) / field.pixelArcsec + W / 2);
  const row = Math.floor((wy - field.wy) / field.pixelArcsec + H / 2);
  const visit = field.visits[visitIndex];
  if (!visit || !limits || col < 0 || row < 0 || col >= W || row >= H) return "Outside the cutout";
  const v = visit.frame.preview[(H - 1 - row) * W + col];
  if (v < 0) return "No usable data here in this frame";
  const mjy = limits[0] + (v / 255) * (limits[1] - limits[0]);
  return `${v === 0 ? "≤ " : v === 255 ? "≥ " : ""}${mjy.toPrecision(3)} MJy/sr`;
}

export function SourceCard() {
  const ref = useRef<HTMLDivElement>(null);
  const field = useStoreValue(app, (s) => (s.activeKey ? s.fields[s.activeKey] ?? null : null));
  const selection = useStoreValue(app, (s) => s.selection);
  const near = useCameraValue(camera, (c) => levelsOf(c.zoom).micro > 0.01);
  const visitIndex = useCameraValue(camera, (c) => (field && field.times.length ? Math.round(positionAt(field.times, c.timestamp)) : -1));
  const selected = !!field && !!selection && selection.key === field.key;
  const visible = !!field && field.visits.length > 0 && (selected || near);

  useEffect(() => {
    if (!visible || !field) return;
    return onFrame((c) => {
      const el = ref.current;
      if (!el) return;
      const L = levelsOf(c.zoom);
      const alpha = selected ? 1 : smoothstep(0.35, 0.8, L.micro);
      const [wx, wy] = anchorOf(field, selection);
      const [sx, sy] = project(c, viewport, wx, wy);
      const x = Math.min(Math.max(8, sx + 22), viewport.width - CARD_W - 8);
      const y = Math.min(Math.max(8, sy - 30), viewport.height - el.offsetHeight - 96);
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.opacity = String(alpha);
      // Only a card the user asked for takes the pointer; the automatic one lets gestures reach the sky
      el.style.pointerEvents = selected && alpha >= 0.5 ? "auto" : "none";
      el.style.visibility = alpha < 0.02 ? "hidden" : "visible";
    });
  }, [visible, field, selection, selected]);

  if (!visible || !field || visitIndex < 0) return null;
  const visit = field.visits[visitIndex];
  if (!visit) return null;
  const frame = visit.frame;
  const target = targetById(field.targetId);
  const [wx, wy] = anchorOf(field, selection);
  const [ra, dec] = skyAt(wx, wy);
  const [lo, hi] = frame.effective_band_um;
  const first = frame.observations[0]?.observation;
  const warnings = flagWarnings(frame.observations);
  return (
    <div ref={ref} className="card" role="region" aria-label={`Visit ${visitIndex + 1} of ${field.visits.length}`} style={{ width: CARD_W }}>
      <h3>{field.label}</h3>
      <p>{selected ? "Selected point" : target?.blurb ?? "Field centre"}</p>
      <dl>
        <dt>Visit</dt>
        <dd>
          {formatWhen(frame.observation_time)}, {visitIndex + 1} of {field.visits.length}
        </dd>
        <dt>Detector</dt>
        <dd>
          D{field.detectorId}, {lo.toFixed(3)} to {hi.toFixed(3)} µm
        </dd>
        <dt>Position</dt>
        <dd className="tabular">
          {formatRA(ra)} {formatDec(dec)}
        </dd>
        <dt>Brightness</dt>
        <dd>{valueAt(field, visitIndex, wx, wy)}</dd>
        <dt>Stacked</dt>
        <dd>
          {frame.observations.length} {frame.observations.length === 1 ? "exposure" : "exposures"}
        </dd>
        {first && (
          <>
            <dt>Observation</dt>
            <dd>
              {first.release.toUpperCase()} {first.observation_id}
              {frame.observations.length > 1 ? ` and ${frame.observations.length - 1} more` : ""}
            </dd>
          </>
        )}
      </dl>
      {warnings.length > 0 && (
        <ul className="flags">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
