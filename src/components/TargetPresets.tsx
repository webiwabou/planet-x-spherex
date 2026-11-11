"use client";

import React from "react";
import { CANONICAL_TARGETS, CelestialTarget } from "@/lib/astronomy";
import { Compass, Star, Radio } from "lucide-react";

interface TargetPresetsProps {
  selectedTargetId: string;
  onSelectTarget: (target: CelestialTarget) => void;
}

export const TargetPresets: React.FC<TargetPresetsProps> = ({
  selectedTargetId,
  onSelectTarget,
}) => {
  return (
    <div className="bg-space-900 border border-space-800 rounded-xl p-4 shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Star className="w-4 h-4 text-spherex-amber" />
          <h3 className="text-sm font-semibold text-white">
            Benchmark Targets (NASA Challenge Presets)
          </h3>
        </div>
        <span className="text-xs text-slate-500 font-mono">5 Required Test Cases</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
        {CANONICAL_TARGETS.map((target) => {
          const isSelected = selectedTargetId === target.id;
          return (
            <button
              key={target.id}
              onClick={() => onSelectTarget(target)}
              className={`p-3 rounded-lg border text-left transition relative flex flex-col justify-between ${
                isSelected
                  ? "bg-space-800 border-spherex-cyan shadow-lg shadow-sky-950/50"
                  : "bg-space-950/80 border-space-800 hover:border-space-700 hover:bg-space-900/60"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white truncate">{target.name}</span>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-spherex-cyan animate-pulse"></span>
                  )}
                </div>
                <div className="text-[10px] uppercase font-mono tracking-wider text-spherex-cyan mb-1.5">
                  {target.category}
                </div>
                <div className="text-[11px] text-slate-400 font-mono leading-tight mb-2">
                  <div>RA: {target.raHms.split(" ")[0]} {target.raHms.split(" ")[1]}</div>
                  <div>Dec: {target.decDms.split(" ")[0]} {target.decDms.split(" ")[1]}</div>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 line-clamp-2 border-t border-space-800/80 pt-1.5">
                {target.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
