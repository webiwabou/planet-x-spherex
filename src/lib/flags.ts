import type { CutoutMetadata } from "./types";

const pixels = (n: number) => `${n} ${n === 1 ? "pixel" : "pixels"}`;

const GROUPS: { names: string[]; text: (n: number) => string }[] = [
  { names: ["OVERFLOW", "SUR_ERROR", "NONLINEAR"], text: (n) => `Possible saturation: ${pixels(n)} flagged and masked` },
  { names: ["PERSIST"], text: (n) => `Persistence from an earlier bright exposure on ${pixels(n)}` },
  { names: ["GHOST", "GHOST_FPA", "GHOST_EXT", "HALO"], text: (n) => `Ghost or halo from a bright source on ${pixels(n)}` },
  { names: ["BLOOM", "SNOWBALL", "STREAK"], text: (n) => `Bloom, snowball or streak on ${pixels(n)}` },
  { names: ["CROSSTALK"], text: (n) => `Crosstalk on ${pixels(n)}` },
];

// Flag counts cover each whole cutout, summed over the exposures stacked in one visit
export function flagWarnings(observations: readonly CutoutMetadata[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const o of observations) {
    for (const [name, n] of Object.entries(o.quality_flags?.active_flags ?? {})) counts.set(name, (counts.get(name) ?? 0) + n);
  }
  const out: string[] = [];
  for (const g of GROUPS) {
    const n = g.names.reduce((sum, name) => sum + (counts.get(name) ?? 0), 0);
    if (n > 0) out.push(g.text(n));
  }
  return out.slice(0, limit);
}
