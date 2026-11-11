"use client";

import React, { useState } from "react";
import { parseCoordinates, CelestialTarget } from "@/lib/astronomy";
import { Search, Share2, Check, Crosshair, AlertTriangle } from "lucide-react";

interface CoordinateSearchBarProps {
  currentCoordinates: { raDeg: number; decDeg: number; raHms: string; decDms: string };
  fovArcmin: number;
  onChangeFov: (fov: number) => void;
  showGaiaOverlay: boolean;
  onToggleGaia: () => void;
  showContaminationFlags: boolean;
  onToggleContamination: () => void;
  showReticle: boolean;
  onToggleReticle: () => void;
  onCustomCoordinateSubmit: (raDeg: number, decDeg: number, name: string) => void;
}

export const CoordinateSearchBar: React.FC<CoordinateSearchBarProps> = ({
  currentCoordinates,
  fovArcmin,
  onChangeFov,
  showGaiaOverlay,
  onToggleGaia,
  showContaminationFlags,
  onToggleContamination,
  showReticle,
  onToggleReticle,
  onCustomCoordinateSubmit,
}) => {
  const [raInput, setRaInput] = useState<string>(currentCoordinates.raHms);
  const [decInput, setDecInput] = useState<string>(currentCoordinates.decDms);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = parseCoordinates(raInput, decInput);
      setErrorMsg(null);
      onCustomCoordinateSubmit(parsed.raDeg, parsed.decDeg, "Custom Sky Patch");
    } catch (err: any) {
      setErrorMsg(err.message || "Invalid coordinates format.");
    }
  };

  const handleShareUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("ra", currentCoordinates.raDeg.toFixed(6));
    url.searchParams.set("dec", currentCoordinates.decDeg.toFixed(6));
    url.searchParams.set("fov", String(fovArcmin));
    navigator.clipboard.writeText(url.toString());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="bg-space-900 border border-space-800 rounded-xl p-4 shadow-xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Coordinate Search Form */}
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1.5 bg-space-950 px-3 py-1.5 rounded-lg border border-space-800 text-xs font-mono">
            <span className="text-slate-400">RA:</span>
            <input
              type="text"
              value={raInput}
              onChange={(e) => setRaInput(e.target.value)}
              placeholder="e.g. 08h 55m 10.8s or 133.795"
              className="bg-transparent text-white focus:outline-none w-36"
            />
          </div>

          <div className="flex items-center space-x-1.5 bg-space-950 px-3 py-1.5 rounded-lg border border-space-800 text-xs font-mono">
            <span className="text-slate-400">Dec:</span>
            <input
              type="text"
              value={decInput}
              onChange={(e) => setDecInput(e.target.value)}
              placeholder="e.g. -07d 14m 42.5s or -7.245"
              className="bg-transparent text-white focus:outline-none w-36"
            />
          </div>

          <button
            type="submit"
            className="flex items-center space-x-1 bg-spherex-cyan hover:bg-sky-400 text-space-950 font-semibold px-3 py-1.5 rounded-lg text-xs transition"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Go to Patch</span>
          </button>
        </form>

        {/* FOV and Overlays */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Field of View Selector */}
          <div className="flex items-center space-x-1 bg-space-950 px-2 py-1.5 rounded-lg border border-space-800 text-xs font-mono text-slate-400">
            <span>FOV:</span>
            {[2, 5, 8, 10, 30].map((fov) => (
              <button
                key={fov}
                onClick={() => onChangeFov(fov)}
                className={`px-1.5 py-0.5 rounded transition ${
                  fovArcmin === fov
                    ? "bg-space-800 text-spherex-cyan font-bold"
                    : "hover:text-white"
                }`}
              >
                {fov}&apos;
              </button>
            ))}
          </div>

          {/* Overlays Toggles */}
          <button
            onClick={onToggleGaia}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono transition flex items-center space-x-1 ${
              showGaiaOverlay
                ? "bg-purple-950/80 border-purple-600 text-purple-200"
                : "bg-space-950 border-space-800 text-slate-400 hover:text-white"
            }`}
            title="Toggle Gaia DR3 proper motion overlay"
          >
            <span>Gaia DR3</span>
          </button>

          <button
            onClick={onToggleContamination}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono transition flex items-center space-x-1 ${
              showContaminationFlags
                ? "bg-rose-950/80 border-rose-600 text-rose-200"
                : "bg-space-950 border-space-800 text-slate-400 hover:text-white"
            }`}
            title="Toggle Contamination Flags / Glint Masks"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Flags</span>
          </button>

          <button
            onClick={onToggleReticle}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono transition flex items-center space-x-1 ${
              showReticle
                ? "bg-space-800 border-spherex-cyan text-spherex-cyan"
                : "bg-space-950 border-space-800 text-slate-400 hover:text-white"
            }`}
            title="Toggle Celestial Crosshair"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Reticle</span>
          </button>

          {/* Share / Deep Link */}
          <button
            onClick={handleShareUrl}
            className="flex items-center space-x-1 bg-space-800 hover:bg-space-700 text-slate-200 px-3 py-1.5 rounded-lg border border-space-700 text-xs font-mono transition"
            title="Copy deep-link URL with coordinates and parameters"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copiedLink ? "Link Copied!" : "Share Link"}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="text-xs text-rose-400 font-mono bg-rose-950/40 p-2 rounded border border-rose-900/60">
          Error: {errorMsg}
        </div>
      )}
    </div>
  );
};
