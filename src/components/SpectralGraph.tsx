"use client";

import React, { useState } from "react";
import { CelestialTarget, generateSyntheticSED, SimulatedSpectralPoint } from "@/lib/astronomy";
import { SPHEREX_DETECTORS, MOLECULAR_FEATURES } from "@/lib/spherex-bands";
import { Activity, Info } from "lucide-react";

interface SpectralGraphProps {
  target: CelestialTarget;
}

export const SpectralGraph: React.FC<SpectralGraphProps> = ({ target }) => {
  const [hoveredPoint, setHoveredPoint] = useState<SimulatedSpectralPoint | null>(null);
  const [binnedMode, setBinnedMode] = useState<boolean>(false);

  const sedData = generateSyntheticSED(target);

  // SVG dimensions
  const svgWidth = 720;
  const svgHeight = 220;
  const padding = { top: 25, right: 30, bottom: 40, left: 55 };

  const minWl = 0.75;
  const maxWl = 5.0;

  const maxFlux = Math.max(...sedData.map((d) => d.fluxDensity)) * 1.15;
  const minFlux = 0;

  const scaleX = (wl: number) =>
    padding.left + ((wl - minWl) / (maxWl - minWl)) * (svgWidth - padding.left - padding.right);

  const scaleY = (flux: number) =>
    svgHeight - padding.bottom - ((flux - minFlux) / (maxFlux - minFlux)) * (svgHeight - padding.top - padding.bottom);

  // Polyline points
  const pointsString = sedData
    .map((d) => `${scaleX(d.wavelengthMicrons)},${scaleY(d.fluxDensity)}`)
    .join(" ");

  return (
    <div className="bg-space-900 border border-space-800 rounded-xl p-4 shadow-xl space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-space-800 pb-2.5">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-spherex-cyan" />
          <h3 className="text-sm font-semibold text-white">
            On-The-Fly Spectral Extraction (SED) &bull; 102 Bands
          </h3>
          <span className="text-xs font-mono text-slate-400">({target.name})</span>
        </div>

        {/* Feature Legend */}
        <div className="flex items-center space-x-2 text-[11px] font-mono">
          {MOLECULAR_FEATURES.map((mol) => (
            <span
              key={mol.formula}
              className="px-2 py-0.5 rounded border border-space-700 bg-space-950/60"
              style={{ color: mol.color }}
              title={mol.description}
            >
              {mol.formula}
            </span>
          ))}
        </div>
      </div>

      {/* Interactive SVG Chart */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto bg-space-950/80 rounded-lg border border-space-800"
        >
          {/* Detector array background bands */}
          {SPHEREX_DETECTORS.map((det) => {
            const x1 = scaleX(det.wavelengthMin);
            const x2 = scaleX(det.wavelengthMax);
            return (
              <g key={det.id}>
                <rect
                  x={x1}
                  y={padding.top}
                  width={x2 - x1}
                  height={svgHeight - padding.top - padding.bottom}
                  fill={det.color}
                  fillOpacity="0.04"
                />
                <text
                  x={(x1 + x2) / 2}
                  y={padding.top + 12}
                  fill={det.color}
                  fontSize="9"
                  fontFamily="monospace"
                  textAnchor="middle"
                  opacity="0.8"
                >
                  {det.code}
                </text>
              </g>
            );
          })}

          {/* Grid lines */}
          {[1.0, 2.0, 3.0, 4.0, 5.0].map((wl) => (
            <g key={wl}>
              <line
                x1={scaleX(wl)}
                y1={padding.top}
                x2={scaleX(wl)}
                y2={svgHeight - padding.bottom}
                stroke="#1e293b"
                strokeDasharray="2,2"
              />
              <text
                x={scaleX(wl)}
                y={svgHeight - padding.bottom + 15}
                fill="#64748b"
                fontSize="10"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {wl.toFixed(1)}μm
              </text>
            </g>
          ))}

          {/* Molecular absorption markers */}
          {MOLECULAR_FEATURES.flatMap((mol) =>
            mol.wavelengths.map((wl, idx) => (
              <g key={`${mol.formula}-${idx}`}>
                <line
                  x1={scaleX(wl)}
                  y1={padding.top + 16}
                  x2={scaleX(wl)}
                  y2={svgHeight - padding.bottom}
                  stroke={mol.color}
                  strokeWidth="1"
                  strokeDasharray="3,3"
                  opacity="0.5"
                />
                <text
                  x={scaleX(wl)}
                  y={padding.top + 26}
                  fill={mol.color}
                  fontSize="8"
                  fontFamily="monospace"
                  textAnchor="middle"
                  opacity="0.9"
                >
                  {mol.formula}
                </text>
              </g>
            ))
          )}

          {/* Area under spectrum */}
          <polygon
            points={`${scaleX(minWl)},${svgHeight - padding.bottom} ${pointsString} ${scaleX(maxWl)},${svgHeight - padding.bottom}`}
            fill="url(#sedGradient)"
            opacity="0.3"
          />

          {/* Spectrum Line */}
          <polyline
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            points={pointsString}
          />

          {/* Individual Band Scatter Points */}
          {sedData.map((d) => {
            const det = SPHEREX_DETECTORS.find((x) => x.id === d.detectorId);
            return (
              <circle
                key={d.bandIndex}
                cx={scaleX(d.wavelengthMicrons)}
                cy={scaleY(d.fluxDensity)}
                r="2.5"
                fill={det?.color || "#38bdf8"}
                className="cursor-pointer transition-all hover:r-5"
                onMouseEnter={() => setHoveredPoint(d)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            );
          })}

          {/* Gradients */}
          <defs>
            <linearGradient id="sedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Hover Tooltip */}
        {hoveredPoint && (
          <div
            className="absolute top-3 right-3 bg-space-900/90 border border-space-700 backdrop-blur-md px-3 py-2 rounded-lg text-xs font-mono shadow-xl"
            style={{ pointerEvents: "none" }}
          >
            <div className="text-spherex-cyan font-bold">
              Band #{hoveredPoint.bandIndex} (Detector {hoveredPoint.detectorId})
            </div>
            <div className="text-slate-300">
              &lambda;: {hoveredPoint.wavelengthMicrons.toFixed(4)} &mu;m
            </div>
            <div className="text-slate-400">
              Flux: {hoveredPoint.fluxDensity.toFixed(3)} &plusmn; {hoveredPoint.uncertainty.toFixed(4)}
            </div>
          </div>
        )}
      </div>

      {/* Target Physical Insight Note */}
      <div className="flex items-start space-x-2 text-xs bg-space-950 p-2.5 rounded-lg border border-space-800 text-slate-400">
        <Info className="w-4 h-4 text-spherex-amber flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-200">Spectrophotometric Insight: </span>
          {target.physicalInsight}
        </div>
      </div>
    </div>
  );
};
