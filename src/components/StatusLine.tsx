"use client";

import { useEffect, useRef } from "react";
import { archiveNotes } from "@/lib/archive-notes";
import { useStoreValue } from "@/lib/store";
import type { ApiErrorCode } from "@/lib/types";
import { app, dismissLoadError, nearestTarget, retryLoad, visitTarget } from "@/lib/viewer";

const MESSAGES: Record<ApiErrorCode, string> = {
  archive_unavailable: "The SPHEREx archive at IRSA is not answering right now.",
  network: "The SPHEREx service cannot be reached.",
  invalid_coordinates: "Those coordinates are not valid.",
  invalid_request: "The service did not accept this request.",
  unusable_series: "These observations cannot be combined into one series.",
  observations_missing: "The archive no longer lists some of this field's observations.",
  observation_not_found: "The archive no longer lists this observation.",
  search_truncated: "This field has too many observations to search at once.",
  invalid_fits_metadata: "IRSA sent a cutout that could not be read.",
  no_fixture: "Recorded frames cover only the five NASA targets.",
  aborted: "The request was cancelled.",
  unknown: "Something went wrong while fetching the images.",
};

function Elapsed({ since }: { since: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tick = () => {
      const s = Math.floor((Date.now() - since) / 1000);
      if (ref.current) ref.current.textContent = s >= 2 ? `, ${s} s` : "";
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [since]);
  return <span ref={ref} />;
}

export function StatusLine() {
  const load = useStoreValue(app, (s) => s.load);
  const notice = useStoreValue(app, (s) => s.notice);
  const emptyField = useStoreValue(app, (s) => {
    const f = s.activeKey ? s.fields[s.activeKey] : null;
    return f && f.visits.length === 0 ? f : null;
  });

  if (load.status === "loading") {
    return (
      <div className="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        Fetching SPHEREx images
        <Elapsed since={load.startedAt} />…
      </div>
    );
  }

  if (load.status === "error") {
    const near = nearestTarget(load.spec.raDeg, load.spec.decDeg);
    const showNearest = !load.spec.targetId;
    // The recorded set says which detectors it has for this field, which is more useful than the general message
    const headline = load.code === "no_fixture" && load.message ? load.message : MESSAGES[load.code];
    return (
      <div className="status" data-tone="warn" role="alert">
        <span>{headline}</span>
        {load.code === "no_fixture" && <span className="status-detail">Add ?data=live to the address to search the archive.</span>}
        {load.message && load.code !== "no_fixture" && load.code !== "network" && <span className="status-detail">{load.message}</span>}
        <span className="status-actions">
          {load.retryable && (
            <button type="button" onClick={retryLoad}>
              Try again
            </button>
          )}
          {showNearest && near.id !== load.spec.targetId && (
            <button type="button" onClick={() => visitTarget(near)}>
              Fly to {near.name}
            </button>
          )}
          <button type="button" onClick={dismissLoadError}>
            Dismiss
          </button>
        </span>
      </div>
    );
  }

  if (notice) {
    return (
      <div className="status" aria-live="polite">
        <span>{notice}</span>
        <span className="status-actions">
          <button type="button" onClick={dismissLoadError}>
            Dismiss
          </button>
        </span>
      </div>
    );
  }

  if (emptyField) {
    const near = nearestTarget(emptyField.raDeg, emptyField.decDeg);
    const count = emptyField.series.archive_count;
    const { problems, info } = archiveNotes(emptyField.series.warnings);
    const detail = [info.length ? `${info.join("; ")}.` : "", ...problems].filter(Boolean).join(" ");
    return (
      <div className="status" aria-live="polite">
        <span>
          SPHEREx has {count ? `${count} D${emptyField.detectorId} images` : "images"} here, but no two visits saw the same narrow band at this spot yet.
        </span>
        {detail && <span className="status-detail">{detail.charAt(0).toUpperCase() + detail.slice(1)}</span>}
        <span className="status-actions">
          {near.id !== emptyField.targetId && (
            <button type="button" onClick={() => visitTarget(near)}>
              Fly to {near.name}
            </button>
          )}
        </span>
      </div>
    );
  }

  return null;
}
