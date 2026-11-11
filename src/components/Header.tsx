"use client";

import React from "react";
import { Telescope, Compass, HelpCircle, ExternalLink } from "lucide-react";

export const Header: React.FC = () => {
  return (
    <header className="border-b border-space-800 bg-space-900/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Logo and Mission Title */}
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-tr from-sky-600 to-indigo-600 rounded-lg shadow-lg">
            <Telescope className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white text-base tracking-tight">
                PLANET-X &bull; SPHEREx
              </span>
              <span className="text-[10px] font-mono uppercase bg-sky-950 text-spherex-cyan px-2 py-0.5 rounded border border-sky-800 font-semibold">
                NASA Space Apps 2026
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Time-Series Sky Blink Explorer &bull; 102 Near-Infrared Spectral Bands
            </p>
          </div>
        </div>

        {/* Challenge Badges & Links */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="hidden sm:flex items-center space-x-1.5 bg-space-950 px-3 py-1 rounded-md border border-space-800 text-slate-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Survey Cadence: 6-Month All-Sky</span>
          </div>

          <a
            href="https://spherex.caltech.edu"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1 text-slate-400 hover:text-white transition"
          >
            <span>SPHEREx Caltech</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </header>
  );
};
