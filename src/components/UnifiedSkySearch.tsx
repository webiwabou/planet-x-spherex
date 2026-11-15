
"use client";

import { useEffect, useRef, useState } from "react";
import targetsData from "../../resources/gaia/targets.json";

const FOV_OPTIONS = [1, 2, 5, 10] as const;

type ResolvedSkyPosition = {
  raDeg: number;
  decDeg: number;
  fovArcmin: number;
  targetName?: string;
};

type Props = {
  initialFov?: number;
  onResolve: (position: ResolvedSkyPosition) => void;
};

type Target = {
  id: string;
  name: string;
  ra_deg: number;
  dec_deg: number;
};

const TARGETS: Target[] = targetsData.targets;

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function findTarget(query: string): Target | undefined {
  const aliases: Record<string, string> = {
    barnard: "barnards_star",
    barnardsstar: "barnards_star",
    epsilonindib: "epsilon_indi_b",
    epsindb: "epsilon_indi_b",
    wise0855: "wise_0855",
    wisej085510830714425: "wise_0855",
    rwaur: "rw_aurigae",
    rwaurigae: "rw_aurigae",
    rdra: "r_draconis",
    rdraconis: "r_draconis",
  };

  const normalized = normalizeName(query);
  const id = aliases[normalized];

  return TARGETS.find(
    (target) =>
      target.id === id ||
      normalizeName(target.name) === normalized
  );
}

function splitCoordinatePair(
  query: string
): [string, string] | null {
  const trimmed = query.trim();

  // Comma or semicolon separates RA and Dec.
  const separated = trimmed.split(/\s*[,;]\s*/);

  if (separated.length === 2 && separated.every(Boolean)) {
    return [separated[0], separated[1]];
  }

  // Two decimal degree values separated by whitespace.
  const decimal = trimmed.match(
    /^([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)$/
  );

  if (decimal) {
    return [decimal[1], decimal[2]];
  }

  // Sexagesimal RA and signed Dec, separated by whitespace.
  const sexagesimal = trimmed.match(
    /^(.+?)\s+([+-]\d{1,2}(?::|\s|d|°).*)$/i
  );

  if (sexagesimal) {
    return [
      sexagesimal[1].trim(),
      sexagesimal[2].trim(),
    ];
  }

  return null;
}

function nearestFov(value: number) {
  return FOV_OPTIONS.reduce((closest, option) =>
    Math.abs(option - value) < Math.abs(closest - value)
      ? option
      : closest
  );
}

export default function UnifiedSkySearch({
  initialFov = 5,
  onResolve,
}: Props) {
  const [query, setQuery] = useState("");
  const [fov, setFov] = useState<number>(
    nearestFov(initialFov)
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          target?.tagName ?? ""
        );

      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isEditing
      ) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleShortcut);

    return () =>
      window.removeEventListener("keydown", handleShortcut);
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const text = query.trim();

    if (!text) {
      setError("Enter an object name or sky coordinates.");
      return;
    }

    const target = findTarget(text);

    if (target) {
      onResolve({
        raDeg: target.ra_deg,
        decDeg: target.dec_deg,
        fovArcmin: fov,
        targetName: target.name,
      });
      return;
    }

    const pair = splitCoordinatePair(text);

    if (!pair) {
      setError(
        "Enter RA and Dec separated by a comma, or choose a supported object name."
      );
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams({
        ra: pair[0],
        dec: pair[1],
      });

      const response = await fetch(
        `/api/astro/resolve?${params.toString()}`
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : "Invalid coordinates."
        );
      }

      onResolve({
        raDeg: result.ra_deg,
        decDeg: result.dec_deg,
        fovArcmin: fov,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to resolve coordinates."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3"
      role="search"
    >
      <label
        htmlFor="sky-search"
        className="block text-sm font-medium"
      >
        Search the sky
      </label>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          id="sky-search"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Object name or RA, Dec — press /"
          className="min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white"
        />

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-cyan-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <label htmlFor="sky-fov" className="text-sm">
          Field of view
        </label>

        <input
          id="sky-fov"
          type="range"
          min={0}
          max={FOV_OPTIONS.length - 1}
          step={1}
          value={FOV_OPTIONS.indexOf(
            fov as (typeof FOV_OPTIONS)[number]
          )}
          onChange={(event) =>
            setFov(FOV_OPTIONS[Number(event.target.value)])
          }
          className="w-36"
        />

        <output className="text-sm font-medium">
          {fov}′
        </output>
      </div>
    </form>
  );
}

