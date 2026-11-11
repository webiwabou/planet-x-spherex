"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { SkyCanvas, ViewMode } from "@/components/SkyCanvas";
import { BlinkControls } from "@/components/BlinkControls";
import { SpectralGraph } from "@/components/SpectralGraph";
import { TargetPresets } from "@/components/TargetPresets";
import { CoordinateSearchBar } from "@/components/CoordinateSearchBar";
import {
  CANONICAL_TARGETS,
  CelestialTarget,
  parseCoordinates,
  SPHEREX_SURVEYS,
} from "@/lib/astronomy";

function ExplorerContent() {
  const searchParams = useSearchParams();

  // Selected Target state
  const [target, setTarget] = useState<CelestialTarget>(() => {
    const paramTarget = searchParams.get("target");
    if (paramTarget) {
      const found = CANONICAL_TARGETS.find(
        (t) => t.id === paramTarget.toLowerCase() || t.name.toLowerCase().includes(paramTarget.toLowerCase())
      );
      if (found) return found;
    }
    // Default to WISE 0855
    return CANONICAL_TARGETS[0];
  });

  // Coordinates
  const [coordinates, setCoordinates] = useState({
    raDeg: target.raDeg,
    decDeg: target.decDeg,
    raHms: target.raHms,
    decDms: target.decDms,
  });

  // Epoch and Playback state
  const [activeEpoch, setActiveEpoch] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [blinkSpeedHz, setBlinkSpeedHz] = useState<number>(2); // 2 blinks per second

  // Display modes
  const [viewMode, setViewMode] = useState<ViewMode>("blink");
  const [selectedDetector, setSelectedDetector] = useState<number | "all">("all");
  const [fovArcmin, setFovArcmin] = useState<number>(target.defaultFovArcmin);

  // Overlays
  const [showGaiaOverlay, setShowGaiaOverlay] = useState<boolean>(false);
  const [showContaminationFlags, setShowContaminationFlags] = useState<boolean>(false);
  const [showReticle, setShowReticle] = useState<boolean>(true);

  // Sync state when URL params change on initial mount
  useEffect(() => {
    const raParam = searchParams.get("ra");
    const decParam = searchParams.get("dec");
    const fovParam = searchParams.get("fov");

    if (raParam && decParam) {
      const parsed = parseCoordinates(raParam, decParam);
      setCoordinates(parsed);
      setTarget((prev) => ({
        ...prev,
        name: "Custom Target",
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

  // Blink Timer (Time-lapse loop between survey epochs)
  useEffect(() => {
    if (!isPlaying || viewMode === "difference" || viewMode === "stack") return;

    const intervalMs = Math.round(1000 / blinkSpeedHz);
    const timer = setInterval(() => {
      setActiveEpoch((prev) => (prev + 1) % SPHEREX_SURVEYS.length);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, blinkSpeedHz, viewMode]);

  // Handle Preset Selection
  const handleSelectPreset = (newTarget: CelestialTarget) => {
    setTarget(newTarget);
    setCoordinates({
      raDeg: newTarget.raDeg,
      decDeg: newTarget.decDeg,
      raHms: newTarget.raHms,
      decDms: newTarget.decDms,
    });
    setFovArcmin(newTarget.defaultFovArcmin);
  };

  // Handle Custom Coordinate Input
  const handleCustomCoordinates = (raDeg: number, decDeg: number, name: string) => {
    const parsed = parseCoordinates(raDeg, decDeg);
    setCoordinates(parsed);
    setTarget({
      id: "custom-target",
      name: name || "Custom Coordinates",
      designation: "User Coordinates",
      category: "High Proper Motion",
      raDeg: parsed.raDeg,
      decDeg: parsed.decDeg,
      raHms: parsed.raHms,
      decDms: parsed.decDms,
      pmRaMasYr: 1000.0, // Default mock PM
      pmDecMasYr: 500.0,
      defaultFovArcmin: fovArcmin,
      recommendedDetectors: [1, 2, 3, 4, 5, 6],
      description: "User specified sky patch coordinates for SPHEREx time-series examination.",
      physicalInsight: "Inspect difference residual and spectral bands for possible high proper motion objects or variables.",
    });
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-5 w-full space-y-4">
        {/* Presets Bar */}
        <TargetPresets
          selectedTargetId={target.id}
          onSelectTarget={handleSelectPreset}
        />

        {/* Search Bar and Overlays */}
        <CoordinateSearchBar
          currentCoordinates={coordinates}
          fovArcmin={fovArcmin}
          onChangeFov={setFovArcmin}
          showGaiaOverlay={showGaiaOverlay}
          onToggleGaia={() => setShowGaiaOverlay((v) => !v)}
          showContaminationFlags={showContaminationFlags}
          onToggleContamination={() => setShowContaminationFlags((v) => !v)}
          showReticle={showReticle}
          onToggleReticle={() => setShowReticle((v) => !v)}
          onCustomCoordinateSubmit={handleCustomCoordinates}
        />

        {/* Center Grid: Viewport and Playback Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Main Sky Canvas Viewport */}
          <div className="lg:col-span-7 xl:col-span-8">
            <SkyCanvas
              target={target}
              activeEpoch={activeEpoch}
              viewMode={viewMode}
              selectedDetector={selectedDetector}
              fovArcmin={fovArcmin}
              showGaiaOverlay={showGaiaOverlay}
              showContaminationFlags={showContaminationFlags}
              showReticle={showReticle}
            />
          </div>

          {/* Right Control Panel: Blink, Cadence, Detectors */}
          <div className="lg:col-span-5 xl:col-span-4">
            <BlinkControls
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying((p) => !p)}
              blinkSpeedHz={blinkSpeedHz}
              onChangeSpeed={setBlinkSpeedHz}
              activeEpoch={activeEpoch}
              onSelectEpoch={(ep) => {
                setIsPlaying(false);
                setActiveEpoch(ep);
              }}
              viewMode={viewMode}
              onSelectViewMode={setViewMode}
              selectedDetector={selectedDetector}
              onSelectDetector={setSelectedDetector}
            />
          </div>
        </div>

        {/* Bottom Section: 102-Band Spectral SED */}
        <SpectralGraph target={target} />
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 font-mono">Loading SPHEREx Sky Viewer...</div>}>
      <ExplorerContent />
    </Suspense>
  );
}
