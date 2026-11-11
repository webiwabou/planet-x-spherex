"use client";

import React, { useRef, useEffect, useState } from "react";
import { CelestialTarget, SPHEREX_SURVEYS } from "@/lib/astronomy";

export type ViewMode = "blink" | "difference" | "stack" | "split";

interface SkyCanvasProps {
  target: CelestialTarget;
  activeEpoch: number;
  viewMode: ViewMode;
  selectedDetector: number | "all";
  fovArcmin: number;
  showGaiaOverlay: boolean;
  showContaminationFlags: boolean;
  showReticle: boolean;
}

export const SkyCanvas: React.FC<SkyCanvasProps> = ({
  target,
  activeEpoch,
  viewMode,
  selectedDetector,
  fovArcmin,
  showGaiaOverlay,
  showContaminationFlags,
  showReticle,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverCoord, setHoverCoord] = useState<{ ra: string; dec: string } | null>(null);

  // Reset pan/zoom when target changes
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1.0);
  }, [target.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Deep space dark background
    ctx.fillStyle = "#05070f";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
    ctx.scale(zoom, zoom);

    // Scale calculation: pixels per arcsecond
    // Base viewport is roughly 400px representing fovArcmin * 60 arcsec
    const totalArcsec = Math.max(10, fovArcmin * 60);
    const pxPerArcsec = 380 / totalArcsec;

    // Epoch progression
    const currentSurvey = SPHEREX_SURVEYS[activeEpoch] || SPHEREX_SURVEYS[0];
    const prevSurvey = SPHEREX_SURVEYS[Math.max(0, activeEpoch - 1)];

    // Target proper motion displacement (arcseconds)
    const dtYears = currentSurvey.deltaYearsFromT0;
    const shiftX_arcsec = (target.pmRaMasYr / 1000.0) * dtYears;
    const shiftY_arcsec = -(target.pmDecMasYr / 1000.0) * dtYears; // Dec increases upward

    const prevDt = prevSurvey.deltaYearsFromT0;
    const prevShiftX_arcsec = (target.pmRaMasYr / 1000.0) * prevDt;
    const prevShiftY_arcsec = -(target.pmDecMasYr / 1000.0) * prevDt;

    // Static Background Stars (seeded grid)
    drawBackgroundStars(ctx, width, height, target.id);

    // Render depending on viewMode
    if (viewMode === "difference") {
      drawDifferenceMode(
        ctx,
        shiftX_arcsec * pxPerArcsec,
        shiftY_arcsec * pxPerArcsec,
        prevShiftX_arcsec * pxPerArcsec,
        prevShiftY_arcsec * pxPerArcsec,
        target
      );
    } else {
      // Normal Blink or Stack mode
      drawTargetSource(
        ctx,
        shiftX_arcsec * pxPerArcsec,
        shiftY_arcsec * pxPerArcsec,
        target,
        selectedDetector,
        activeEpoch
      );
    }

    // Gaia DR3 Proper Motion Vector Overlay
    if (showGaiaOverlay) {
      drawGaiaOverlay(
        ctx,
        shiftX_arcsec * pxPerArcsec,
        shiftY_arcsec * pxPerArcsec,
        target.pmRaMasYr,
        target.pmDecMasYr,
        pxPerArcsec
      );
    }

    // Contamination Flags / Mask Simulation
    if (showContaminationFlags) {
      drawContaminationFlags(ctx);
    }

    ctx.restore();

    // Render HUD and Reticle
    if (showReticle) {
      drawReticle(ctx, width, height);
    }
    drawScaleBar(ctx, width, height, pxPerArcsec * zoom, fovArcmin);
  }, [
    target,
    activeEpoch,
    viewMode,
    selectedDetector,
    fovArcmin,
    zoom,
    pan,
    showGaiaOverlay,
    showContaminationFlags,
    showReticle,
  ]);

  const drawBackgroundStars = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    seedStr: string
  ) => {
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    ctx.fillStyle = "rgba(220, 230, 255, 0.75)";
    for (let i = 0; i < 45; i++) {
      const sx = (rng() - 0.5) * w * 1.5;
      const sy = (rng() - 0.5) * h * 1.5;
      const radius = rng() * 1.8 + 0.6;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const drawTargetSource = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tgt: CelestialTarget,
    detector: number | "all",
    epoch: number
  ) => {
    // Determine color and radius based on detector / target type
    let color = "#38bdf8"; // Default cyan
    let radius = 7;

    if (tgt.category === "Brown Dwarf") {
      color = "#fb923c"; // Infrarrojo cálido (WISE 0855 / Epsilon Indi B)
      radius = detector === 5 || detector === 6 || detector === "all" ? 9 : 4;
    } else if (tgt.category === "Variable Star") {
      color = "#f43f5e";
      // Variable brightness based on epoch
      radius = 5 + Math.sin(epoch * 1.8) * 3.5;
    }

    // Glow gradient
    const gradient = ctx.createRadialGradient(x, y, 1, x, y, radius * 3.5);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.4, color + "aa");
    gradient.addColorStop(1, "transparent");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius * 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Sharp central core
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Source Label
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "11px monospace";
    ctx.fillText(tgt.name, x + radius + 6, y - 6);
  };

  const drawDifferenceMode = (
    ctx: CanvasRenderingContext2D,
    currX: number,
    currY: number,
    prevX: number,
    prevY: number,
    tgt: CelestialTarget
  ) => {
    if (tgt.category === "Variable Star") {
      // Monopole residual: stationary positive or negative residual
      ctx.fillStyle = "rgba(244, 63, 94, 0.85)"; // Bright red residual
      ctx.beginPath();
      ctx.arc(currX, currY, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "10px monospace";
      ctx.fillText("FLUX MONOPOLE RESIDUAL (Variable Star)", currX + 14, currY + 4);
      return;
    }

    // Moving source dipole: Blue well (negative previous position), Red peak (positive current position)
    // Blue well (T1)
    const gradBlue = ctx.createRadialGradient(prevX, prevY, 1, prevX, prevY, 16);
    gradBlue.addColorStop(0, "#38bdf8");
    gradBlue.addColorStop(0.6, "rgba(56, 189, 248, 0.4)");
    gradBlue.addColorStop(1, "transparent");
    ctx.fillStyle = gradBlue;
    ctx.beginPath();
    ctx.arc(prevX, prevY, 16, 0, Math.PI * 2);
    ctx.fill();

    // Red peak (T2)
    const gradRed = ctx.createRadialGradient(currX, currY, 1, currX, currY, 16);
    gradRed.addColorStop(0, "#f43f5e");
    gradRed.addColorStop(0.6, "rgba(244, 63, 94, 0.4)");
    gradRed.addColorStop(1, "transparent");
    ctx.fillStyle = gradRed;
    ctx.beginPath();
    ctx.arc(currX, currY, 16, 0, Math.PI * 2);
    ctx.fill();

    // Dipole indicator line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(currX, currY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "10px monospace";
    ctx.fillText("T_prev (Trough)", prevX - 35, prevY - 12);

    ctx.fillStyle = "#f43f5e";
    ctx.fillText("T_curr (Peak)", currX + 12, currY + 12);
  };

  const drawGaiaOverlay = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    pmRa: number,
    pmDec: number,
    pxPerArcsec: number
  ) => {
    // Gaia circle
    ctx.strokeStyle = "#a855f7"; // Purple
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.stroke();

    // Gaia motion arrow (amplified 5x for visual clarity)
    const arrowX = x + (pmRa / 1000.0) * pxPerArcsec * 3;
    const arrowY = y - (pmDec / 1000.0) * pxPerArcsec * 3;

    ctx.strokeStyle = "#c084fc";
    ctx.fillStyle = "#c084fc";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(arrowX, arrowY);
    ctx.stroke();

    // Draw arrowhead
    const angle = Math.atan2(arrowY - y, arrowX - x);
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX - 8 * Math.cos(angle - Math.PI / 6), arrowY - 8 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(arrowX - 8 * Math.cos(angle + Math.PI / 6), arrowY - 8 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#c084fc";
    ctx.font = "10px monospace";
    ctx.fillText("Gaia DR3 PM Vector", arrowX + 8, arrowY);
  };

  const drawContaminationFlags = (ctx: CanvasRenderingContext2D) => {
    // Simulated optical glint / diffraction spike artifact
    ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.strokeRect(-120, -100, 45, 45);
    ctx.fillStyle = "rgba(239, 68, 68, 0.8)";
    ctx.font = "9px monospace";
    ctx.fillText("[FLAG: Stray Light / Glint]", -120, -105);

    ctx.setLineDash([]);
  };

  const drawReticle = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
    ctx.lineWidth = 1;

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx, cy + 20);
    ctx.stroke();

    // Center circular reticle
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.stroke();
  };

  const drawScaleBar = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    scaledPxPerArcsec: number,
    fov: number
  ) => {
    // Scale bar in bottom right
    const barArcsec = fov >= 10 ? 60 : 10; // 1 arcmin or 10 arcsec
    const barPx = barArcsec * scaledPxPerArcsec;
    const startX = w - barPx - 25;
    const startY = h - 25;

    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + barPx, startY);
    ctx.moveTo(startX, startY - 4);
    ctx.lineTo(startX, startY + 4);
    ctx.moveTo(startX + barPx, startY - 4);
    ctx.lineTo(startX + barPx, startY + 4);
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px monospace";
    const label = barArcsec >= 60 ? `${(barArcsec / 60).toFixed(0)} arcmin` : `${barArcsec} arcsec`;
    ctx.fillText(label, startX + barPx / 2 - 20, startY - 8);
  };

  // Drag and zoom interaction
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    setZoom((prev) => Math.min(5.0, Math.max(0.5, prev * factor)));
  };

  return (
    <div className="relative w-full h-[480px] bg-space-950 border border-space-800 rounded-xl overflow-hidden shadow-2xl flex flex-col justify-between">
      {/* Top Overlay Bar */}
      <div className="absolute top-3 left-3 z-10 flex items-center space-x-2 bg-space-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-space-700 text-xs font-mono text-slate-300">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-spherex-cyan animate-pulse"></span>
        <span className="font-semibold text-white">{target.name}</span>
        <span className="text-slate-500">|</span>
        <span>Epoch: {SPHEREX_SURVEYS[activeEpoch]?.name}</span>
        <span className="text-slate-500">|</span>
        <span className="uppercase text-spherex-amber">Mode: {viewMode}</span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={720}
        height={480}
        className="w-full h-full cursor-grab active:cursor-grabbing block"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Floating Zoom & Reset Buttons */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center space-x-1.5 bg-space-900/85 backdrop-blur-md p-1 rounded-lg border border-space-700 text-xs font-mono text-slate-300">
        <button
          onClick={() => setZoom((z) => Math.min(5.0, z * 1.25))}
          className="px-2 py-1 bg-space-800 hover:bg-space-700 rounded transition"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.5, z * 0.8))}
          className="px-2 py-1 bg-space-800 hover:bg-space-700 rounded transition"
          title="Zoom Out"
        >
          -
        </button>
        <button
          onClick={() => {
            setZoom(1.0);
            setPan({ x: 0, y: 0 });
          }}
          className="px-2 py-1 bg-space-800 hover:bg-space-700 rounded transition text-[11px]"
          title="Reset View"
        >
          Reset
        </button>
        <span className="px-1.5 text-slate-400">{(zoom * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
};
