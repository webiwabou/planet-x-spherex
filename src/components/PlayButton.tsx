"use client";

import { useStoreValue } from "@/lib/store";
import { app, togglePlay } from "@/lib/viewer";

export function PlayButton() {
  const playing = useStoreValue(app, (s) => s.playing);
  const ready = useStoreValue(app, (s) => {
    const f = s.activeKey ? s.fields[s.activeKey] : null;
    return !!f && f.visits.length > 1;
  });
  return (
    <button type="button" className="play" aria-label={playing ? "Pause the blink" : "Play the blink"} aria-pressed={playing} disabled={!ready} onClick={togglePlay}>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d={playing ? "M2 1h3v10H2zM7 1h3v10H7z" : "M2 1l9 5-9 5z"} />
      </svg>
    </button>
  );
}
