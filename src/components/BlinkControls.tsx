"use client";

import React from "react";
import { ViewMode } from "./SkyCanvas";
import { SPHEREX_SURVEYS } from "@/lib/astronomy";
import { SPHEREX_DETECTORS } from "@/lib/spherex-bands";
import { Play, Pause, SkipBack, SkipForward, Layers, Eye, Sparkles } from "lucide-react";

interface BlinkControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  blinkSpeedHz: number;
  onChangeSpeed: (speed: number) => void;
  activeEpoch: number;
  onSelectEpoch: (epoch: number) => void;
  viewMode: ViewMode;
  onSelectViewMode: (mode: ViewMode) => void;
  selectedDetector: number | "all";
  onSelectDetector: (detector: number | "all") => void;
}

export const BlinkControls: React.FC<BlinkControlsProps> = ({
  isPlaying,
  onTogglePlay,
  blinkSpeedHz,
  onChangeSpeed,
  activeEpoch,
  onSelectEpoch,
  viewMode,
  onSelectViewMode,
  selectedDetector,
  onSelectDetector,
}) => {
  return (
    <div className="bg-space-900 border border-space-800 rounded-xl p-4 shadow-xl space-y-4">
      {/* Top row: Playback Controls & View Mode */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Playback Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onSelectEpoch((activeEpoch - 1 + SPHEREX_SURVEYS.length) % SPHEREX_SURVEYS.length)}
            className="p-2 rounded-lg bg-space-800 hover:bg-space-700 text-slate-300 transition"
            title="Previous Epoch"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={onTogglePlay}
            className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg font-medium text-sm transition shadow-lg ${
              isPlaying
                ? "bg-amber-600 hover:bg-amber-500 text-white"
                : "bg-spherex-cyan hover:bg-sky-400 text-space-950"
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4" />
                <span>Pause Blink</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Auto Blink</span>
              </>
            )}
          </button>

          <button
            onClick={() => onSelectEpoch((activeEpoch + 1) % SPHEREX_SURVEYS.length)}
            className="p-2 rounded-lg bg-space-800 hover:bg-space-700 text-slate-300 transition"
            title="Next Epoch"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* Speed Selector */}
          <div className="flex items-center space-x-1 ml-2 bg-space-950 px-2 py-1.5 rounded-lg border border-space-800 text-xs text-slate-400 font-mono">
            <span>Rate:</span>
            {[1, 2, 3].map((speed) => (
              <button
                key={speed}
                onClick={() => onChangeSpeed(speed)}
                className={`px-1.5 py-0.5 rounded transition ${
                  blinkSpeedHz === speed
                    ? "bg-spherex-cyan text-space-950 font-bold"
                    : "hover:text-white"
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center space-x-1 bg-space-950 p-1 rounded-lg border border-space-800 text-xs font-medium">
          <button
            onClick={() => onSelectViewMode("blink")}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-md transition ${
              viewMode === "blink"
                ? "bg-space-800 text-spherex-cyan font-semibold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Blink Comparator</span>
          </button>

          <button
            onClick={() => onSelectViewMode("difference")}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-md transition ${
              viewMode === "difference"
                ? "bg-rose-950/80 text-rose-300 font-semibold border border-rose-800 shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Image Subtraction (ΔI)</span>
          </button>

          <button
            onClick={() => onSelectViewMode("stack")}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-md transition ${
              viewMode === "stack"
                ? "bg-space-800 text-spherex-amber font-semibold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Deep Stack (Coadd)</span>
          </button>
        </div>
      </div>

      {/* Survey Cadence Timeline (6-Month Intervals) */}
      <div className="pt-2 border-t border-space-800/80">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-2">
          <span>SPHEREx 6-Month Survey Epochs</span>
          <span className="text-spherex-cyan font-semibold">
            {SPHEREX_SURVEYS[activeEpoch]?.observationDate} ({SPHEREX_SURVEYS[activeEpoch]?.name})
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {SPHEREX_SURVEYS.map((survey) => (
            <button
              key={survey.epochIndex}
              onClick={() => onSelectEpoch(survey.epochIndex)}
              className={`p-2 rounded-lg border text-left transition ${
                activeEpoch === survey.epochIndex
                  ? "bg-space-800 border-spherex-cyan text-white shadow-md shadow-sky-950/40"
                  : "bg-space-950/70 border-space-800 text-slate-400 hover:border-space-700 hover:text-slate-300"
              }`}
            >
              <div className="text-xs font-semibold text-white">{survey.name}</div>
              <div className="text-[11px] text-slate-500">{survey.observationDate}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 6-Detector Array Selector (Band Stacking) */}
      <div className="pt-2 border-t border-space-800/80">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-2">
          <span>Detector Array Co-addition (SNR Optimization)</span>
          <span className="text-slate-500 text-[11px]">102 bands binned by 6 focal planes</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onSelectDetector("all")}
            className={`px-3 py-1 rounded text-xs font-mono transition ${
              selectedDetector === "all"
                ? "bg-slate-200 text-space-950 font-bold"
                : "bg-space-950 border border-space-800 text-slate-400 hover:text-white"
            }`}
          >
            All Arrays (0.75 - 5.0 μm)
          </button>
          {SPHEREX_DETECTORS.map((det) => (
            <button
              key={det.id}
              onClick={() => onSelectDetector(det.id)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition flex items-center space-x-1.5 ${
                selectedDetector === det.id
                  ? "bg-space-800 text-white border border-slate-400 font-bold"
                  : "bg-space-950 border border-space-800 text-slate-400 hover:text-white"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: det.color }}
              />
              <span>{det.code} ({det.wavelengthMin}-{det.wavelengthMax}μm)</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
