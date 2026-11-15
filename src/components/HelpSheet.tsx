"use client";

import type { WheelMode } from "@/lib/gestures";
import { useStoreValue } from "@/lib/store";
import { app } from "@/lib/viewer";

const GESTURES: [string, string][] = [
  ["Two-finger scroll", "Pan"],
  ["Pinch or mouse wheel", "Zoom about the cursor"],
  ["Drag", "Pan, with a throw"],
  ["Option + drag", "Tilt and rotate; tilt to stack the visits"],
  ["Shift + scroll", "Scrub through time"],
  ["Swipe on the timeline", "Scrub through time"],
  ["Double click", "Zoom in. With Shift, out"],
  ["Right click", "Actions at the cursor"],
  ["Click the image", "Details for that spot"],
  ["Drag the ribbon", "Choose a detector, D1 to D6"],
  ["Drag a number", "Change it. Shift ×10, Option ÷10"],
  ["[ ]", "Visit before and after"],
  [", .", "Detector below and above"],
  ["Other keys", "Arrows, + −, Space, 0, 1 to 5, / to search"],
];

const WHEEL_MODES: [WheelMode, string][] = [
  ["auto", "Detect"],
  ["zoom", "Zoom"],
  ["pan", "Pan"],
];

export function HelpSheet({ open }: { open: boolean }) {
  const wheelMode = useStoreValue(app, (s) => s.wheelMode);
  if (!open) return null;
  return (
    <div className="help" role="dialog" aria-label="Gestures" data-native-scroll>
      <h2>Gestures</h2>
      <dl>
        {GESTURES.map(([input, action]) => (
          <div key={input} className="help-row">
            <dt>{input}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <fieldset className="wheel-mode">
        <legend>A mouse wheel means</legend>
        {WHEEL_MODES.map(([mode, label]) => (
          <label key={mode}>
            <input type="radio" name="wheel-mode" value={mode} checked={wheelMode === mode} onChange={() => app.set({ wheelMode: mode })} />
            {label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
