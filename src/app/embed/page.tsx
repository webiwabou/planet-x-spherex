"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SkyCanvas, ViewMode } from "@/components/SkyCanvas";
import {
  CANONICAL_TARGETS,
  CelestialTarget,
  parseCoordinates,
  SPHEREX_SURVEYS,
} from "@/lib/astronomy";
import { Play, Pause } from "lucide-react";

function EmbedContent() {
  const searchParams = useSearchParams();

  const [target, setTarget] = useState<CelestialTarget>(() => {
    const paramTarget = searchParams.get("target");
    if (paramTarget) {
      const found = CANONICAL_TARGETS.find(
        (t) => t.id === paramTarget.toLowerCase() || t.name.toLowerCase().includes(paramTarget.toLowerCase())
      );
      if (found) return found;
    }
    return CANONICAL_TARGETS[0];
  });

  const [activeEpoch, setActiveEpoch] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<ViewMode>("blink");
  const [fovArcmin, setFovArcmin] = useState<number>(target.defaultFovArcmin);

  useEffect(() => {
    const raParam = searchParams.get("ra");
    const decParam = searchParams.get("dec");
    const fovParam = searchParams.get("fov");

    if (raParam && decParam) {
      const parsed = parseCoordinates(raParam, decParam);
      setTarget((prev) => ({
        ...prev,
        raDeg: parsed.raDeg,
        decDeg: parsed.decDeg,
        raHms: parsed.raHms,
        decDms: parsed.decDms,
      }));
    }

    if (fovParam) {
      const parsedFov = parseFloat(fovParam);
      if (!isNaN(parsedFov)) setFovArcmin(parsedFov);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setActiveEpoch((prev) => (prev + 1) % SPHEREX_SURVEYS.length);
    }, 500);
    return () => clearInterval(timer);
  }, [isPlaying]);

  return (
    <div className="w-full h-screen bg-space-950 p-2 flex flex-col justify-between overflow-hidden">
      <div className="relative w-full h-full">
        <SkyCanvas
          target={target}
          activeEpoch={activeEpoch}
          viewMode={viewMode}
          selectedDetector="all"
          fovArcmin={fovArcmin}
          showGaiaOverlay={false}
          showContaminationFlags={false}
          showReticle={true}
        />

        {/* Minimalist Floating Controls for Iframe */}
        <div className="absolute bottom-3 right-3 z-20 flex items-center space-x-2 bg-space-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-space-700 text-xs font-mono">
          <button
            onClick={() => setIsPlaying((p) => !p)}
            className="p-1 rounded bg-space-800 hover:bg-space-700 text-white transition"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setViewMode((m) => (m === "blink" ? "difference" : "blink"))}
            className="px-2 py-1 rounded bg-space-800 hover:bg-space-700 text-spherex-cyan font-bold transition text-[11px]"
          >
            {viewMode === "blink" ? "Switch to ΔI" : "Switch to Blink"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div className="text-white p-4 font-mono text-xs">Loading embed viewer...</div>}>
      <EmbedContent />
    </Suspense>
  );
}
